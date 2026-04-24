# src/lib/claude — Claude SDK Wrapper

> Navigation: [Root](../../../CLAUDE.md) | [src/lib](../CLAUDE.md)

## Purpose

Owns everything that touches `@anthropic-ai/claude-agent-sdk` directly. Nothing outside this directory should import from the SDK. Routes and other consumers go through the functions exported here.

## Entry Points

- `session-service.ts` — public API for all session operations (execute, list, get, fork, abort, introspect)
- `sdk-schemas.ts` — Zod schema definitions shared by `config.ts` and `session-service.ts`; import here for `PermissionMode`, `SettingSource`, and `QueryOptions`

## Directory Map

```
src/lib/claude/
  sdk-schemas.ts         Zod enums + queryOptionsSchema — dependency leaf (no local imports)
  session-service.ts     Core service: wraps SDK query(), session CRUD, introspection helpers
  runtime-registry.ts    In-memory Map<sessionId, ActiveRun>; tracks live Query handles
  message-normalizer.ts  Maps raw SDKMessage → NormalizedEvent shapes for HTTP responses
```

## Key Flows

### 1. Execute a prompt (batch or streaming)

1. Route handler calls `execute(input, onEvent?)` in `session-service.ts`
2. `buildOptions()` merges per-request options with server defaults from `config.ts`; rejects `bypassPermissions`
3. `query({ prompt, options })` returns a `Query` async iterable from the SDK
4. If `input.sessionId` is known up front, `runtimeRegistry.start()` is called immediately
5. On first message containing `session_id`, `runtimeRegistry.ensureStarted()` registers the session
6. Each message is passed to `normalizeMessage()` and emitted via `onEvent?.()`
7. After the loop, `runtimeRegistry.finish()` clears the entry; `queryHandle.close()` tears down the SDK handle
8. Returns `{ sessionId, result, events }`

### 2. Active-query introspection (rewind, commands, models, agents, context)

1. Route handler calls one of the `getSession*` or `rewindSessionFiles` functions
2. Each calls `requireActiveQuery(sessionId)` which checks `runtimeRegistry`
3. Returns `404` if the session ID is unknown to the SDK, `409` if it exists but is idle or stopping
4. Returns `409` (not `404`) specifically for `stopping` state to prevent races during teardown

### 3. Abort

1. `abortSession(sessionId)` checks `runtimeRegistry.get()`
2. If no active run: distinguishes 404 (unknown) vs 409 (idle) via `getSessionInfo()`
3. If active: sets `status = 'stopping'` then calls `runtimeRegistry.interrupt()` → `query.interrupt()`

## Interfaces and Dependencies

**Exports from `session-service.ts`** (used by `src/routes/sessions.ts`):
- `execute`, `listStoredSessions`, `getStoredSession`, `getStoredMessages`
- `updateStoredSession`, `forkStoredSession`, `abortSession`
- `rewindSessionFiles`, `getSessionCommands`, `getSessionModels`, `getSessionAgents`, `getSessionContext`
- Zod schemas: `createSessionBodySchema`, `sendMessageBodySchema`, `patchSessionBodySchema`, etc.
- Serializers: `sdkSessionInfoToResponse`, `sessionMessageToResponse`

**`sdk-schemas.ts` is a dependency leaf** — it imports only from `zod`. Any file in the project can safely import it without creating a circular dependency.

**`runtime-registry.ts` singleton** — `runtimeRegistry` is module-level. All callers share the same instance. Do not create additional `RuntimeRegistry` instances.

## Working Notes

- `definedEntries()` strips `undefined` values before forwarding to SDK calls. This matters because SDK functions distinguish "option not provided" from "option is undefined" in some cases.
- `enableFileCheckpointing` must be set at query-start time; it cannot be enabled retroactively on an existing session.
- `forkSession` in `execute()`: if `input.forkSession` is true and `input.sessionId` is provided, the SDK creates a new session branched from that one. The original session is unchanged.
- The `stopping` state guard in `requireActiveQuery` prevents `rewindFiles` from racing with SDK teardown and leaving the working tree in an inconsistent state.
- New message types added to the SDK will fall through to the `message.raw` fallback in `normalizeMessage`. They won't break the server but will appear as raw events in responses.

## Tests

Tests live in `tests/lib/claude/` (if present). Run a specific file:
```bash
npx vitest run tests/lib/claude/<file>.test.ts
```

## Scan Snapshot

- Date: 2026-04-20
- Files reviewed: sdk-schemas.ts, session-service.ts, runtime-registry.ts, message-normalizer.ts
