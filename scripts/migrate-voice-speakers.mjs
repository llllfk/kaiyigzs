/**
 * voice_speakers — 公司复刻音色
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
    CREATE TABLE IF NOT EXISTS voice_speakers (
      id BIGSERIAL PRIMARY KEY,
      company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(100) NOT NULL,
      slot_index SMALLINT NOT NULL,
      sample_uri TEXT,
      sample_mime VARCHAR(100),
      sample_file_name VARCHAR(300),
      sample_size_bytes BIGINT,
      provider_speaker_id VARCHAR(200),
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      error_message TEXT,
      meta JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (company_id, slot_index)
    );
    CREATE INDEX IF NOT EXISTS idx_voice_speakers_company
      ON voice_speakers (company_id, status);
  `);
  console.log("voice_speakers table ready");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
