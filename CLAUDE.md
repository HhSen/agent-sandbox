# agent-sandbox — Workspace Index

## How To Use This Index

- Use this file for repository shape, startup, build/run, and cross-module flows.
- Treat each local `CLAUDE.md` as the source of truth for its module.
- Move from root orientation to the nearest local guide before editing.

## Project Overview

A sandbox platform that runs isolated Claude Code sessions inside Docker containers. The **opensandbox-server** (Python) acts as the control plane: it manages container lifecycle, networking, and storage. Each container runs the **code-interpreter** image, which bundles a Node.js HTTP server (`claude-agent-server`) that exposes Claude Code sessions over a REST + SSE API.

## Code Structure

```
agent-sandbox/
├── docker-compose.yaml                # Orchestrates opensandbox-server + image builds
├── docker/
│   ├── code-interpreter/              # Main sandbox image (Ubuntu + Python + Node + claude-agent-server)
│   │   ├── Dockerfile                 # 4-stage build; context must be repo root
│   │   ├── bootstrap.sh               # Starts execd, then exec's CMD
│   │   ├── entrypoint.sh              # Mounts orangefs (optional), starts claude-agent-server
│   │   └── code-interpreter-env.sh    # Exports correct Node/Python version to PATH
│   └── opensandbox/
│       ├── Dockerfile                 # Builds opensandbox-server image
│       └── config.toml                # Runtime config mounted at /etc/opensandbox/config.toml
├── claude-agent-server/               # TypeScript HTTP wrapper around @anthropic-ai/claude-agent-sdk
│   └── CLAUDE.md                      # Full guide — read this before touching claude-agent-server/
├── opensandbox_server/                # Python FastAPI control plane (container management API)
│   └── opensandbox_server/
│       ├── main.py                    # FastAPI app + config loading
│       ├── cli.py                     # CLI entry point (opensandbox-server binary)
│       ├── config.py                  # Pydantic config models + TOML loading
│       └── examples/                  # Packaged example config templates
└── opensandbox_components/            # Go binaries that run inside or alongside containers
    ├── execd/                         # Process/code-execution daemon (runs inside container)
    ├── egress/                        # Outbound network control proxy (runs inside container)
    ├── ingress/                       # Inbound HTTP proxy for routing into containers
    └── internal/                      # Shared Go utilities (logger, telemetry, safego)
```

## Module Ownership

| Path | Owns |
|---|---|
| `claude-agent-server/` | HTTP API exposing Claude Code sessions (TypeScript + Express) |
| `opensandbox_server/` | Container lifecycle: create, delete, exec, storage, networking (Python + FastAPI) |
| `opensandbox_components/execd/` | In-container daemon: shell, PTY, Jupyter, file ops (Go) |
| `opensandbox_components/egress/` | In-container outbound network policy + DNS proxy (Go) |
| `opensandbox_components/ingress/` | Sidecar HTTP proxy for inbound connections to containers (Go) |
| `opensandbox_components/internal/` | Shared Go utilities only — no business logic |
| `docker/` | Dockerfile definitions and runtime configs for the two main images |

## Cross-Module Flows

### 1. Container creation and session start

1. Caller POSTs to **opensandbox-server** (`POST /sandboxes`) with image + resource config.
2. opensandbox-server pulls `opensandbox/code-interpreter:local`, creates a Docker container.
3. Container starts: **bootstrap.sh** spawns `execd` in the background, then calls the container's CMD.
4. CMD is `["/entrypoint.sh"]` (set by the caller): optionally mounts orangefs, then starts `claude-agent-server` on port 3000.
5. Caller now sends Claude prompts directly to the container's port 3000 REST API.

### 2. Prompt execution (streaming)

1. Client POSTs `{ prompt, stream: true }` to `POST /sessions` on **claude-agent-server**.
2. `session-service.ts` calls `query()` on `@anthropic-ai/claude-agent-sdk`.
3. SDK messages are normalized and emitted as SSE events in real time.
4. Client receives `session.completed` event when the run finishes.

### 3. Sandbox image build (one-time setup)

```bash
# Build runtime images before first run
docker compose build --profile sandbox-images
# Then start the control plane
docker compose up opensandbox-server
```

