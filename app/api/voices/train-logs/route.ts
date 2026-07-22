import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { parsePageParams, resolvePagination } from "@/lib/pagination";
import { readableAuditSummary } from "@/lib/audit-labels";
import { canViewAllCompanyVoiceLogs } from "@/lib/role-access";

function requireCompanyId(user: Awaited<ReturnType<typeof requireSession>>) {
  if (!user.company_id) {
    throw new AuthError("请先进入公司视图", 403);
  }
  return Number(user.company_id);
}

const TRAIN_ACTION_OPTIONS = [
  "voice.train",
  "voice.platform_assign",
  "voice.platform_update",
  "voice.delete",
  "voice.create",
] as const;

/**
 * 公司端：训练 / 分配相关审计（voice.*，排除 synthesize）
 * 管理员/经理看全公司；销售仅本人操作记录
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    const companyId = requireCompanyId(user);
    const viewAll = canViewAllCompanyVoiceLogs(user);

    const sp = request.nextUrl.searchParams;
    const { page, pageSize } = parsePageParams(sp, { always: true });
    const action = String(sp.get("action") || "").trim();
    const actorId = String(sp.get("actor_id") || "").trim();
    const from = String(sp.get("from") || "").trim();
    const to = String(sp.get("to") || "").trim();
    const q = String(sp.get("q") || "").trim();

    if (action && !(TRAIN_ACTION_OPTIONS as readonly string[]).includes(action)) {
      return jsonError("不支持的动作类型");
    }

    const params: unknown[] = [companyId];
    const where: string[] = [
      `a.company_id = $1`,
      `a.action LIKE 'voice.%'`,
      `a.action NOT LIKE 'voice.synthesize%'`,
    ];

    if (!viewAll) {
      params.push(Number(user.id));
      where.push(`a.actor_id = $${params.length}`);
    } else if (actorId === "system") {
      where.push(`a.actor_id IS NULL`);
    } else if (actorId) {
      params.push(Number(actorId));
      where.push(`a.actor_id = $${params.length}`);
    }

    if (action) {
      params.push(action);
      where.push(`a.action = $${params.length}`);
    }
    if (from) {
      params.push(from);
      where.push(`a.created_at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      where.push(`a.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(
        `(a.summary ILIKE $${params.length} OR a.action ILIKE $${params.length} OR COALESCE(u.name, '') ILIKE $${params.length})`
      );
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const fromSql = `FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_id
      ${whereSql}`;

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total ${fromSql}`,
      params
    );
    const total = countRes.rows[0]?.total ?? 0;
    const { meta, offset, limit } = resolvePagination(total, page, pageSize);

    const listParams = [...params, limit, offset];
    const result = await pool.query(
      `SELECT a.id, a.action, a.summary, a.actor_id, a.target_type, a.target_id,
              a.created_at, u.name AS actor_name
       ${fromSql}
       ORDER BY a.created_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    const items = result.rows.map(
      (row: {
        id: number;
        action: string;
        summary: string | null;
        actor_id: number | null;
        actor_name: string | null;
        target_type: string | null;
        target_id: string | null;
        created_at: string;
      }) => {
        const short = readableAuditSummary(row.action, row.summary);
        return {
          id: Number(row.id),
          action: row.action,
          summary: short === "—" ? null : short,
          actor_id: row.actor_id != null ? Number(row.actor_id) : null,
          actor_name: row.actor_name || null,
          target_type: row.target_type || null,
          target_id: row.target_id || null,
          created_at: row.created_at,
        };
      }
    );

    return jsonOk(items, 200, { ...meta, scope: viewAll ? "company" : "self" });
  } catch (err) {
    return handleApiError(err);
  }
}
