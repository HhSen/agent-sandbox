## Context

`opensandbox-server` exposes a REST API on port 8090 (configurable). There is currently no human-facing UI. Operators must use `curl`, scripts, or custom tooling to view sandboxes, read logs, or interact with sessions. `claude-agent-server` inside each sandbox runs on port 3000 and is reachable through the proxy endpoint (`/sandboxes/{id}/proxy/3000/...`), including WebSocket and SSE.

## Goals / Non-Goals

**Goals:**
- Single-page web console that talks directly to `opensandbox-server` from the browser.
- Dashboard showing all sandboxes and their lifecycle state.
- Interactive chat/prompt panel routed through the proxy to `claude-agent-server`.
- Pool management CRUD.
- Live log, inspect, event, and diagnostics views per sandbox.
- Deployable as a Docker Compose service (static file serving via nginx or Vite dev server).

**Non-Goals:**
- Authentication system — the console forwards whatever Bearer token the user configures; it does not implement login.
- Multi-server support — one console instance targets one `opensandbox-server`.
- Mobile-responsive design (developer tool, desktop-first).
- Replacing any server-side logic — the console is purely a UI layer.

## Decisions

### D1 — Framework: React + Vite (TypeScript)

**Choice**: React with Vite bundler, TypeScript, Tailwind CSS for utility styling.

**Rationale**: React has the widest ecosystem for real-time streaming UI components (SSE rendering, virtualized log lists). Vite gives fast HMR for development and produces a compact static build that nginx can serve. The repo already uses TypeScript in `claude-agent-server`, so conventions carry over.

**Alternatives considered**:
- *Vanilla JS + HTMX*: Simpler, but SSE streaming with partial DOM updates for the chat panel would require significant custom code.
- *Next.js*: Overkill — no SSR needed; the console is purely a client-side tool calling an existing API.
- *Vue/Svelte*: Both viable but React keeps the TypeScript patterns consistent with the rest of the repo.

### D2 — API connectivity: direct browser → opensandbox-server

**Choice**: The console SPA calls `opensandbox-server` directly. The server URL and optional Bearer token are configured via a settings form stored in `localStorage` (never sent server-side).

**Rationale**: Avoids adding a BFF layer. CORS middleware is already enabled in `main.py`. The proxy endpoint already handles HTTP and WebSocket passthrough to sandboxes.

**Alternatives considered**:
- *Nginx reverse-proxy config*: Adds operational complexity without benefit for a developer tool.
- *BFF (Node service)*: Unnecessary indirection; adds another component to maintain.

### D3 — Chat/console transport: SSE via opensandbox proxy

**Choice**: The sandbox console pane sends `POST /sandboxes/{id}/proxy/3000/sessions` with `stream: true`, then reads the SSE response line-by-line. Each SSE event is rendered as a message bubble.

**Rationale**: This reuses the proxy API already in place. No new server endpoints are needed. The existing `claude-agent-server` SSE format (event types: `session.message`, `session.completed`, `session.failed`) maps cleanly to chat bubbles.

**Alternatives considered**:
- *WebSocket*: `claude-agent-server` does not expose a WebSocket session API; SSE is the native protocol.

### D4 — Deployment: static files served by nginx inside Docker

**Choice**: `console/Dockerfile` runs `vite build` and copies `dist/` into an nginx image. The `docker-compose.yaml` adds a `console` service on a configurable port (default 8091).

**Rationale**: No Node.js runtime needed in production, minimal image size. For local development `npm run dev` works without Docker.

**Alternatives considered**:
- *Serve with opensandbox-server*: Mixes frontend concerns into the Python service; harder to iterate on independently.

### D5 — State management: React Query + local component state

**Choice**: `@tanstack/react-query` for all API calls (auto-polling sandbox list, cache invalidation on mutations). Local `useState`/`useReducer` for UI state (selected sandbox, open panels).

**Rationale**: React Query eliminates manual loading/error state boilerplate and provides stale-while-revalidate semantics, which is ideal for a dashboard that needs to stay fresh.

## Risks / Trade-offs

- **CORS misconfiguration** → `opensandbox-server` must have the console origin in its allowed origins. Mitigation: The existing wildcard CORS config (`*`) covers local dev; document how to tighten for production.
- **SSE proxy latency** → Token streaming through `opensandbox-server` proxy adds one extra hop. Mitigation: Acceptable for a developer tool; document the direct-connect option if needed.
- **Bearer token in localStorage** → Sensitive if the machine is shared. Mitigation: Clearly label it a developer tool, not a production end-user surface; token is never sent to a third party.
- **Large log volume** → Log streaming can generate thousands of lines. Mitigation: Virtualize the log list (`react-window`) and cap the in-memory buffer at ~5 000 lines.

## Open Questions

- Should the console support connecting to multiple `opensandbox-server` instances (workspace concept)?
- Does the pool resize UI need an approval/confirmation step to prevent accidental scaling?
- Should session transcripts be exportable (download as JSON/Markdown)?
