import crypto from 'crypto';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { reference as makeRef } from '../../lib/ids';
import type { PaymentMethod } from '../../domain/types';
import type { ChargeRequest, ChargeResult, PaymentProvider, WebhookResult } from './types';

/**
 * Paystack integration (Ghana: Mobile Money + card).
 *
 * Uses the secret key server-side only. Amounts are sent in the currency's
 * subunit (pesewas = GHS * 100). Payment is confirmed by the signed webhook
 * (`charge.success`); the status endpoint additionally verifies on demand so we
 * never depend on the client to report success.
 *
 * Docs: https://paystack.com/docs
 */
export class PaystackProvider implements PaymentProvider {
  readonly id = 'paystack';
  // Paystack settles Mobile Money + cards. Airtime debit is NOT a PSP feature —
  // it is delivered by the data/airtime aggregator, so it is intentionally not
  // advertised here. Wire "airtime" through your aggregator (see docs/PROVIDERS).
  readonly methods: PaymentMethod[] = ['mobile_money', 'card'];

  private base = 'https://api.paystack.co';

  private headers() {
    if (!env.paystackSecretKey) {
      throw AppError.server('Paystack is not configured (PAYSTACK_SECRET_KEY missing).');
    }
    return {
      Authorization: `Bearer ${env.paystackSecretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const providerRef = makeRef('PSK').replace('-', '_');
    const channels = req.method === 'mobile_money' ? ['mobile_money'] : ['card'];

    const res = await fetch(`${this.base}/transaction/initialize`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        // Paystack requires an email; use a deterministic placeholder derived
        // from the recipient when the user has none on file.
        email: `${req.order.recipient.replace('+', '')}@skyradata.app`,
        amount: Math.round(req.order.total * 100), // pesewas
        currency: 'GHS',
        reference: providerRef,
        channels,
        callback_url: env.paystackCallbackUrl || undefined,
        metadata: {
          orderId: req.order.id,
          skyraReference: req.order.reference,
          recipient: req.order.recipient,
        },
      }),
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.status) {
      throw AppError.server(json?.message || 'Paystack could not initialise the payment.');
    }

    return {
      providerRef,
      authorizationUrl: json.data.authorization_url,
      completion: 'redirect',
    };
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookResult {
    const signature = headers['x-paystack-signature'];
    const expected = crypto
      .createHmac('sha512', env.paystackWebhookSecret)
      .update(rawBody)
      .digest('hex');

    if (!signature || signature !== expected) {
      // Signature mismatch — never trust the payload.
      return { kind: 'ignored' };
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    const providerRef = event?.data?.reference;
    if (!providerRef) return { kind: 'ignored' };

    if (event.event === 'charge.success' && event.data.status === 'success') {
      return { kind: 'payment_succeeded', providerRef };
    }
    if (event.event === 'charge.failed' || event.data?.status === 'failed') {
      return { kind: 'payment_failed', providerRef, reason: event.data?.gateway_response };
    }
    return { kind: 'ignored' };
  }

  /** On-demand verification used by the status endpoint as a webhook backstop. */
  async verifyTransaction(providerRef: string): Promise<'success' | 'failed' | 'pending'> {
    const res = await fetch(`${this.base}/transaction/verify/${encodeURIComponent(providerRef)}`, {
      headers: this.headers(),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.status) return 'pending';
    const status = json.data?.status;
    if (status === 'success') return 'success';
    if (status === 'failed' || status === 'abandoned') return 'failed';
    return 'pending';
  }
}
