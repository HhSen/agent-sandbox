# opensandbox_server — Python Control Plane

> Navigation: [Root](../CLAUDE.md)

## Purpose

Python FastAPI service that manages the lifecycle of sandbox containers. It is the control plane: callers create, list, inspect, pause, resume, and delete sandboxes through this API. It does not run code — the code-interpreter container (claude-agent-server + execd) does that.

Does **not** own: in-container execution, PTY sessions, Jupyter kernels, egress policy enforcement, or inbound proxying.

## Entry Points

- `opensandbox_server/main.py` — FastAPI app factory, middleware wiring, lifespan hooks, router mounting
- `opensandbox_server/cli.py` — `opensandbox-server` CLI binary entry point (uvicorn launcher)
- `opensandbox_server/api/lifecycle.py` — all sandbox CRUD + lifecycle endpoints
- `opensandbox_server/services/factory.py` — creates the active `SandboxService` (docker or kubernetes)

## Directory Map

```
opensandbox_server/
  opensandbox_server/
    main.py                    FastAPI app, middleware, lifespan, router mounting
    cli.py                     CLI entry point (opensandbox-server binary)
    config.py                  Pydantic AppConfig + TOML loading; load_config() / get_config()
    logging_config.py          Structured log config for uvicorn
    startup_guard.py           api_key_confirm() — blocks startup if API key check fails
    api/
      schema.py                All Pydantic request/response models (ImageSpec, Volume, Sandbox, …)
      lifecycle.py             /sandboxes/* CRUD + lifecycle routes
      devops.py                /sandboxes/{id}/diagnostics/* (logs, inspect, events)
      pool.py                  /pools/* (Kubernetes pre-warmed pool management)
      proxy.py                 Catch-all proxy routes (must be registered last — see main.py)
    services/
      sandbox_service.py       Abstract SandboxService base class
      factory.py               create_sandbox_service() — returns Docker or K8s implementation
      docker.py                DockerSandboxService (docker-py backed)
      docker_diagnostics.py    Docker log/inspect/events helpers
      docker_port_allocator.py Host port allocation for Docker containers
      docker_windows_profile.py Windows container profile helpers
      k8s/                     KubernetesSandboxService + all K8s helpers (see k8s/ below)
      runtime_resolver.py      validate_secure_runtime_on_startup()
      endpoint_auth.py         Secure-access credential provisioning
      extension_service.py     Extension lifecycle hooks
      ossfs_mixin.py           OSSFS volume mount helpers
      helpers.py               Shared service utilities
      validators.py            ensure_valid_port() and other input validation
      constants.py             Service-level constants
    middleware/
      auth.py                  AuthMiddleware — Bearer token enforcement
      request_id.py            RequestIdMiddleware — X-Request-ID injection (outermost)
    integrations/
      renew_intent/            Redis pub/sub for sandbox expiration renewal signals
    extensions/
      codec.py                 Extension encode/decode
      keys.py                  Extension key constants
      validation.py            validate_extensions()
    examples/                  Packaged example config TOML templates
  tests/
    test_docker_service.py
    test_docker_endpoint.py
    test_schema.py
    test_endpoint.py
    test_auth_middleware.py
    k8s/                       Kubernetes-specific unit tests
    smoke.sh                   End-to-end smoke test (requires Docker)
```

## Endpoint Map

All routes are mounted at both `/` and `/v1/`. The devops/pool routers **must be registered before** `proxy_router` (catch-all).

| Method | Path | Description |
|---|---|---|
| POST | `/sandboxes` | Create sandbox (async, returns 202) |
| GET | `/sandboxes` | List sandboxes with filter + pagination |
| GET | `/sandboxes/{id}` | Get sandbox by ID |
| DELETE | `/sandboxes/{id}` | Delete sandbox (triggers Stopping → Terminated) |
| POST | `/sandboxes/{id}/pause` | Pause running sandbox (202 Accepted) |
| POST | `/sandboxes/{id}/resume` | Resume paused sandbox (202 Accepted) |
| POST | `/sandboxes/{id}/renew-expiration` | Update absolute expiration time |
| GET | `/sandboxes/{id}/endpoints/{port}` | Get public endpoint URL for a container port |
| GET | `/sandboxes/{id}/diagnostics/logs` | Container logs (plain text) |
| GET | `/sandboxes/{id}/diagnostics/inspect` | Container inspect (plain text) |
| GET | `/sandboxes/{id}/diagnostics/events` | Container events (plain text) |
| GET/POST/PUT/DELETE | `/sandboxes/{id}/proxy/{port}/{path}` | Passthrough proxy to container port |
| GET/POST | `/pools` | List / create pre-warmed pool (K8s only) |
| GET/PUT/DELETE | `/pools/{name}` | Get / update / delete pool |
| GET | `/health` | Health check |

