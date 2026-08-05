import { env } from '../../config/env';
import { id } from '../../lib/ids';
import type { FulfilmentRequest, FulfilmentResult, TelecomProvider } from './types';

/**
 * Simulated data delivery. Succeeds most of the time and fails at
 * MOCK_FAILURE_RATE so the app's failure/refund UX is exercisable. Never used
 * in production (assertProductionConfig blocks TELECOM_PROVIDER=mock).
 */
export class MockTelecomProvider implements TelecomProvider {
  readonly id = 'mock';

  async deliver(_req: FulfilmentRequest): Promise<FulfilmentResult> {
    const failed = Math.random() < env.mockFailureRate;
    if (failed) {
      return {
        status: 'failed',
        reason: 'The network did not confirm delivery. Payment will be reviewed for a refund.',
      };
    }
    return { status: 'delivered', providerRef: id('mockdlv') };
  }
}
