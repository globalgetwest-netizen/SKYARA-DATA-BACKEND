import { env } from '../../config/env';
import { MockPaymentProvider } from './mockPaymentProvider';
import { PaystackProvider } from './paystackProvider';
import type { PaymentProvider } from './types';

/**
 * Selects the active payment provider from configuration. Add a new provider by
 * implementing PaymentProvider and registering it here — no service changes.
 */
function build(): PaymentProvider {
  switch (env.paymentProvider) {
    case 'paystack':
      return new PaystackProvider();
    // case 'flutterwave': return new FlutterwaveProvider();
    case 'mock':
    default:
      return new MockPaymentProvider();
  }
}

export const paymentProvider = build();
export type { PaymentProvider } from './types';
