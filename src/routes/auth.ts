import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../lib/http';
import { AppError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { parseBody } from '../middleware/validate';
import { OtpRequestSchema, OtpVerifySchema, toPublicUser } from '../domain/types';
import { authService } from '../services/authService';
import { store } from '../store/store';

export const authRouter = Router();

// Tighter limits on the OTP endpoints to blunt SMS-bombing / brute force.
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});

// POST /auth/otp/request
authRouter.post(
  '/otp/request',
  otpLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(OtpRequestSchema, req);
    const challenge = authService.requestOtp(body.phone, body.name);
    res.json({ challenge });
  }),
);

// POST /auth/otp/verify
authRouter.post(
  '/otp/verify',
  otpLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(OtpVerifySchema, req);
    const session = authService.verifyOtp(body.challengeId, body.code);
    res.json({ session });
  }),
);

// POST /auth/signout
authRouter.post(
  '/signout',
  requireAuth,
  asyncHandler(async (_req, res) => {
    // Stateless JWT: nothing to revoke server-side in this MVP. A production
    // build would blacklist the refresh token here.
    res.json({ ok: true });
  }),
);

export const meRouter = Router();

// GET /me
meRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = store.getUser(req.userId!);
    if (!user) throw AppError.unauthorized('Your session is no longer valid.');
    res.json({ user: toPublicUser(user) });
  }),
);
