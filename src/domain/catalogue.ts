import { env } from '../config/env';
import type { Bundle, Network, NetworkCode } from './types';

/**
 * Catalogue source of truth for the backend.
 *
 * In a real deployment this comes from your data/telecom aggregator (often
 * cached in a database and refreshed on a schedule), so prices are always
 * current. It is defined here as static data purely to make the server
 * runnable out of the box. Prices are illustrative — replace with live tariffs.
 */

export const NETWORKS: Network[] = [
  { code: 'MTN', name: 'MTN Ghana', logo: env.logoUrls.MTN, status: 'available' },
  { code: 'TELECEL', name: 'Telecel Ghana', logo: env.logoUrls.TELECEL, status: 'available' },
  { code: 'AT', name: 'AT Ghana', logo: env.logoUrls.AT, status: 'available' },
];

function b(
  network: NetworkCode,
  id: string,
  name: string,
  volume: number,
  unit: 'MB' | 'GB',
  price: number,
  validity: string,
  badge: string | null = null,
): Bundle {
  return {
    id,
    network,
    name,
    volume,
    unit,
    price,
    currency: 'GHS',
    validity,
    category: 'data',
    badge,
    available: true,
  };
}

export const BUNDLES: Record<NetworkCode, Bundle[]> = {
  MTN: [
    b('MTN', 'mtn_500mb', '500 MB', 500, 'MB', 6, '24 hours'),
    b('MTN', 'mtn_1gb', '1 GB', 1, 'GB', 10, '24 hours', 'Popular'),
    b('MTN', 'mtn_2gb', '2 GB', 2, 'GB', 18, '3 days'),
    b('MTN', 'mtn_5gb', '5 GB', 5, 'GB', 35, '7 days', 'Best value'),
    b('MTN', 'mtn_10gb', '10 GB', 10, 'GB', 62, '30 days'),
  ],
  TELECEL: [
    b('TELECEL', 'tel_1gb', '1 GB', 1, 'GB', 9, '24 hours'),
    b('TELECEL', 'tel_3gb', '3 GB', 3, 'GB', 24, '7 days', 'Popular'),
    b('TELECEL', 'tel_6gb', '6 GB', 6, 'GB', 40, '30 days', 'Best value'),
    b('TELECEL', 'tel_12gb', '12 GB', 12, 'GB', 70, '30 days'),
  ],
  AT: [
    b('AT', 'at_750mb', '750 MB', 750, 'MB', 5, '24 hours'),
    b('AT', 'at_2gb', '2 GB', 2, 'GB', 15, '3 days', 'Popular'),
    b('AT', 'at_4gb', '4 GB', 4, 'GB', 28, '7 days'),
    b('AT', 'at_8gb', '8 GB', 8, 'GB', 50, '30 days', 'Best value'),
  ],
};

export function findBundle(network: NetworkCode, bundleId: string): Bundle | undefined {
  return BUNDLES[network]?.find((x) => x.id === bundleId);
}

export function networkName(code: NetworkCode): string {
  return NETWORKS.find((n) => n.code === code)?.name ?? code;
}
