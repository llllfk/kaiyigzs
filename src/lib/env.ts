import { config } from 'dotenv';
import { resolve } from 'path';

let loaded = false;

/** Load `.env` then `.env.local` (local wins). Safe to call repeatedly. */
export function ensureProjectEnv(): void {
  if (loaded) return;

  const root = resolve(process.cwd());
  config({ path: resolve(root, '.env') });
  config({ path: resolve(root, '.env.local'), override: true });

  loaded = true;
}
