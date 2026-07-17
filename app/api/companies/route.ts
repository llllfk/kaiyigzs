import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, hashPassword, AuthError } from "@/lib/auth";
import { writeAuditLog, createNotification } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireSession();
    if (user.role !== "super_admin") throw new AuthError("仅超管可查看公司列表", 403);
    const result = await pool.query(
      `SELECT c.*,
        (SELECT COUNT(*)::int FROM users u WHERE u.company_id = c.id AND u.status='active') AS user_count,
        (SELECT u.name FROM users u WHERE u.company_id = c.id AND u.role='company_admin' AND u.status='active' LIMIT 1) AS admin_name
       FROM companies c
       ORDER BY c.id DESC`
    );
    return jsonOk(result.rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role !== "super_admin") throw new AuthError("仅超管可创建公司", 403);

    const body = await request.json();
    const name = String(body.name || "").trim();
    const adminName = String(body.admin_name || "").trim();
    const adminEmail = String(body.admin_email || "").trim().toLowerCase();
    const adminPassword = String(body.admin_password || "Admin123!");

    if (!name || !adminName || !adminEmail) {
      return jsonError("公司名称与管理员信息必填");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const company = await client.query(
        `INSERT INTO companies (name, status, config)
         VALUES ($1, 'active', '{}'::jsonb)
         RETURNING *`,
        [name]
      );
      const companyId = company.rows[0].id;
      const passwordHash = await hashPassword(adminPassword);
      const admin = await client.query(
        `INSERT INTO users
          (company_id, role, name, email, password_hash, status)
         VALUES ($1, 'company_admin', $2, $3, $4, 'active')
         RETURNING id, company_id, role, name, email, status`,
        [companyId, adminName, adminEmail, passwordHash]
      );
      await client.query("COMMIT");

      await writeAuditLog({
        user,
        companyId,
        action: "company.create",
        targetType: "company",
        targetId: companyId,
        summary: `创建公司 ${name}，管理员 ${adminEmail}`,
      });

      await createNotification({
        companyId,
        userId: admin.rows[0].id,
        type: "account",
        title: "公司已开通",
        body: `公司「${name}」已创建，您是公司管理员。`,
        link: "/dashboard",
      });

      return jsonOk({ company: company.rows[0], admin: admin.rows[0] }, 201);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleApiError(err);
  }
}
