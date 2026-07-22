import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { sanitizeCompanyRow } from "@/lib/company-config";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    if (user.role !== "super_admin") {
      throw new AuthError("仅超级管理员可查看公司详情", 403);
    }
    const { id } = await params;
    const companyId = Number(id);
    if (!companyId) return jsonError("公司 ID 无效");

    const result = await pool.query(
      `SELECT c.*,
        (SELECT COUNT(*)::int FROM users u WHERE u.company_id = c.id) AS user_count,
        (SELECT COUNT(*)::int FROM users u WHERE u.company_id = c.id AND u.status='active') AS active_user_count,
        (SELECT u.name FROM users u WHERE u.company_id = c.id AND u.role='company_admin' AND u.status='active' LIMIT 1) AS admin_name
       FROM companies c
       WHERE c.id = $1`,
      [companyId]
    );
    if (!result.rows[0]) return jsonError("公司不存在", 404);
    return jsonOk(sanitizeCompanyRow(result.rows[0]));
  } catch (err) {
    return handleApiError(err);
  }
}