## Key Flows

### 1. Startup

1. `load_config()` reads TOML from `SANDBOX_CONFIG_PATH` (default `~/.sandbox.toml`) → `AppConfig`
2. Logging configured via `configure_logging()`
3. FastAPI app created; `RequestIdMiddleware` → `CORSMiddleware` → `AuthMiddleware` added (outermost first)
4. Routers mounted (devops + pool before proxy to avoid catch-all swallowing diagnostics paths)
5. On first request: `lifespan()` runs — `api_key_confirm()`, Docker/K8s client created, `validate_secure_runtime_on_startup()`, `renew_intent` consumer started

### 2. Create sandbox (Docker path)

1. `POST /sandboxes` → `create_sandbox()` in `lifecycle.py`
2. `validate_extensions()` checks extension keys
3. `DockerSandboxService.create_sandbox()` — pulls image, creates container with resource limits, env, volumes, network policy
4. If `networkPolicy` is set, pushes policy to the egress sidecar's `/policy` endpoint
5. Returns `CreateSandboxResponse` (202) — container may still be starting

### 3. Get endpoint

1. `GET /sandboxes/{id}/endpoints/{port}` → `get_sandbox_endpoint()`
2. `sandbox_service.get_endpoint()` resolves host IP + mapped port (Docker) or cluster endpoint (K8s)
3. `use_server_proxy=true` rewrites to `{base_url}/sandboxes/{id}/proxy/{port}` (server-side passthrough)

### 4. Runtime selection

`factory.py` reads `config.runtime.type` and instantiates `DockerSandboxService` or `KubernetesSandboxService`. Both implement the abstract `SandboxService` interface.

## Interfaces and Dependencies

**`SandboxService` abstract methods** (all implementations must provide):
`create_sandbox`, `list_sandboxes`, `get_sandbox`, `delete_sandbox`, `pause_sandbox`, `resume_sandbox`, `renew_expiration`, `get_sandbox_logs`, `get_sandbox_inspect`, `get_sandbox_events`, `get_endpoint`

**Volume backends** (defined in `schema.py`):
- `host` — host bind mount (path allowlist enforced server-side)
- `pvc` — Kubernetes PVC or Docker named volume (auto-created if `createIfNotExists: true`)
- `ossfs` — Alibaba Cloud OSS via ossfs FUSE mount

**Sandbox lifecycle states**: `Pending → Running → Pausing → Paused → Stopping → Terminated | Failed`

## Tests

```bash
cd opensandbox_server
uv sync --all-groups
uv run pytest                          # full suite
uv run pytest tests/test_docker_service.py   # Docker-only
uv run pytest tests/k8s/               # Kubernetes unit tests
uv run ruff check                      # lint
uv run pyright                         # type check
./tests/smoke.sh                       # end-to-end (needs Docker)
```

## Working Notes

- **Route registration order matters.** `proxy_router` contains catch-all routes (`/sandboxes/{id}/proxy/{port}/{path}`). Register `devops_router` and `pool_router` before it or diagnostics paths will be swallowed.
- **`load_config()` runs at module import time** (top of `main.py`). Router imports are deferred until after config loads (`# noqa: E402`) to avoid circular access to uninitialized config.
- **Docker vs K8s invariants differ.** `DockerSandboxService.pause_sandbox()` uses `docker pause`; K8s has no direct equivalent — check both paths before changing pause/resume behavior.
- **OSSFS requires Linux FUSE on the host.** The Docker runtime bind-mounts the host-side mount into the container. This fails silently on macOS.
- **`api_key_confirm()`** is the hard gate at startup: if the API key sanity check fails, the process calls `os._exit(1)` rather than raising — intentional, to abort before any request is served.
- All HTTP errors use the `{"code": "...", "message": "..."}` envelope normalized by `sandbox_http_exception_handler`.

## Scan Snapshot

- Date: 2026-04-26
- Scope: main.py, cli.py, config.py, api/ (all 4 routers + schema), services/ (factory, base, docker, k8s structure), middleware/, integrations/renew_intent, extensions/, tests/ layout
