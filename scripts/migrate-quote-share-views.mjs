/**
 * Per-open timestamps for quote share views (P2).
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
    CREATE TABLE IF NOT EXISTS quote_share_views (
      id BIGSERIAL PRIMARY KEY,
      share_id BIGINT NOT NULL REFERENCES quote_shares(id) ON DELETE CASCADE,
      viewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_quote_share_views_share
      ON quote_share_views(share_id, viewed_at DESC);
  `);

  // 若已有 view_count 但无明细，补一条最近查看时间（无法还原历史）
  await pool.query(`
    INSERT INTO quote_share_views (share_id, viewed_at)
    SELECT s.id, COALESCE(s.last_viewed_at, s.created_at)
    FROM quote_shares s
    WHERE s.view_count > 0
      AND NOT EXISTS (SELECT 1 FROM quote_share_views v WHERE v.share_id = s.id)
  `);

  console.log("OK: quote_share_views");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
