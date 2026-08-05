import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found.' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
      // top-level message so the client's generic parser also finds it
      message: err.message,
    });
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      error: { code: 'validation', message: 'Invalid request.', details: err.flatten() },
      message: err.errors[0]?.message ?? 'Invalid request.',
    });
  }

  // eslint-disable-next-line no-console
  console.error('[Skyra] Unhandled error:', err);
  return res.status(500).json({
    error: { code: 'server_error', message: 'Something went wrong. Please try again.' },
    message: 'Something went wrong. Please try again.',
  });
}
