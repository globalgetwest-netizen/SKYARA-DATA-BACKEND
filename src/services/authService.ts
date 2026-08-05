import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { id, reference } from '../lib/ids';
import { store } from '../store/store';
import type { User } from '../domain/types';

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function sixDigit(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  user: User;
}

export const authService = {
  requestOtp(phone: string, name?: string) {
    const code = env.otpDevMode ? '123456' : sixDigit();
    const challengeId = id('otp');
    store.putOtp({
      id: challengeId,
      phone,
      name,
      codeHash: hashCode(code),
      attempts: 0,
      expiresAt: Date.now() + env.otpTtlSeconds * 1000,
    });

    if (env.otpDevMode) {
      // eslint-disable-next-line no-console
      console.log(`[OTP] ${phone} -> ${code} (dev mode)`);
    } else {
      // TODO: send `code` to `phone` via your SMS gateway (Hubtel, Arkesel, etc.)
    }

    return {
      challengeId,
      phone,
      expiresInSeconds: env.otpTtlSeconds,
      devCode: env.otpDevMode ? code : null,
    };
  },

  verifyOtp(challengeId: string, code: string): AuthSession {
    const challenge = store.getOtp(challengeId);
    if (!challenge) throw AppError.validation('This code request has expired. Please try again.');
    if (Date.now() > challenge.expiresAt) {
      store.deleteOtp(challengeId);
      throw AppError.validation('The code has expired. Please request a new one.');
    }
    if (challenge.attempts >= env.otpMaxAttempts) {
      store.deleteOtp(challengeId);
      throw AppError.tooMany('Too many incorrect attempts. Please request a new code.');
    }
    if (hashCode(code) !== challenge.codeHash) {
      challenge.attempts += 1;
      store.putOtp(challenge);
      throw AppError.validation('That code is incorrect. Please try again.');
    }

    store.deleteOtp(challengeId);

    const user = store.upsertUserByPhone({
      id: id('usr'),
      phone: challenge.phone,
      name: challenge.name ?? null,
      email: null,
      phoneVerified: true,
    });

    return this.issueSession(user);
  },

  issueSession(user: User): AuthSession {
    const expiresInSec = env.jwtExpiresInDays * 24 * 60 * 60;
    const accessToken = jwt.sign({ sub: user.id, phone: user.phone }, env.jwtSecret, {
      expiresIn: expiresInSec,
    });
    return {
      accessToken,
      refreshToken: reference('rft'),
      expiresAt: Date.now() + expiresInSec * 1000,
      user,
    };
  },

  verifyToken(token: string): { userId: string } {
    try {
      const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
      return { userId: payload.sub };
    } catch {
      throw AppError.unauthorized('Your session has expired. Please sign in again.');
    }
  },
};
