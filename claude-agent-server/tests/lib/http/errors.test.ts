import { describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

import { HttpError, errorHandler } from '../../../src/lib/http/errors.js'

function makeMockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
  return res
}

const req = {} as Request
const next = vi.fn() as unknown as NextFunction

describe('HttpError', () => {
  it('constructs with statusCode and message only', () => {
    const err = new HttpError(404, 'Not found')
    expect(err.statusCode).toBe(404)
    expect(err.message).toBe('Not found')
    expect(err.code).toBeUndefined()
    expect(err.details).toBeUndefined()
  })

  it('constructs with statusCode, message, and code', () => {
    const err = new HttpError(400, 'Bad request', 'BAD_INPUT')
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe('BAD_INPUT')
    expect(err.details).toBeUndefined()
  })

  it('constructs with statusCode, message, code, and details', () => {
    const err = new HttpError(422, 'Unprocessable', 'INVALID_FIELD', { field: 'email' })
    expect(err.code).toBe('INVALID_FIELD')
    expect(err.details).toEqual({ field: 'email' })
  })
})

describe('errorHandler', () => {
  it('HttpError with code → { error: { message, code } } — no details key', () => {
    const res = makeMockRes()
    errorHandler(new HttpError(400, 'Bad request', 'BAD_INPUT'), req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'Bad request', code: 'BAD_INPUT' },
    })
    // Verify details key is absent
    const call = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as { error: Record<string, unknown> }
    expect('details' in call.error).toBe(false)
  })

  it('HttpError without code → { error: { message } } — no code key, no details key', () => {
    const res = makeMockRes()
    errorHandler(new HttpError(404, 'Not found'), req, res, next)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'Not found' } })
    // Verify code and details keys are both absent
    const call = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as { error: Record<string, unknown> }
    expect('code' in call.error).toBe(false)
    expect('details' in call.error).toBe(false)
  })

  it('HttpError with code and details → { error: { message, code, details } }', () => {
    const res = makeMockRes()
    errorHandler(
      new HttpError(422, 'Unprocessable', 'INVALID_FIELD', { field: 'email' }),
      req,
      res,
      next,
    )
    expect(res.status).toHaveBeenCalledWith(422)
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'Unprocessable', code: 'INVALID_FIELD', details: { field: 'email' } },
    })
  })

  it('ZodError → 400 with code VALIDATION_ERROR and details array', async () => {
    const res = makeMockRes()
    // Create a real ZodError by parsing invalid data
    const { z } = await import('zod')
    const schema = z.object({ name: z.string() })
    const result = schema.safeParse({ name: 123 })
    if (result.success) throw new Error('Expected parse failure')
    const zodErr = result.error

    errorHandler(zodErr, req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
    const call = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      error: { message: string; code: string; details: Array<{ path: string; message: string }> }
    }
    expect(call.error.message).toBe('Validation error')
    expect(call.error.code).toBe('VALIDATION_ERROR')
    expect(Array.isArray(call.error.details)).toBe(true)
    expect(call.error.details.length).toBeGreaterThan(0)
    expect(call.error.details[0]).toHaveProperty('path')
    expect(call.error.details[0]).toHaveProperty('message')
  })

  it('unknown Error → 500 with code INTERNAL_ERROR — no details key', () => {
    const res = makeMockRes()
    errorHandler(new Error('Something exploded'), req, res, next)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'Something exploded', code: 'INTERNAL_ERROR' },
    })
    const call = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as { error: Record<string, unknown> }
    expect('details' in call.error).toBe(false)
  })

  it('non-Error thrown value → 500 with "Unknown server error" message', () => {
    const res = makeMockRes()
    errorHandler('a plain string was thrown', req, res, next)
    expect(res.status).toHaveBeenCalledWith(500)
    const call = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as { error: { message: string } }
    expect(call.error.message).toBe('Unknown server error')
    expect(call.error).toHaveProperty('code', 'INTERNAL_ERROR')
  })
})
