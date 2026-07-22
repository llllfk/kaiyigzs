import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("缺少 DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });

async function main() {
  await pool.query(`
    ALTER TABLE kb_files
      ADD COLUMN IF NOT EXISTS coze_document_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS coze_dataset_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS coze_sync_status VARCHAR(20),
      ADD COLUMN IF NOT EXISTS coze_sync_error TEXT
  `);
  console.log("kb_files coze columns ready");
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
