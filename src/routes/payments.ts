import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { optionalAuth } from '../middleware/auth';
import { idempotencyKey, parseBody } from '../middleware/validate';
import { InitPaymentSchema } from '../domain/types';
import { paymentService } from '../services/paymentService';

export const paymentsRouter = Router();

// POST /payments/initialize
paymentsRouter.post(
  '/initialize',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = parseBody(InitPaymentSchema, req);
    const payment = await paymentService.initialize({
      orderId: body.orderId,
      method: body.method,
      idempotencyKey: idempotencyKey(req),
    });
    res.json({
      payment: {
        paymentId: payment.id,
        orderId: payment.orderId,
        provider: payment.provider,
        method: payment.method,
        authorizationUrl: payment.authorizationUrl,
        reference: payment.reference,
        status: payment.status,
      },
    });
  }),
);

// GET /payments/:id/status
paymentsRouter.get(
  '/:id/status',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const status = await paymentService.getStatus(req.params.id);
    res.json({ payment: status });
  }),
);
