import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { id } from '../lib/ids';
import { store } from '../store/store';
import { paymentProvider } from '../providers/payment';
import { PaystackProvider } from '../providers/payment/paystackProvider';
import type { Payment, PaymentMethod } from '../domain/types';
import { orderService } from './orderService';
import { fulfilmentService } from './fulfilmentService';

interface InitArgs {
  orderId: string;
  method: PaymentMethod;
  idempotencyKey?: string;
}

export const paymentService = {
  async initialize({ orderId, method, idempotencyKey }: InitArgs): Promise<Payment> {
    const order = orderService.get(orderId);

    // Idempotency + natural dedupe: a payment already exists for this order.
    if (idempotencyKey) {
      const existingId = store.getIdempotent(idempotencyKey);
      const existing = existingId ? store.getPayment(existingId) : undefined;
      if (existing) return existing;
    }
    const existingForOrder = store.getPaymentByOrder(orderId);
    if (existingForOrder) return existingForOrder;

    if (order.status !== 'PENDING_PAYMENT') {
      throw AppError.conflict('This order is no longer awaiting payment.');
    }

    const charge = await paymentProvider.charge({ order, method });

    const payment: Payment = {
      id: id('pay'),
      orderId: order.id,
      provider: paymentProvider.id,
      method,
      authorizationUrl: charge.authorizationUrl,
      reference: order.reference,
      status: 'PAYMENT_PROCESSING',
      providerRef: charge.providerRef,
    };
    store.putPayment(payment);
    if (idempotencyKey) store.setIdempotent(idempotencyKey, payment.id);

    // Record the chosen method and move the order into processing.
    const updated = orderService.get(order.id);
    store.putOrder({ ...updated, paymentMethod: method, status: 'PAYMENT_PROCESSING', updatedAt: new Date().toISOString() });

    // Mock provider has no real gateway, so simulate the confirmation timeline
    // the way a webhook would drive it in production.
    if (paymentProvider.id === 'mock') {
      this.simulateMockTimeline(payment.providerRef!);
    }

    return payment;
  },

  /**
   * The single funnel for "payment is confirmed": called by the provider
   * webhook (production) and by the mock timeline (development). Idempotent.
   */
  async confirmPayment(providerRef: string, succeeded: boolean, reason?: string): Promise<void> {
    const payment = store.findPaymentByProviderRef(providerRef);
    if (!payment) return;
    const order = store.getOrder(payment.orderId);
    if (!order) return;

    // Ignore confirmations for already-terminal orders (webhook retries).
    if (['SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED'].includes(order.status)) return;

    if (!succeeded) {
      store.putPayment({ ...payment, status: 'FAILED' });
      orderService.setStatus(order.id, 'FAILED', reason ?? 'Your payment could not be completed.');
      return;
    }

    store.putPayment({ ...payment, status: 'PAYMENT_SUCCESS' });
    orderService.setStatus(order.id, 'PAYMENT_SUCCESS');
    // Kick off data delivery (only after verified payment).
    await fulfilmentService.fulfil(orderService.get(order.id));
  },

  async getStatus(paymentId: string): Promise<{ paymentId: string; orderId: string; status: string }> {
    const payment = store.getPayment(paymentId);
    if (!payment) throw AppError.notFound('Payment not found.');

    // Backstop: for real providers, if we're still pending, verify on demand so
    // we don't rely solely on webhook delivery.
    const order = store.getOrder(payment.orderId);
    if (
      order &&
      order.status === 'PAYMENT_PROCESSING' &&
      paymentProvider instanceof PaystackProvider &&
      payment.providerRef
    ) {
      const verified = await paymentProvider.verifyTransaction(payment.providerRef);
      if (verified === 'success') await this.confirmPayment(payment.providerRef, true);
      else if (verified === 'failed') await this.confirmPayment(payment.providerRef, false);
    }

    const current = store.getOrder(payment.orderId);
    return { paymentId, orderId: payment.orderId, status: current?.status ?? payment.status };
  },

  /** Dev-only: reproduce the webhook-driven timeline with timers. */
  simulateMockTimeline(providerRef: string) {
    const step = Math.max(400, env.mockStageMs);
    // Payment confirmed after one stage; fulfilment (success/fail) follows
    // inside confirmPayment via the telecom mock.
    setTimeout(() => {
      void this.confirmPayment(providerRef, true);
    }, step);
  },

  /** Retry a failed fulfilment for an already-paid order. */
  async retry(orderId: string) {
    const order = orderService.get(orderId);
    if (order.status !== 'FAILED') {
      throw AppError.conflict('Only failed transactions can be retried.');
    }
    const payment = store.getPaymentByOrder(orderId);
    if (!payment || payment.status === 'FAILED') {
      throw AppError.conflict('This transaction cannot be retried automatically. Please contact support.');
    }
    // Payment was captured; re-attempt delivery.
    await fulfilmentService.fulfil(orderService.get(orderId));
    return orderService.get(orderId);
  },
};
