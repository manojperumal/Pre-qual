import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message)
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, what)
export const forbidden = (what = 'Not allowed') => new HttpError(403, what)
export const badRequest = (what: string, details?: unknown) => new HttpError(400, what, details)

/** Wrap an async handler so thrown errors reach the error middleware. */
export const h =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Invalid request', details: err.flatten() })
    return
  }
  console.error('[orientation] Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
}
