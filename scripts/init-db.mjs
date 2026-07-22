import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
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
  "postgresql://postgres:postgres@127.0.0.1:5433/sales_crm";

async function ensureUser(pool, params) {
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [
    params.email,
  ]);
  if (existing.rows[0]) {
    if (params.phone) {
      await pool.query(
        `UPDATE users SET phone = COALESCE(phone, $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [params.phone, existing.rows[0].id]
      );
    }
    return existing.rows[0].id;
  }
  const hash = await bcrypt.hash(params.password, 10);
  const res = await pool.query(
    `INSERT INTO users
      (company_id, manager_id, role, name, email, phone, password_hash, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
     RETURNING id`,
    [
      params.companyId ?? null,
      params.managerId ?? null,
      params.role,
      params.name,
      params.email,
      params.phone ?? null,
      hash,
    ]
  );
  console.log(
    `Created ${params.role}: ${params.email}${params.phone ? ` / ${params.phone}` : ""} / ${params.password}`
  );
  return res.rows[0].id;
}

async function main() {
  const pool = new pg.Pool({ connectionString });
  const schema = fs.readFileSync(path.join(root, "sql", "schema.sql"), "utf8");
  await pool.query(schema);

  await ensureUser(pool, {
    role: "super_admin",
    name: "超级管理员",
    email: "admin@kaiyi.local",
    phone: "13800000001",
    password: "Admin123!",
  });

  // Demo company + roles so full CRM menus are visible
  let companyId;
  const company = await pool.query(
    `SELECT id FROM companies WHERE name = $1 LIMIT 1`,
    ["凯艺演示科技"]
  );
  if (company.rows[0]) {
    companyId = company.rows[0].id;
    console.log("Demo company already exists");
  } else {
    const created = await pool.query(
      `INSERT INTO companies (name, status, config)
       VALUES ('凯艺演示科技', 'active', '{}'::jsonb)
       RETURNING id`
    );
    companyId = created.rows[0].id;
    console.log("Created demo company: 凯艺演示科技");
  }

  // default pool recycle days = 7
  await pool.query(
    `UPDATE companies SET
      config = COALESCE(config, '{}'::jsonb) || '{"pool_recycle_days": 7}'::jsonb
     WHERE id = $1`,
    [companyId]
  );

  const companyAdminId = await ensureUser(pool, {
    companyId,
    role: "company_admin",
    name: "公司管理员",
    email: "company@kaiyi.local",
    phone: "13800000002",
    password: "Company123!",
  });

  const managerId = await ensureUser(pool, {
    companyId,
    role: "sales_manager",
    name: "销售经理",
    email: "manager@kaiyi.local",
    phone: "13800000003",
    password: "Manager123!",
  });

  await ensureUser(pool, {
    companyId,
    managerId,
    role: "sales",
    name: "销售人员",
    email: "sales@kaiyi.local",
    phone: "13800000004",
    password: "Sales123!",
  });

  // Ensure company admin uniqueness is satisfied (already one)
  void companyAdminId;

  await pool.end();
  console.log("Database initialized.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
