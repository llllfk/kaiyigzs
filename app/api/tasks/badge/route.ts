import { requireSession } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import pool from "@/lib/db";
import { crmRole, getVisibleOwnerIds } from "@/lib/permissions";

/** 底栏角标：可见范围内未完成的逾期 + 今日截止待办数 */
export async function GET() {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const owners = await getVisibleOwnerIds(user);
    const params: unknown[] = [user.company_id];
    let ownerSql = "";
    if (owners === "all" || owners === "company" || crmRole(user) === "company_admin") {
      // company_id 已限制
    } else {
      params.push(owners);
      ownerSql = ` AND owner_id = ANY($${params.length}::bigint[])`;
    }

    const shToday = `((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AT TIME ZONE 'Asia/Shanghai')`;
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE due_at IS NOT NULL AND due_at < ${shToday}
         )::int AS overdue,
         COUNT(*) FILTER (
           WHERE due_at IS NOT NULL
             AND due_at >= ${shToday}
             AND due_at < ${shToday} + INTERVAL '1 day'
         )::int AS urgent
       FROM tasks
       WHERE company_id = $1
         AND status = 'pending'
         ${ownerSql}`,
      params
    );

    const overdue = Number(rows[0]?.overdue) || 0;
    const urgent = Number(rows[0]?.urgent) || 0;
    return jsonOk({
      overdue,
      urgent,
      total: overdue + urgent,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
