# execd — In-Container Execution Daemon

> Navigation: [Root](../../CLAUDE.md) | [Components](../CLAUDE.md)

## Purpose

Gin-based HTTP server that runs inside every sandbox container. It exposes shell execution, PTY sessions, Jupyter/code-interpreter kernels, and filesystem operations over a REST API. `claude-agent-server` (and other tooling) talk to execd to run code and manipulate files.

Does **not** own: session management for Claude prompts (that's `claude-agent-server`), network policy (that's `egress`), or container lifecycle (that's `opensandbox_server`).

## Entry Points

- `main.go` — init flags, telemetry, code runner, start Gin on `:<PORT>`
- `pkg/web/router.go` — all route registrations; the definitive list of endpoints
- `pkg/web/controller/` — one file per route group (command, code, filesystem, pty, metric)

## Directory Map

```
execd/
  main.go
  pkg/
    flag/           CLI flags (port, log level, access token, …)
    log/            Logger singleton
    clone3compat/   Seccomp workaround for older kernels that return ENOSYS for clone3
    telemetry/      OTEL metrics init
    runtime/
      command.go          Foreground shell command execution (runCommand)
      command.go (bg)     Background command execution (runBackgroundCommand)
      bash_session.go     Stateful bash sessions (keepalive stdin/stdout)
      context.go          Execution context (session/kernel tracking)
      ctrl.go             Controller: storeCommandKernel, markCommandFinished, tailStdPipe
      env.go              Extra env var loading (from file + per-request)
      errors.go           Execution error types
    jupyter/
      auth/           Jupyter token auth (acquire/renew)
      client.go       HTTP client for Jupyter REST API
      session/        Jupyter session lifecycle (create, run, delete)
      kernel/         Kernel status types
      execute/        Execute request/response types + executor
      transport.go    Low-level Jupyter HTTP transport
    web/
      router.go       Route definitions (gin.Engine)
      controller/
        command.go          POST /command, DELETE /command, GET /command/status/:id, GET /command/:id/logs
        codeinterpreting.go POST /code, DELETE /code, context CRUD, session CRUD, RunInSession
        filesystem.go       GET/POST/DELETE /files, /directories
        filesystem_upload.go  POST /files/upload
        filesystem_download.go GET /files/download
        pty_controller.go   POST/GET/DELETE /pty/:sessionId
        pty_ws.go           GET /pty/:sessionId/ws (WebSocket)
        metric.go           GET /metrics, GET /metrics/watch
        basic.go            GET /ping
        sse.go              SSE helpers for streaming output
      model/          Request/response structs for all route groups
      otel_middleware.go    OTEL HTTP metrics middleware
      proxy.go              ProxyMiddleware (internal routing)
```

## Endpoint Map

| Method | Path | Description |
|---|---|---|
| GET | `/ping` | Health check |
| GET | `/files/info` | Stat one or more files |
| DELETE | `/files` | Delete files |
| POST | `/files/mv` | Rename/move files |
| POST | `/files/permissions` | chmod |
| GET | `/files/search` | Search files by name/content |
| POST | `/files/replace` | Find-and-replace in file content |
| POST | `/files/upload` | Upload a file (multipart) |
| GET | `/files/download` | Download a file |
| POST | `/directories` | Create directory (mkdir -p) |
| DELETE | `/directories` | Remove directory |
| POST | `/code` | Run code in a kernel context (SSE output) |
| DELETE | `/code` | Interrupt running code |
| POST | `/code/context` | Create a new kernel context |
| GET | `/code/contexts` | List kernel contexts |
| DELETE | `/code/contexts` | Delete contexts by language |
| DELETE | `/code/contexts/:contextId` | Delete a specific context |
| GET | `/code/contexts/:contextId` | Get context status |
| POST | `/session` | Create stateful execution session |
| POST | `/session/:sessionId/run` | Run code in an existing session |
| DELETE | `/session/:sessionId` | Delete session |
| POST | `/command` | Run foreground shell command (SSE output) |
| DELETE | `/command` | Interrupt running command |
| GET | `/command/status/:id` | Get command exit status |
| GET | `/command/:id/logs` | Get background command output |
| GET | `/metrics` | CPU/memory/disk snapshot |
| GET | `/metrics/watch` | Stream metrics (SSE) |
| POST | `/pty` | Create PTY session |
| GET | `/pty/:sessionId` | Get PTY session status |
| DELETE | `/pty/:sessionId` | Delete PTY session |
| GET | `/pty/:sessionId/ws` | PTY WebSocket (bidirectional terminal) |

## Key Flows

### 1. Foreground shell command (`POST /command`)

1. `RunCommand()` in `codeinterpreting.go` → `controller.runCommand(ctx, request)`
2. `exec.CommandContext(shell, "-c", code)` with `Setpgid: true` for signal isolation
3. stdout/stderr tailed via goroutines → SSE events streamed to caller
4. `storeCommandKernel()` registers the PID; `markCommandFinished()` records exit code
5. Signals received by execd are forwarded to the child process group (except `SIGCHLD`, `SIGURG`)

### 2. Background command (`POST /command` with `background: true`)

Similar to foreground but:
- Goroutine monitors `cmd.Wait()` without blocking the HTTP response
- Output goes to a combined file; caller polls `/command/:id/logs`
- `ctx` is cancelled (and SIGKILL sent to pgid) when the context deadline fires

### 3. Jupyter code execution (`POST /code`)

1. Create or reuse a kernel context (`POST /code/context`)
2. `RunCode()` acquires Jupyter auth token if needed
3. Submits execute request to local Jupyter server via `jupyter/execute`
4. Streams output cells back as SSE events

### 4. PTY session (`POST /pty` → WebSocket)

1. `CreatePTYSession()` allocates a PTY, starts a shell in it
2. Caller upgrades to WebSocket (`GET /pty/:sessionId/ws`)
3. Bidirectional: WebSocket frames → PTY stdin; PTY stdout → WebSocket frames
4. Resize messages (client-sent) call `ioctl TIOCSWINSZ`

## Interfaces and Dependencies

- **Auth**: optional `X-Access-Token` header (empty token = no auth); enforced by `accessTokenMiddleware`
- **Output streaming**: SSE via `controller/sse.go` — all long-running commands stream output as `text/event-stream`
- **`clone3compat`**: applied before anything else in `main.go`; may add a seccomp filter to map `clone3` syscalls to `clone` for older kernels (logged as a warning)
- **`safego.Go`**: all background goroutines use this instead of bare `go` — panics are recovered and logged

## Tests

```bash
cd opensandbox_components/execd
go test ./...                            # all unit tests
go test ./pkg/runtime/...               # command + bash session tests
go test ./pkg/jupyter/...               # Jupyter client tests (some need a live kernel: *_integration_test.go)
go test ./pkg/web/controller/...        # HTTP handler tests
```

Integration tests (`*_integration_test.go`, `*_live_integration_test.go`) require a running Jupyter server and are skipped in CI unless a kernel is available.

## Working Notes

- **Process group signals**: `Setpgid: true` is critical — without it, `Kill(-pid, sig)` won't reach the entire subprocess tree. Do not remove it.
- **SIGURG exclusion**: Go's runtime uses `SIGURG` for goroutine preemption; forwarding it to child processes causes spurious interrupts. It is explicitly excluded in the signal-forwarding loop.
- **Shell fallback**: `getShell()` prefers `bash` but falls back to `sh` for Alpine images. Command strings must be POSIX-compatible if sh compatibility matters.
- **Kernel contexts vs sessions**: a "context" is a Jupyter kernel; a "session" is a stateful bash shell. They are separate concepts handled by the same controller.
- **`tailStdPipe`**: tails a file-backed stdout/stderr and calls the SSE callback. The file approach avoids pipe blocking and allows late-joining readers (e.g. `GET /command/:id/logs`).

## Scan Snapshot

- Date: 2026-04-26
- Scope: main.go, router.go, all controller/*.go, runtime/{command,bash_session,ctrl,context,env}.go, jupyter layout, flag/flags.go
