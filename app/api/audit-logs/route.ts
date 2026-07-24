import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError, isActingAsCompany } from "@/lib/auth";
import { canViewAudit } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { parsePageParams, resolvePagination } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!canViewAudit(user)) throw new AuthError("无权查看审计日志", 403);

    const sp = request.nextUrl.searchParams;
    const q = sp.get("q")?.trim() || "";
    const actorId = sp.get("actor_id")?.trim() || "";
    const category = sp.get("category")?.trim() || "";
    const from = sp.get("from")?.trim() || "";
    const to = sp.get("to")?.trim() || "";
    const companyIdParam = sp.get("company_id")?.trim() || "";
    const { page, pageSize } = parsePageParams(sp, { always: true });

    const params: unknown[] = [];
    const where: string[] = [];
    const platformWide = user.role === "super_admin" && !isActingAsCompany(user);

    if (!platformWide) {
      params.push(user.company_id);
      where.push(`a.company_id = $${params.length}`);
      // 超级管理员操作的审计仅平台超管可见
      where.push(
        `NOT EXISTS (
          SELECT 1 FROM users su
          WHERE su.id = a.actor_id AND su.role = 'super_admin'
        )`
      );
    } else if (companyIdParam) {
      params.push(Number(companyIdParam));
      where.push(`a.company_id = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      where.push(
        `(a.action ILIKE $${params.length} OR a.summary ILIKE $${params.length} OR COALESCE(u.name, '') ILIKE $${params.length} OR COALESCE(c.name, '') ILIKE $${params.length})`
      );
    }

    if (actorId === "system") {
      where.push(`a.actor_id IS NULL`);
    } else if (actorId) {
      params.push(Number(actorId));
      where.push(`a.actor_id = $${params.length}`);
    }

    if (category === "auth") {
      where.push(`a.action IN ('login', 'logout')`);
    } else if (category) {
      params.push(category);
      const i = params.length;
      where.push(`(a.action = $${i} OR a.action LIKE ($${i} || '.%'))`);
    }

    if (from) {
      params.push(from);
      where.push(`a.created_at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      where.push(`a.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const fromSql = `FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_id
      LEFT JOIN companies c ON c.id = a.company_id
      ${whereSql}`;

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total ${fromSql}`,
      params
    );
    const total = countRes.rows[0]?.total ?? 0;
    const { meta, offset, limit } = resolvePagination(total, page, pageSize);

    const listParams = [...params, limit, offset];
    const result = await pool.query(
      `SELECT a.*, u.name AS actor_name, u.email AS actor_email,
              c.name AS company_name
       ${fromSql}
       ORDER BY a.created_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    return jsonOk(result.rows, 200, {
      ...meta,
      platform_wide: platformWide,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
