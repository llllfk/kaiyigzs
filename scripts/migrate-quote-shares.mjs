/**
 * Quote share links for customer confirmation (P2).
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/sales_crm";

async function main() {
  const pool = new pg.Pool({ connectionString });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_shares (
      id BIGSERIAL PRIMARY KEY,
      quote_id BIGINT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      company_id BIGINT NOT NULL REFERENCES companies(id),
      token VARCHAR(64) NOT NULL UNIQUE,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      expires_at TIMESTAMPTZ NOT NULL,
      max_views INT NOT NULL DEFAULT 10,
      view_count INT NOT NULL DEFAULT 0,
      last_viewed_at TIMESTAMPTZ,
      confirmed_at TIMESTAMPTZ,
      confirmer_name VARCHAR(100),
      confirmer_note TEXT,
      created_by BIGINT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      revoked_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_quote_shares_quote ON quote_shares(quote_id);
    CREATE INDEX IF NOT EXISTS idx_quote_shares_token ON quote_shares(token);
    CREATE INDEX IF NOT EXISTS idx_quote_shares_active
      ON quote_shares(quote_id, status) WHERE status = 'active';
  `);
  console.log("OK: quote_shares");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
