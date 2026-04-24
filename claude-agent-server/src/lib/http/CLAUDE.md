# src/lib/http — HTTP Utilities

> Navigation: [Root](../../../CLAUDE.md) | [src/lib](../CLAUDE.md)

## Purpose

Low-level HTTP primitives used by all route handlers. Nothing in this directory knows about sessions or the SDK — it is pure Express/HTTP infrastructure.

## Directory Map

```
src/lib/http/
  errors.ts   HttpError class, asyncHandler wrapper, Express errorHandler middleware
  sse.ts      SSE lifecycle helpers (open/write/close) + requestAbortSignal
```

## Key Flows

### Error handling

1. Route handlers wrap async functions with `asyncHandler`, which forwards thrown errors to `next()`
2. `errorHandler` (registered in `app.ts`) catches them and serializes to JSON:
   - `HttpError` → its own `statusCode` + optional `code` and `details`
   - `ZodError` → 400 with `VALIDATION_ERROR` code and per-field issues
   - Anything else → 500 with `INTERNAL_ERROR`

### SSE streaming

1. `openSse(res)` sets `Content-Type: text/event-stream`, disables caching, flushes headers
2. `writeSseEvent(res, { event, data })` writes the `event:` + `data:` lines (data is JSON-serialized)
3. `writeSseError(res, error)` emits an `error` event with `{ message, code }`
4. `closeSse(res)` ends the response if not already ended
5. `requestAbortSignal(req, res)` returns an `AbortSignal` that fires only on true client disconnect

## Interfaces

**`errors.ts` exports:**
- `HttpError` — throw with `(statusCode, message, code?, details?)`
- `asyncHandler` — wrap any `(req, res, next) => Promise<void>` handler
- `errorHandler` — register as Express error middleware (4-argument form)

**`sse.ts` exports:**
- `SseEvent` — `{ event: string; data: unknown }`
- `openSse`, `writeSseEvent`, `writeSseError`, `closeSse`
- `requestAbortSignal(req, res): AbortSignal`

## Working Notes

- **`requestAbortSignal` watches `res`, not `req`.** `req` emits `'close'` when body-parser destroys the readable stream, which happens immediately after the request body is consumed — long before the response is done. Watching `res.on('close')` with a `!res.writableEnded` guard fires only on a true client-side disconnect.
- `writeSseError` extracts `statusCode` from `HttpError` instances (duck-typed via `'statusCode' in error`) and falls back to `500` for unknown errors. It always emits an SSE `error` event rather than throwing.
- All three error types in `errorHandler` return JSON with an `error` envelope: `{ error: { message, code?, details? } }`.

## Tests

```bash
npx vitest run tests/lib/http/errors.test.ts
```

## Scan Snapshot

- Date: 2026-04-20
- Files reviewed: errors.ts, sse.ts