## Repo-Wide Conventions

- **TypeScript** (`claude-agent-server`): NodeNext module resolution — all local imports use `.js` extensions.
- **Python** (`opensandbox_server`): absolute imports only (`opensandbox_server.*`); uv for dependency management.
- **Go** (`opensandbox_components`): each component is its own Go module; `internal/` is a shared module.
- All Docker build contexts are **repo root** — COPY paths are relative to root.
- `docker-compose.yaml` uses `profiles: [sandbox-images]` to separate build-only services from runtime services.

## Build And Run

### First time — build sandbox images

```bash
docker compose build --profile sandbox-images
```

### Start the control plane

```bash
docker compose up opensandbox-server
# opensandbox-server listens on ${OPENSANDBOX_PORT:-8090}
```

### Develop claude-agent-server locally

```bash
cd claude-agent-server
npm install
npm run dev          # hot-reload via tsx watch
npm run build        # compile to dist/
npm run check        # type-check only
npx vitest run       # run tests
```

### Build individual Go components

```bash
cd opensandbox_components/execd && ./build.sh
cd opensandbox_components/egress && ./build.sh
cd opensandbox_components/ingress && ./build.sh
```

## Startup Sequence (inside a running container)

1. `bootstrap.sh` — starts `execd` (background), then `exec`s the caller-provided CMD.
2. `entrypoint.sh` (the CMD) — sources `code-interpreter-env.sh` to set Node PATH, optionally mounts orangefs, then runs `node /app/dist/server.js`.
3. `claude-agent-server` — binds on `PORT` (default 3000), ready to accept session requests.

## Key Environment Variables

| Variable | Service | Default | Notes |
|---|---|---|---|
| `OPENSANDBOX_PORT` | opensandbox-server | `8090` | Host port for control plane API |
| `SANDBOX_CONFIG_PATH` | opensandbox-server | `~/.sandbox.toml` | Path to TOML config |
| `PORT` | claude-agent-server | `3000` | Port inside container |
| `CLAUDE_WRAPPER_REQUIRE_AUTH_TOKEN` | claude-agent-server | — | Enforce Bearer auth when set |
| `ORANGEFS_RS_ADDR` / `ORANGEFS_TOKEN` / `ORANGEFS_VOLUME` | entrypoint.sh | — | Shared-workspace mount (optional) |
| `USERNAME` / `SESSION_ID` | entrypoint.sh | — | Used for workspace mount path |

## Operational Notes

- **`docker.sock` bind mount** is required for opensandbox-server to spawn containers; see `docker-compose.yaml`.
- **`privileged: true`** is set in `docker/opensandbox/config.toml` for container sandboxes — required for FUSE/orangefs and network namespacing.
- **egress/ingress are not started by docker-compose**; they run inside or alongside individual sandbox containers as configured by opensandbox-server.
- **orangefs** (shared workspace) is optional; `entrypoint.sh` skips the mount if `/usr/local/bin/orangefs` is absent.
- The APT mirror fallback chain in `docker/code-interpreter/Dockerfile` (Aliyun → TUNA → USTC → upstream) is specific to the original deployment environment — remove if not needed.

## Local Guides

- [`claude-agent-server/CLAUDE.md`](claude-agent-server/CLAUDE.md) — full guide for the TypeScript HTTP server
- [`claude-agent-server/src/lib/CLAUDE.md`](claude-agent-server/src/lib/CLAUDE.md) — config singleton, logger
- [`claude-agent-server/src/lib/claude/CLAUDE.md`](claude-agent-server/src/lib/claude/CLAUDE.md) — SDK wrapper, session service, runtime registry
- [`claude-agent-server/src/lib/http/CLAUDE.md`](claude-agent-server/src/lib/http/CLAUDE.md) — error handling, SSE helpers
- [`claude-agent-server/src/routes/CLAUDE.md`](claude-agent-server/src/routes/CLAUDE.md) — endpoint map, batch vs SSE flow

## Scan Snapshot

- Date: 2026-04-23
- Scope: full repo — docker-compose.yaml, all Dockerfiles, claude-agent-server/, opensandbox_server/, opensandbox_components/ structure, bootstrap/entrypoint scripts
