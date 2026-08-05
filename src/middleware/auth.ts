import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { authService } from '../services/authService';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string | null;
    }
  }
}

function extractUserId(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;
  return authService.verifyToken(token).userId;
}

/** Attaches userId when a valid token is present; never rejects (guest-friendly). */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    req.userId = extractUserId(req);
  } catch {
    req.userId = null; // ignore invalid token on guest-allowed routes
  }
  next();
}

/** Requires a valid session. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const userId = extractUserId(req);
  if (!userId) return next(AppError.unauthorized());
  req.userId = userId;
  next();
}
