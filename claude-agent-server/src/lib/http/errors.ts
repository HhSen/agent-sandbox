import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

export class HttpError extends Error {
  statusCode: number
  code?: string
  details?: unknown

  constructor(statusCode: number, message: string, code?: string, details?: unknown) {
    super(message)
    this.statusCode = statusCode
    if (code !== undefined) this.code = code
    if (details !== undefined) this.details = details
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next)
  }
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        message: error.message,
        ...(error.code !== undefined && { code: error.code }),
        ...(error.details !== undefined && { details: error.details }),
      },
    })
    return
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    })
    return
  }

  const message = error instanceof Error ? error.message : 'Unknown server error'
  res.status(500).json({
    error: {
      message,
      code: 'INTERNAL_ERROR',
    },
  })
}
