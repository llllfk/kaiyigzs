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
import { resolvePublicRecordId } from "@/lib/public-id";

type Ctx = { params: Promise<{ id: string }> };

/** 管理员 / 销售经理：催办未完成待办，通知负责人 */
export async function POST(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    if (!canSearchCustomersByOwner(user)) {
      return jsonError("仅公司管理员或销售经理可催办", 403);
    }

    const resolved = await resolvePublicRecordId("tasks", (await params).id);
    if (!resolved) return jsonError("待办不存在", 404);
    const id = Number(resolved.id);

    const taskRes = await pool.query(
      `SELECT t.id, t.company_id, t.owner_id, t.title, t.status, t.customer_id,
              c.public_id AS customer_public_id
       FROM tasks t LEFT JOIN customers c ON c.id = t.customer_id
       WHERE t.id = $1`,
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
          customer_public_id: string | null;
        }
      | undefined;
    if (!task) return jsonError("待办不存在", 404);

    assertCompanyAccess(user, task.company_id);

    if (
      task.status === "done" ||
      task.status === "cancelled" ||
      task.status === "confirmed"
    ) {
      return jsonError("该待办已结束或已确认，无需催办");
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
      [ownerId, `%${task.title}%`]
    );
    if (recent.rows[0]) {
      return jsonError("30 分钟内已催办过，请稍后再试");
    }

    const link = task.customer_id
      ? `/customers/${task.customer_public_id || task.customer_id}`
      : "/tasks";

    await createNotification({
      companyId: task.company_id,
      userId: ownerId,
      type: "task",
      title: "待办催办",
      body: `${user.name} 提醒你尽快处理：${task.title}`,
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
