import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { canViewAudit } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!canViewAudit(user.role)) throw new AuthError("无权查看审计日志", 403);

    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    if (user.role === "super_admin") {
      const result = await pool.query(
        `SELECT a.*, u.name AS actor_name, u.email AS actor_email
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
         WHERE ($1 = '' OR a.action ILIKE $2 OR a.summary ILIKE $2)
         ORDER BY a.created_at DESC
         LIMIT 200`,
        [q, `%${q}%`]
      );
      return jsonOk(result.rows);
    }

    const result = await pool.query(
      `SELECT a.*, u.name AS actor_name, u.email AS actor_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.company_id = $1
         AND ($2 = '' OR a.action ILIKE $3 OR a.summary ILIKE $3)
       ORDER BY a.created_at DESC
       LIMIT 200`,
      [user.company_id, q, `%${q}%`]
    );
    return jsonOk(result.rows);
  } catch (err) {
    return handleApiError(err);
  }
}
