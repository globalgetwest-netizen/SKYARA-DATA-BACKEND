import { Router } from 'express';
import type { Request } from 'express';
import { asyncHandler } from '../lib/http';
import { paymentProvider } from '../providers/payment';
import { paymentService } from '../services/paymentService';

/**
 * Provider webhooks. Mounted with a RAW body parser (see app.ts) because
 * signature verification must run against the exact bytes the provider sent.
 *
 * Handlers are idempotent: providers retry, and confirmPayment ignores
 * confirmations for already-terminal orders.
 */
export const webhooksRouter = Router();

function rawBuffer(req: Request): Buffer {
  return Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
}

async function handle(req: Request) {
  const result = paymentProvider.verifyWebhook(rawBuffer(req), req.headers);
  if (result.kind === 'payment_succeeded') {
    await paymentService.confirmPayment(result.providerRef, true);
  } else if (result.kind === 'payment_failed') {
    await paymentService.confirmPayment(result.providerRef, false, result.reason);
  }
}

// POST /webhooks/paystack
webhooksRouter.post(
  '/paystack',
  asyncHandler(async (req, res) => {
    await handle(req);
    res.sendStatus(200); // always 200 so providers stop retrying a handled event
  }),
);

// POST /webhooks/mock — drive the mock provider manually if desired
webhooksRouter.post(
  '/mock',
  asyncHandler(async (req, res) => {
    await handle(req);
    res.sendStatus(200);
  }),
);
