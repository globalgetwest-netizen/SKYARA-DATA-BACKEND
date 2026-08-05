import { AppError } from '../lib/errors';
import { id, reference } from '../lib/ids';
import { store } from '../store/store';
import { catalogueStore } from '../store/catalogueStore';
import { settingsStore } from '../store/settingsStore';
import type { NetworkCode, Order, TransactionStatus } from '../domain/types';

interface CreateOrderArgs {
  network: NetworkCode;
  bundleId: string;
  recipient: string;
  userId: string | null;
  idempotencyKey?: string;
}

export const orderService = {
  create(args: CreateOrderArgs): Order {
    // Idempotency: a repeated key returns the original order.
    if (args.idempotencyKey) {
      const existingId = store.getIdempotent(args.idempotencyKey);
      const existing = existingId ? store.getOrder(existingId) : undefined;
      if (existing) return existing;
    }

    const bundle = catalogueStore.getBundle(args.bundleId);
    if (!bundle || bundle.network !== args.network) {
      throw AppError.validation('That bundle is not available for this network.');
    }
    if (!bundle.available) throw AppError.conflict('That bundle is currently unavailable.');

    const now = new Date().toISOString();
    const amount = bundle.price;
    const fee = settingsStore.get().processingFeeGhs;
    const order: Order = {
      id: id('ord'),
      reference: reference('SKY'),
      status: 'PENDING_PAYMENT',
      network: args.network,
      networkName: catalogueStore.getNetwork(args.network)?.name ?? args.network,
      recipient: args.recipient,
      bundle: { id: bundle.id, name: bundle.name, validity: bundle.validity },
      amount,
      fee,
      total: Number((amount + fee).toFixed(2)),
      currency: 'GHS',
      paymentMethod: null,
      createdAt: now,
      updatedAt: now,
      failureReason: null,
      userId: args.userId,
    };

    store.putOrder(order);
    if (args.idempotencyKey) store.setIdempotent(args.idempotencyKey, order.id);
    return order;
  },

  get(orderId: string): Order {
    const order = store.getOrder(orderId);
    if (!order) throw AppError.notFound('Transaction not found.');
    return order;
  },

  setStatus(orderId: string, status: TransactionStatus, failureReason: string | null = null): Order {
    const order = orderService.get(orderId);
    const updated: Order = {
      ...order,
      status,
      failureReason,
      updatedAt: new Date().toISOString(),
    };
    store.putOrder(updated);
    return updated;
  },
};
