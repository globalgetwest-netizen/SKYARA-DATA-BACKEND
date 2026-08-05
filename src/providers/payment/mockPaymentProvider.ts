import { id } from '../../lib/ids';
import type { PaymentMethod } from '../../domain/types';
import type { ChargeRequest, ChargeResult, PaymentProvider, WebhookResult } from './types';

/**
 * Local payment simulator. No external account required.
 *
 * `charge()` returns a poll-style result immediately; the payment service
 * schedules the simulated confirmation (see paymentService). `verifyWebhook`
 * understands a simple JSON body so you can also drive it manually via
 * `POST /webhooks/mock`:
 *   { "providerRef": "...", "event": "success" | "failed" }
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock';
  // Mock supports every rail so the whole app (incl. Pay with Airtime) is
  // testable without any external account.
  readonly methods: PaymentMethod[] = ['mobile_money', 'card', 'airtime'];

  async charge(_req: ChargeRequest): Promise<ChargeResult> {
    return {
      providerRef: id('mockpay'),
      authorizationUrl: null,
      completion: 'poll',
    };
  }

  verifyWebhook(rawBody: Buffer): WebhookResult {
    try {
      const body = JSON.parse(rawBody.toString('utf8'));
      if (!body?.providerRef) return { kind: 'ignored' };
      if (body.event === 'failed') {
        return { kind: 'payment_failed', providerRef: body.providerRef, reason: body.reason };
      }
      return { kind: 'payment_succeeded', providerRef: body.providerRef };
    } catch {
      return { kind: 'ignored' };
    }
  }
}
