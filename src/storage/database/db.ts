import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ensureProjectEnv } from '@/lib/env';
import * as schema from './shared/schema';

let pool: Pool | null = null;

function getDatabaseUrl(): string {
  ensureProjectEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add it to .env.local and restart the server.'
    );
  }
  // node-pg does not support channel_binding; strip if present
  return url.replace(/([?&])channel_binding=[^&]*&?/g, '$1').replace(/[?&]$/, '');
}

function getPool(): Pool {
  if (pool) return pool;

  pool = new Pool({
    connectionString: getDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
    max: 10,
  });

  pool.on('error', (err: Error) => {
    console.error('[db] unexpected pool error', err);
  });

  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export async function closeDb(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}
