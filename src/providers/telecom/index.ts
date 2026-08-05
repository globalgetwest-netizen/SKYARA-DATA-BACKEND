import { env } from '../../config/env';
import { MockTelecomProvider } from './mockTelecomProvider';
import { HttpTelecomProvider } from './httpTelecomProvider';
import type { TelecomProvider } from './types';

function build(): TelecomProvider {
  switch (env.telecomProvider) {
    case 'mock':
      return new MockTelecomProvider();
    default:
      // Any non-mock value uses the HTTP aggregator template.
      return new HttpTelecomProvider();
  }
}

export const telecomProvider = build();
export type { TelecomProvider } from './types';
