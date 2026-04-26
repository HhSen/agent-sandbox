## 1. Project Scaffold

- [x] 1.1 Create `console/` directory with Vite + React + TypeScript template (`npm create vite@latest`)
- [x] 1.2 Add dependencies: `@tanstack/react-query`, `tailwindcss`, `react-window`, `eventsource-parser`
- [x] 1.3 Configure Tailwind CSS and base global styles
- [x] 1.4 Set up path aliases and tsconfig for the console project
- [x] 1.5 Add `console/Dockerfile` (multi-stage: build → nginx static serving)
- [x] 1.6 Add `console` service to `docker-compose.yaml` on port 8091

## 2. API Client Layer

- [x] 2.1 Create `src/api/client.ts` — configurable base URL + Bearer token, reads from localStorage
- [x] 2.2 Implement sandbox API functions: `listSandboxes`, `getSandbox`, `createSandbox`, `deleteSandbox`, `pauseSandbox`, `resumeSandbox`, `renewSandbox`, `getSandboxEndpoint`
- [x] 2.3 Implement pool API functions: `listPools`, `getPool`, `createPool`, `updatePool`, `deletePool`
- [x] 2.4 Implement devops API functions: `getSandboxLogs`, `getSandboxInspect`, `getSandboxEvents`, `getSandboxDiagnostics`
- [x] 2.5 Implement SSE streaming helper in `src/api/sse.ts` for proxy session calls

## 3. Settings & Connection

- [x] 3.1 Create `SettingsPanel` component with server URL and Bearer token fields
- [x] 3.2 Implement localStorage persistence for connection settings
- [x] 3.3 Auto-open settings panel when no server URL is configured on first load
- [x] 3.4 Add settings icon / header button to open settings from anywhere in the console

## 4. Sandbox Dashboard

- [x] 4.1 Create `DashboardPage` with sandbox list table (columns: ID, status badge, image, created, expires, actions)
- [x] 4.2 Wire `useQuery` polling every 10 seconds on `listSandboxes`
- [x] 4.3 Add Refresh button for manual re-fetch
- [x] 4.4 Implement empty state and error banner with Retry button
- [x] 4.5 Build `CreateSandboxModal` form (image, CPU, memory fields) and wire `POST /sandboxes`
- [x] 4.6 Implement action menu per row: Pause, Resume, Renew, Delete (with confirmation dialog), Open Console, View Diagnostics
- [x] 4.7 Implement status badge with colour coding (running, paused, error, etc.)

## 5. Sandbox Console

- [x] 5.1 Create `ConsolePanelDrawer` component (side panel or modal fullscreen)
- [x] 5.2 Build `MessageList` component with auto-scroll and user/assistant/tool-use bubble types
- [x] 5.3 Implement `PromptInput` with Enter-to-send and send button; disable during active stream
- [x] 5.4 Wire SSE session call through `POST /sandboxes/{id}/proxy/3000/sessions`
- [x] 5.5 Parse and render SSE events: `session.message` (incremental), `session.completed`, `session.failed`
- [x] 5.6 Render tool-use events as collapsible blocks within the transcript
- [x] 5.7 Add port override input defaulting to 3000
- [x] 5.8 Implement Clear transcript action (with confirmation)
- [x] 5.9 Implement Export transcript as Markdown download
- [x] 5.10 Show warning banner when sandbox is paused

## 6. Pool Management

- [x] 6.1 Create `PoolsPage` with pool list table (columns: ID, image, current size, desired size, status)
- [x] 6.2 Wire `useQuery` on `listPools`
- [x] 6.3 Build `CreatePoolModal` form (image, desired size, optional resource config)
- [x] 6.4 Implement inline desired-size editor per pool row wired to `PUT /pools/{id}`
- [x] 6.5 Implement Delete action per pool with confirmation dialog
- [x] 6.6 Build `PoolDetailDrawer` showing full config JSON and warm sandbox list

## 7. Sandbox Diagnostics

- [x] 7.1 Create `DiagnosticsDrawer` with four tabs: Logs, Inspect, Events, Summary
- [x] 7.2 Implement Logs tab: fetch `GET /sandboxes/{id}/logs`, display in virtualized monospace list, auto-append new lines, enforce 5 000-line buffer limit with truncation notice
- [x] 7.3 Implement Inspect tab: fetch `GET /sandboxes/{id}/inspect`, render syntax-highlighted collapsible JSON tree, add Copy button
- [x] 7.4 Implement Events tab: fetch `GET /sandboxes/{id}/events`, render as chronological timeline; show empty state if no events
- [x] 7.5 Implement Summary tab: fetch `GET /sandboxes/{id}/diagnostics/summary`, render text; show error message on non-2xx

## 8. Navigation & Layout

- [x] 8.1 Create app shell with top navigation bar (Dashboard, Pools, Settings)
- [x] 8.2 Implement client-side routing (React Router or TanStack Router) for Dashboard and Pools pages
- [x] 8.3 Add connection status indicator in nav bar (green/red dot based on last API response)

## 9. Polish & Deployment

- [x] 9.1 Add loading skeletons for list and detail views
- [x] 9.2 Add toast notification system for action success/failure feedback
- [x] 9.3 Verify CORS works end-to-end with opensandbox-server in dev and Docker setups
- [x] 9.4 Write `console/README.md` covering local dev, Docker Compose setup, and settings configuration
- [x] 9.5 Smoke-test full flow: create sandbox → open console → send prompt → view logs → delete sandbox
