import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import {
  canSearchCustomersByOwner,
  crmRole,
  getVisibleOwnerIds,
} from "@/lib/permissions";
import { writeAuditLog, createNotification } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import type { SessionUser } from "@/types";

type TaskRow = {
  id: number;
  owner_id: number;
  title: string;
};

/** 上海时区当天 0 点（timestamptz），与前端本地日期判定对齐 */
const SHANGHAI_TODAY_START = `((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AT TIME ZONE 'Asia/Shanghai')`;

async function remindScope(user: SessionUser) {
  if (!user.company_id) {
    return { error: "缺少公司信息" as const, status: 400 as const };
  }
  if (!canSearchCustomersByOwner(user)) {
    return {
      error: "仅公司管理员或销售经理可一键催办" as const,
      status: 403 as const,
    };
  }

  const owners = await getVisibleOwnerIds(user);
  const params: unknown[] = [user.company_id, user.id];
  let ownerSql = "";
  if (owners === "all" || owners === "company" || crmRole(user) === "company_admin") {
    // company_id 已限制
  } else {
    params.push(owners);
    ownerSql = ` AND owner_id = ANY($${params.length}::bigint[])`;
  }

  const overdueSql = `company_id = $1
    AND owner_id IS NOT NULL
    AND status = 'pending'
    AND due_at IS NOT NULL
    AND due_at < ${SHANGHAI_TODAY_START}
    ${ownerSql}`;

  return { params, overdueSql };
}

/** 预览：逾期总数 + 可催办数（排除自己） */
export async function GET() {
  try {
    const user = await requireSession();
    const scope = await remindScope(user);
    if ("error" in scope) {
      return jsonError(scope.error ?? "未知错误", scope.status);
    }

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS overdue_total,
              COUNT(*) FILTER (WHERE owner_id <> $2)::int AS task_count,
              COUNT(*) FILTER (WHERE owner_id = $2)::int AS self_count,
              COUNT(DISTINCT owner_id) FILTER (WHERE owner_id <> $2)::int AS owner_count
       FROM tasks
       WHERE ${scope.overdueSql}`,
      scope.params
    );

    return jsonOk({
      overdue_total: Number(rows[0]?.overdue_total || 0),
      task_count: Number(rows[0]?.task_count || 0),
      self_count: Number(rows[0]?.self_count || 0),
      owner_count: Number(rows[0]?.owner_count || 0),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/** 公司管理员 / 销售经理：一键催办可见范围内「已逾期」且非本人的未完成待办 */
export async function POST() {
  try {
    const user = await requireSession();
    const scope = await remindScope(user);
    if ("error" in scope) {
      return jsonError(scope.error ?? "未知错误", scope.status);
    }

    const { rows } = await pool.query(
      `SELECT id, owner_id, title
       FROM tasks
       WHERE ${scope.overdueSql}
         AND owner_id <> $2
       ORDER BY due_at ASC, id DESC
       LIMIT 200`,
      scope.params
    );

    const tasks = rows as TaskRow[];
    if (tasks.length === 0) {
      return jsonOk({
        ok: true,
        task_count: 0,
        owner_count: 0,
        skipped: 0,
        message: "暂无需要催办的逾期待办",
      });
    }

    const byOwner = new Map<number, { titles: string[]; ids: number[] }>();
    for (const t of tasks) {
      const oid = Number(t.owner_id);
      const cur = byOwner.get(oid) || { titles: [], ids: [] };
      cur.titles.push(t.title);
      cur.ids.push(Number(t.id));
      byOwner.set(oid, cur);
    }

    const ownerIds = [...byOwner.keys()];
    const recentRes = await pool.query(
      `SELECT DISTINCT user_id
       FROM notifications
       WHERE user_id = ANY($1::bigint[])
         AND type = 'task'
         AND title = '一键催办'
         AND created_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'`,
      [ownerIds]
    );
    const recentlyReminded = new Set(
      recentRes.rows.map((r: { user_id: number }) => Number(r.user_id))
    );

    let notifiedOwners = 0;
    let skipped = 0;
    let notifiedTasks = 0;

    for (const [ownerId, info] of byOwner) {
      if (recentlyReminded.has(ownerId)) {
        skipped += 1;
        continue;
      }

      const preview = info.titles.slice(0, 3).join("、");
      const more =
        info.titles.length > 3 ? `等 ${info.titles.length} 条` : "";
      await createNotification({
        companyId: user.company_id,
        userId: ownerId,
        type: "task",
        title: "一键催办",
        body: `${user.name} 提醒你尽快处理 ${info.titles.length} 条逾期待办：${preview}${more}`,
        link: "/tasks",
      });
      notifiedOwners += 1;
      notifiedTasks += info.ids.length;
    }

    writeAuditLog({
      user,
      action: "task.remind_bulk",
      targetType: "task",
      summary: `一键催办 ${notifiedTasks} 条待办（${notifiedOwners} 人${
        skipped ? `，跳过 ${skipped} 人近期已催` : ""
      }）`,
    });

    return jsonOk({
      ok: true,
      task_count: notifiedTasks,
      owner_count: notifiedOwners,
      skipped,
      candidate_tasks: tasks.length,
      candidate_owners: byOwner.size,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
