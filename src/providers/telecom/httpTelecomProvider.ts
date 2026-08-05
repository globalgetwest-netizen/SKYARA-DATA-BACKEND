import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import type { FulfilmentRequest, FulfilmentResult, TelecomProvider } from './types';

/**
 * Template for a real data/airtime aggregator integration.
 *
 * Most Ghana bundle aggregators expose a "vend/deliver" endpoint that accepts
 * the network, recipient MSISDN and a plan id, and either confirms delivery
 * synchronously or returns a pending reference confirmed later by a callback.
 *
 * This is intentionally a thin, adaptable stub: set TELECOM_PROVIDER to your
 * aggregator's id, register this (or a subclass) in ./index.ts, and adjust the
 * request/response mapping to match your vendor's API.
 */
export class HttpTelecomProvider implements TelecomProvider {
  readonly id = 'http';

  async deliver(req: FulfilmentRequest): Promise<FulfilmentResult> {
    if (!env.telecomApiBaseUrl || !env.telecomApiKey) {
      throw AppError.server('Telecom provider is not configured (TELECOM_API_* missing).');
    }

    const res = await fetch(`${env.telecomApiBaseUrl.replace(/\/$/, '')}/vend`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.telecomApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network: req.network,
        recipient: req.recipient,
        planId: req.bundleId,
        reference: req.orderId,
      }),
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: 'failed', reason: json?.message || 'Delivery request was rejected.' };
    }

    // Map your vendor's response shape here:
    if (json.status === 'delivered' || json.status === 'success') {
      return { status: 'delivered', providerRef: json.reference ?? req.orderId };
    }
    if (json.status === 'pending' || json.status === 'processing') {
      return { status: 'processing', providerRef: json.reference ?? req.orderId };
    }
    return { status: 'failed', reason: json?.message ?? 'Delivery failed.' };
  }
}
