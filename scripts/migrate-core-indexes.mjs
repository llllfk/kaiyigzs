/**
 * Add composite indexes on core CRM tables for list/dashboard filters.
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

const INDEXES = [
  [
    "idx_customers_company_pool_status",
    `CREATE INDEX IF NOT EXISTS idx_customers_company_pool_status
       ON customers (company_id, pool_status, status)`,
  ],
  [
    "idx_customers_owner_pool",
    `CREATE INDEX IF NOT EXISTS idx_customers_owner_pool
       ON customers (owner_id, pool_status)`,
  ],
  [
    "idx_follow_ups_customer_followed",
    `CREATE INDEX IF NOT EXISTS idx_follow_ups_customer_followed
       ON follow_ups (customer_id, followed_at DESC)`,
  ],
  [
    "idx_tasks_company_status_due",
    `CREATE INDEX IF NOT EXISTS idx_tasks_company_status_due
       ON tasks (company_id, status, due_at)`,
  ],
  [
    "idx_tasks_owner_status",
    `CREATE INDEX IF NOT EXISTS idx_tasks_owner_status
       ON tasks (owner_id, status)`,
  ],
  [
    "idx_opportunities_company_stage",
    `CREATE INDEX IF NOT EXISTS idx_opportunities_company_stage
       ON opportunities (company_id, stage)`,
  ],
  [
    "idx_opportunities_owner_stage",
    `CREATE INDEX IF NOT EXISTS idx_opportunities_owner_stage
       ON opportunities (owner_id, stage)`,
  ],
  [
    "idx_audit_logs_company_created",
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created
       ON audit_logs (company_id, created_at DESC)`,
  ],
];

async function main() {
  const pool = new pg.Pool({ connectionString });
  for (const [name, sql] of INDEXES) {
    await pool.query(sql);
    console.log(`OK: ${name}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
