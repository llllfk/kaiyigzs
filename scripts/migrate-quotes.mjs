/**
 * Quotes + quote_items for multi-version quoting & approval (P0/P1).
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
    CREATE TABLE IF NOT EXISTS quotes (
      id BIGSERIAL PRIMARY KEY,
      company_id BIGINT NOT NULL REFERENCES companies(id),
      opportunity_id BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      owner_id BIGINT NOT NULL REFERENCES users(id),
      version INT NOT NULL DEFAULT 1,
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      title VARCHAR(200),
      currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
      list_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
      total NUMERIC(14, 2) NOT NULL DEFAULT 0,
      max_discount_pct NUMERIC(8, 2) NOT NULL DEFAULT 0,
      valid_until DATE,
      note TEXT,
      reject_reason TEXT,
      approver_id BIGINT REFERENCES users(id),
      submitted_at TIMESTAMPTZ,
      decided_at TIMESTAMPTZ,
      parent_quote_id BIGINT REFERENCES quotes(id) ON DELETE SET NULL,
      created_by BIGINT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_quotes_company ON quotes(company_id);
    CREATE INDEX IF NOT EXISTS idx_quotes_opportunity ON quotes(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_quotes_approver ON quotes(approver_id, status);

    CREATE TABLE IF NOT EXISTS quote_items (
      id BIGSERIAL PRIMARY KEY,
      quote_id BIGINT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      sort_order INT NOT NULL DEFAULT 0,
      name VARCHAR(300) NOT NULL,
      spec VARCHAR(300),
      qty NUMERIC(14, 4) NOT NULL DEFAULT 1,
      unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
      discount_pct NUMERIC(8, 2) NOT NULL DEFAULT 0,
      amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
  `);
  console.log("OK: quotes + quote_items");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
