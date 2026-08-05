import type { NetworkCode } from '../../domain/types';

export interface FulfilmentRequest {
  orderId: string;
  network: NetworkCode;
  recipient: string; // E.164
  bundleId: string;
}

export type FulfilmentResult =
  | { status: 'delivered'; providerRef: string }
  | { status: 'processing'; providerRef: string } // async; confirmed later via callback
  | { status: 'failed'; reason: string };

/**
 * Delivers a data bundle to a recipient on a Ghana network. Backed by a
 * carrier/aggregator API in production. The fulfilment service depends only on
 * this interface, so the delivery vendor can change without touching order or
 * payment logic.
 */
export interface TelecomProvider {
  readonly id: string;
  deliver(req: FulfilmentRequest): Promise<FulfilmentResult>;
}
