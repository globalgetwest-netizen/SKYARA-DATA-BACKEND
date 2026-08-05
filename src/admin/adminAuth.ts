import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

/**
 * Admin authentication — separate from customer phone-OTP.
 *
 * A single admin is seeded from ADMIN_EMAIL / ADMIN_PASSWORD. Login issues a
 * short JWT carrying the `admin` role; requireAdmin guards every /admin/*
 * mutation. For the MVP this is one env-seeded account; add a persisted admin
 * table (and per-user roles) at deploy time.
 */

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export const adminAuth = {
  login(email: string, password: string): { token: string; email: string } {
    const okEmail = safeEqual(email.trim().toLowerCase(), env.adminEmail.trim().toLowerCase());
    const okPassword = safeEqual(password, env.adminPassword);
    if (!okEmail || !okPassword) {
      throw new AppError(401, 'invalid_credentials', 'Incorrect email or password.');
    }
    const token = jwt.sign({ sub: env.adminEmail, role: 'admin' }, env.jwtSecret, {
      expiresIn: '12h',
    });
    return { token, email: env.adminEmail };
  },
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminEmail?: string;
    }
  }
}

/**
 * Verify an admin token against the local secret and, if configured, the SSO
 * secret. This is the SSO hook: a central identity (e.g. a SkyGlobe admin hub)
 * that knows ADMIN_SSO_SECRET can mint `{ sub, role: 'admin' }` tokens Skyra
 * accepts here — no second password, one central login.
 */
function verifyAdminToken(token: string): { sub: string; role?: string } | null {
  const secrets = [env.jwtSecret, env.adminSsoSecret].filter(Boolean);
  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret) as { sub: string; role?: string };
    } catch {
      // try next secret
    }
  }
  return null;
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized('Admin sign-in required.'));
  const payload = verifyAdminToken(header.slice(7).trim());
  if (!payload) return next(AppError.unauthorized('Your admin session has expired. Please sign in again.'));
  if (payload.role !== 'admin') return next(AppError.forbidden('Admin access only.'));
  req.adminEmail = payload.sub;
  next();
}
