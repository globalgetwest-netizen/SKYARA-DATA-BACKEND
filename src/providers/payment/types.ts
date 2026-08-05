import type { Order, PaymentMethod } from '../../domain/types';

export interface ChargeRequest {
  order: Order;
  method: PaymentMethod;
}

export interface ChargeResult {
  /** The provider's own reference for this charge (store it for reconciliation). */
  providerRef: string;
  /** Hosted checkout URL to open, or null for direct mobile-money charges. */
  authorizationUrl: string | null;
  /** Completion style the client should use. */
  completion: 'redirect' | 'poll';
}

export type WebhookResult =
  | { kind: 'payment_succeeded'; providerRef: string }
  | { kind: 'payment_failed'; providerRef: string; reason?: string }
  | { kind: 'ignored' };

/**
 * Every payment integration implements this interface. Services depend only on
 * it, so swapping Paystack ↔ Flutterwave ↔ mock is a registry change, never a
 * change to order/payment logic.
 */
export interface PaymentProvider {
  readonly id: string;
  /** Supported methods for the Ghana market, advertised to the client. */
  readonly methods: PaymentMethod[];

  /** Initialise a charge for an order. Secret keys are used here, server-side. */
  charge(req: ChargeRequest): Promise<ChargeResult>;

  /**
   * Verify + interpret a provider webhook. Implementations MUST verify the
   * signature against the raw body before trusting anything.
   */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): WebhookResult;
}
