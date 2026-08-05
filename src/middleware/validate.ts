import type { Request } from 'express';
import type { ZodSchema } from 'zod';

/** Parse + validate a request body against a Zod schema (throws ZodError). */
export function parseBody<T>(schema: ZodSchema<T>, req: Request): T {
  return schema.parse(req.body);
}

/** Read the client's idempotency key header, if present. */
export function idempotencyKey(req: Request): string | undefined {
  const key = req.header('Idempotency-Key');
  return key && key.trim() ? key.trim() : undefined;
}
