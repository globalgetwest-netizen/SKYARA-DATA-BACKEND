import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { env } from '../config/env';

/**
 * Pluggable persistence.
 *
 * - DATABASE_URL set  -> a Postgres key/value table (`kv`). Survives restarts on
 *   ephemeral hosts (Render free tier, etc.). Use a free Neon/Supabase DB.
 * - DATABASE_URL blank -> local JSON files under DATA_DIR (dev default).
 *
 * The store modules keep their simple shape (load a blob, save a blob); only the
 * backend behind these two functions changes. At larger scale you'd move to
 * real tables — the callers would be the only thing to revisit.
 */

const dir = path.isAbsolute(env.dataDir) ? env.dataDir : path.join(process.cwd(), env.dataDir);
let pool: Pool | null = null;

export function usingDatabase(): boolean {
  return !!pool;
}

export async function initStorage(): Promise<void> {
  if (env.databaseUrl) {
    pool = new Pool({
      connectionString: env.databaseUrl,
      // Managed Postgres (Neon/Supabase/Render) requires SSL.
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
    await pool.query(
      'CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz DEFAULT now())',
    );
    // eslint-disable-next-line no-console
    console.log('[Skyra] Persistence: Postgres');
  } else {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // eslint-disable-next-line no-console
    console.log('[Skyra] Persistence: local files (' + dir + ')');
  }
}

export async function loadKey<T>(key: string): Promise<T | null> {
  try {
    if (pool) {
      const res = await pool.query('SELECT value FROM kv WHERE key = $1', [key]);
      return (res.rows[0]?.value as T) ?? null;
    }
    const file = path.join(dir, key + '.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[Skyra] load ${key} failed:`, err);
    return null;
  }
}

export async function saveKey<T>(key: string, value: T): Promise<void> {
  try {
    if (pool) {
      await pool.query(
        'INSERT INTO kv (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()',
        [key, JSON.stringify(value)],
      );
      return;
    }
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, key + '.json');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[Skyra] save ${key} failed:`, err);
  }
}
