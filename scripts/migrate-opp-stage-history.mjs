/**
 * Add opportunity_stage_history for stage transition timeline.
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
    CREATE TABLE IF NOT EXISTS opportunity_stage_history (
      id BIGSERIAL PRIMARY KEY,
      company_id BIGINT NOT NULL REFERENCES companies(id),
      opportunity_id BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      actor_id BIGINT REFERENCES users(id),
      from_stage VARCHAR(32),
      to_stage VARCHAR(32) NOT NULL,
      reason TEXT,
      source VARCHAR(32) NOT NULL DEFAULT 'manual',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_opp_stage_history_opp_created
      ON opportunity_stage_history (opportunity_id, created_at DESC)
  `);
  console.log("OK: opportunity_stage_history");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
