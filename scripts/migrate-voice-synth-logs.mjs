/**
 * voice_synth_logs — 语音合成使用明细（平台可查）
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
    CREATE TABLE IF NOT EXISTS voice_synth_logs (
      id BIGSERIAL PRIMARY KEY,
      company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      source VARCHAR(16) NOT NULL,
      voice_speaker_id BIGINT REFERENCES voice_speakers(id) ON DELETE SET NULL,
      official_speaker_id VARCHAR(200),
      speaker_label VARCHAR(200),
      icl_model_type SMALLINT,
      status VARCHAR(16) NOT NULL DEFAULT 'success',
      error_message TEXT,
      text_content TEXT NOT NULL DEFAULT '',
      text_char_count INT NOT NULL DEFAULT 0,
      context_text TEXT,
      duration_sec NUMERIC(10, 2),
      audio_bytes INT,
      saved BOOLEAN NOT NULL DEFAULT FALSE,
      saved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_voice_synth_logs_speaker
      ON voice_synth_logs (voice_speaker_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_voice_synth_logs_official
      ON voice_synth_logs (official_speaker_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_voice_synth_logs_company
      ON voice_synth_logs (company_id, created_at DESC);
  `);
  console.log("voice_synth_logs table ready");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
