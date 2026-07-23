import pool from "@/lib/db";

const TABLES = new Set([
  "customers",
  "opportunities",
  "quotes",
  "tasks",
  "media_assets",
  "kb_files",
]);

export async function resolvePublicRecordId(table: string, value: string | number) {
  if (!TABLES.has(table)) throw new Error("Unsupported public ID table");
  const key = String(value || "").trim().toUpperCase();
  if (!key) return null;
  const result = await pool.query(
    `SELECT id, public_id FROM ${table}
     WHERE public_id = $1
        OR id = CASE WHEN $1 ~ '^[0-9]+$' THEN $1::bigint ELSE NULL END
     LIMIT 1`,
    [key]
  );
  return result.rows[0] as { id: string | number; public_id: string } | undefined;
}
