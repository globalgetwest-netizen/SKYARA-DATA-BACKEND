import { AppError } from '../lib/errors';
import { id } from '../lib/ids';
import { env } from '../config/env';
import { BUNDLES as SEED_BUNDLES, NETWORKS as SEED_NETWORKS } from '../domain/catalogue';
import type { Bundle, Network, NetworkCode } from '../domain/types';
import { loadKey, saveKey } from './persist';

/**
 * Persistent catalogue (networks + bundles), editable from the admin dashboard
 * and served live to the app. Seeded from the static defaults on first run,
 * then owned by the JSON file so admin edits survive restarts.
 */
interface CatalogueData {
  networks: Network[];
  bundles: Bundle[]; // flat list; each carries its `network`
}

const KEY = 'catalogue';

function seed(): CatalogueData {
  const networks = SEED_NETWORKS.map((n) => ({
    ...n,
    logo: env.logoUrls[n.code] ?? n.logo ?? null,
  }));
  const bundles = (Object.values(SEED_BUNDLES).flat() as Bundle[]).map((b) => ({ ...b }));
  return { networks, bundles };
}

class CatalogueStore {
  private data: CatalogueData;

  constructor() {
    // Seed synchronously so the store is usable immediately; hydrate() loads any
    // persisted data before the server starts serving.
    this.data = seed();
  }

  async hydrate(): Promise<void> {
    const saved = await loadKey<CatalogueData>(KEY);
    if (saved && Array.isArray(saved.networks) && Array.isArray(saved.bundles)) {
      this.data = saved;
    } else {
      await saveKey(KEY, this.data);
    }
  }

  private persist() {
    void saveKey(KEY, this.data);
  }

  /* Reads (public app) ------------------------------------------- */
  getNetworks(): Network[] {
    return this.data.networks;
  }
  getNetwork(code: NetworkCode): Network | undefined {
    return this.data.networks.find((n) => n.code === code);
  }
  getBundlesFor(code: NetworkCode, onlyAvailable = false): Bundle[] {
    return this.data.bundles
      .filter((b) => b.network === code && (!onlyAvailable || b.available))
      .sort((a, b) => a.price - b.price);
  }
  getBundle(bundleId: string): Bundle | undefined {
    return this.data.bundles.find((b) => b.id === bundleId);
  }

  /* Admin: bundles ----------------------------------------------- */
  allBundles(): Bundle[] {
    return this.data.bundles;
  }

  createBundle(input: {
    id?: string;
    network: NetworkCode;
    name: string;
    volume: number;
    unit: 'MB' | 'GB';
    price: number;
    validity: string;
    category?: Bundle['category'];
    badge?: string | null;
    available?: boolean;
  }): Bundle {
    if (!this.getNetwork(input.network)) throw AppError.validation('Unknown network.');
    const bundle: Bundle = {
      id: input.id?.trim() || id('bnd'),
      network: input.network,
      name: input.name,
      volume: input.volume,
      unit: input.unit,
      price: input.price,
      currency: 'GHS',
      validity: input.validity,
      category: input.category ?? 'data',
      badge: input.badge ?? null,
      available: input.available ?? true,
    };
    if (this.getBundle(bundle.id)) throw AppError.conflict('A bundle with that id already exists.');
    this.data.bundles.push(bundle);
    this.persist();
    return bundle;
  }

  updateBundle(bundleId: string, patch: Partial<Bundle>): Bundle {
    const bundle = this.getBundle(bundleId);
    if (!bundle) throw AppError.notFound('Bundle not found.');
    Object.assign(bundle, {
      name: patch.name ?? bundle.name,
      volume: patch.volume ?? bundle.volume,
      unit: patch.unit ?? bundle.unit,
      price: patch.price ?? bundle.price,
      validity: patch.validity ?? bundle.validity,
      category: patch.category ?? bundle.category,
      badge: patch.badge === undefined ? bundle.badge : patch.badge,
      available: patch.available === undefined ? bundle.available : patch.available,
      currency: 'GHS',
    });
    this.persist();
    return bundle;
  }

  deleteBundle(bundleId: string): void {
    const before = this.data.bundles.length;
    this.data.bundles = this.data.bundles.filter((b) => b.id !== bundleId);
    if (this.data.bundles.length === before) throw AppError.notFound('Bundle not found.');
    this.persist();
  }

  /* Admin: networks ---------------------------------------------- */
  updateNetwork(code: NetworkCode, patch: Partial<Pick<Network, 'name' | 'status' | 'logo'>>): Network {
    const network = this.getNetwork(code);
    if (!network) throw AppError.notFound('Network not found.');
    Object.assign(network, {
      name: patch.name ?? network.name,
      status: patch.status ?? network.status,
      logo: patch.logo === undefined ? network.logo : patch.logo,
    });
    this.persist();
    return network;
  }
}

export const catalogueStore = new CatalogueStore();
