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
  "postgresql://postgres:postgres@localhost:5432/sales_crm";

async function main() {
  const pool = new pg.Pool({ connectionString });
  const schema = fs.readFileSync(path.join(root, "sql", "schema.sql"), "utf8");
  await pool.query(schema);

  const existing = await pool.query(
    `SELECT id FROM users WHERE email = $1`,
    ["admin@kaiyi.local"]
  );

  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash("Admin123!", 10);
    await pool.query(
      `INSERT INTO users (company_id, role, name, email, password_hash, status)
       VALUES (NULL, 'super_admin', '超级管理员', 'admin@kaiyi.local', $1, 'active')`,
      [hash]
    );
    console.log("Created super admin: admin@kaiyi.local / Admin123!");
  } else {
    console.log("Super admin already exists");
  }

  await pool.end();
  console.log("Database initialized.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
