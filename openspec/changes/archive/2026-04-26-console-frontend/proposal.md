## Why

Operating opensandbox today requires raw API calls or `curl` — there's no way to visually see what sandboxes are running, read their logs, or send prompts to them interactively. A web console removes that friction for developers, QA, and operators who need to inspect, manage, and chat with sandboxes without writing scripts.

## What Changes

- **New**: A standalone web console application (`console/`) that ships alongside the repo.
- **New**: The console connects to `opensandbox-server` via its REST API (sandboxes, pools, devops, proxy endpoints).
- **New**: Direct sandbox session interface — users can open a chat/prompt window that talks to `claude-agent-server` running inside any sandbox.
- **New**: Live log streaming, event tailing, and diagnostics view per sandbox.
- **New**: Pool management UI — create, resize, and delete pre-warmed pools.
- **New**: `docker-compose.yaml` service entry to run the console alongside the server.

## Capabilities

### New Capabilities

- `sandbox-dashboard`: Overview of all running sandboxes with status, age, resource config, and quick-action buttons (pause, resume, delete, renew).
- `sandbox-console`: Interactive prompt/chat panel that connects to a sandbox's `claude-agent-server` port 3000 via the opensandbox-server proxy endpoint, streaming SSE responses in real time.
- `pool-management`: CRUD interface for sandbox pools — list pools, create with config, update desired size, delete.
- `sandbox-diagnostics`: Per-sandbox diagnostics drawer showing live log stream, Docker inspect JSON, event timeline, and diagnostics summary.

### Modified Capabilities

## Impact

- New top-level `console/` directory (React + Vite or similar lightweight SPA).
- `docker-compose.yaml`: new `console` service (static file server or dev server).
- `opensandbox_server`: CORS headers already present; no server changes expected unless auth token forwarding needs a dedicated endpoint.
- `claude-agent-server`: consumed read-only via the existing proxy API — no changes.
