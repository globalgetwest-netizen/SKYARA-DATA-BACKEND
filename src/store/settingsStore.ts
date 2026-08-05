import { env } from '../config/env';
import { loadKey, saveKey } from './persist';

/**
 * Runtime settings editable from the admin dashboard. Seeded from env on first
 * run, then owned by the JSON file. Read by /config, order pricing, and USSD.
 */
export interface Settings {
  processingFeeGhs: number;
  ussdShortCode: string;
}

const KEY = 'settings';

class SettingsStore {
  private data: Settings;

  constructor() {
    this.data = {
      processingFeeGhs: env.processingFeeGhs,
      ussdShortCode: env.ussdShortCode,
    };
  }

  async hydrate(): Promise<void> {
    const saved = await loadKey<Settings>(KEY);
    if (saved && typeof saved.processingFeeGhs === 'number') {
      this.data = saved;
    } else {
      await saveKey(KEY, this.data);
    }
  }

  get(): Settings {
    return this.data;
  }

  update(patch: Partial<Settings>): Settings {
    this.data = {
      processingFeeGhs:
        typeof patch.processingFeeGhs === 'number' && patch.processingFeeGhs >= 0
          ? patch.processingFeeGhs
          : this.data.processingFeeGhs,
      ussdShortCode: patch.ussdShortCode?.trim() || this.data.ussdShortCode,
    };
    void saveKey(KEY, this.data);
    return this.data;
  }
}

export const settingsStore = new SettingsStore();
