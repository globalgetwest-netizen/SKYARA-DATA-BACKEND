import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { idempotencyKey, parseBody } from '../middleware/validate';
import { CreateOrderSchema, toPublicOrder } from '../domain/types';
import { orderService } from '../services/orderService';
import { paymentService } from '../services/paymentService';
import { store } from '../store/store';
import { AppError } from '../lib/errors';

export const ordersRouter = Router();

// POST /orders — guest-friendly (associates with the user when signed in)
ordersRouter.post(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = parseBody(CreateOrderSchema, req);
    const order = orderService.create({
      network: body.network,
      bundleId: body.bundleId,
      recipient: body.recipient,
      userId: req.userId ?? null,
      idempotencyKey: idempotencyKey(req),
    });
    res.status(201).json({ order: toPublicOrder(order) });
  }),
);

// GET /orders — the signed-in user's history
ordersRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = store.listOrdersByUser(req.userId!).map(toPublicOrder);
    res.json({ orders });
  }),
);

// GET /orders/:id — poll a single order (guest can read by unguessable id)
ordersRouter.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const order = orderService.get(req.params.id);
    // If the order belongs to a user, only that user may read it.
    if (order.userId && req.userId && order.userId !== req.userId) {
      throw AppError.forbidden();
    }
    res.json({ order: toPublicOrder(order) });
  }),
);

// POST /orders/:id/retry — re-attempt a failed fulfilment
ordersRouter.post(
  '/:id/retry',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const existing = orderService.get(req.params.id);
    if (existing.userId && req.userId && existing.userId !== req.userId) {
      throw AppError.forbidden();
    }
    const order = await paymentService.retry(req.params.id);
    res.json({ order: toPublicOrder(order) });
  }),
);
