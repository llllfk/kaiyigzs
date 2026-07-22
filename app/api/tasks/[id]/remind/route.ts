import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import {
  assertCompanyAccess,
  canSearchCustomersByOwner,
  getVisibleOwnerIds,
} from "@/lib/permissions";
import { writeAuditLog, createNotification } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** 管理员 / 销售经理：催办未完成待办，通知负责人 */
export async function POST(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    if (!canSearchCustomersByOwner(user)) {
      return jsonError("仅公司管理员或销售经理可催办", 403);
    }

    const { id: idRaw } = await params;
    const id = Number(idRaw);
    if (!id) return jsonError("缺少待办 id");

    const taskRes = await pool.query(
      `SELECT id, company_id, owner_id, title, status, customer_id
       FROM tasks WHERE id = $1`,
      [id]
    );
    const task = taskRes.rows[0] as
      | {
          id: number;
          company_id: number;
          owner_id: number;
          title: string;
          status: string;
          customer_id: number | null;
        }
      | undefined;
    if (!task) return jsonError("待办不存在", 404);

    assertCompanyAccess(user, task.company_id);

    if (task.status === "done" || task.status === "cancelled") {
      return jsonError("该待办已结束，无需催办");
    }

    const ownerId = Number(task.owner_id);
    if (ownerId === Number(user.id)) {
      return jsonError("不能催办自己的待办");
    }

    const owners = await getVisibleOwnerIds(user);
    if (Array.isArray(owners) && !owners.some((oid) => Number(oid) === ownerId)) {
      return jsonError("无权催办该待办", 403);
    }

    const recent = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1 AND type = 'task'
         AND title = '待办催办'
         AND body LIKE $2
         AND created_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
       LIMIT 1`,
      [ownerId, `%#${id}%`]
    );
    if (recent.rows[0]) {
      return jsonError("30 分钟内已催办过，请稍后再试");
    }

    const link = task.customer_id
      ? `/customers/${task.customer_id}`
      : "/tasks";

    await createNotification({
      companyId: task.company_id,
      userId: ownerId,
      type: "task",
      title: "待办催办",
      body: `${user.name} 提醒你尽快处理：${task.title}（#${id}）`,
      link,
    });

    await writeAuditLog({
      user,
      action: "task.remind",
      targetType: "task",
      targetId: id,
      summary: `催办待办 ${task.title}`,
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
