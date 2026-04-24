import type { Request, Response } from 'express'

export type SseEvent = {
  event: string
  data: unknown
}

export function openSse(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
}

export function writeSseEvent(res: Response, payload: SseEvent) {
  res.write(`event: ${payload.event}\n`)
  res.write(`data: ${JSON.stringify(payload.data)}\n\n`)
}

export function writeSseError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error'
  const code =
    error != null && typeof error === 'object' && 'statusCode' in error
      ? (error as { statusCode: number }).statusCode
      : 500

  writeSseEvent(res, {
    event: 'error',
    data: { message, code },
  })
}

export function closeSse(res: Response) {
  if (!res.writableEnded) {
    res.end()
  }
}

/**
 * Returns an AbortSignal that fires when the HTTP client drops the connection
 * mid-stream. The signal does NOT fire when the response ends normally.
 *
 * Implementation note: `req` emits `'close'` whenever its readable stream is
 * destroyed — which happens routinely after the request body is fully consumed
 * by body-parser middleware, well before the response is finished. Using
 * `req.on('close')` therefore produces false positives that abort the SDK query
 * immediately after the route handler starts.
 *
 * `res` emits `'close'` only when the underlying socket is destroyed. Combined
 * with the `!res.writableEnded` guard this reliably fires only on a true
 * client disconnect, not on a clean response completion.
 */
export function requestAbortSignal(_req: Request, res: Response): AbortSignal {
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) {
      controller.abort()
    }
  })
  return controller.signal
}
