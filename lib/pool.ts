import pool from "@/lib/db";
import { AuthError } from "@/lib/auth";
import type { SessionUser, UserRole } from "@/types";
import { writeAuditLog, createNotification } from "@/lib/audit";
import { canManagePoolRules, crmRole } from "@/lib/permissions";

export { canManagePoolRules };

export function canAssignPool(roleOrUser: UserRole | SessionUser) {
  const role = typeof roleOrUser === "string" ? roleOrUser : crmRole(roleOrUser);
  return role === "company_admin" || role === "sales_manager";
}

export async function getPoolRecycleDays(companyId: number): Promise<number> {
  const res = await pool.query(`SELECT config FROM companies WHERE id = $1`, [
    companyId,
  ]);
  const config = (res.rows[0]?.config || {}) as Record<string, unknown>;
  const days = Number(config.pool_recycle_days);
  if (!Number.isFinite(days) || days < 1) return 7;
  return Math.min(365, Math.floor(days));
}

export async function setPoolRecycleDays(
  user: SessionUser,
  days: number
): Promise<number> {
  if (!user.company_id) throw new AuthError("缺少公司信息", 400);
  if (!canManagePoolRules(user)) {
    throw new AuthError("仅公司管理员或销售经理可设置公海回收规则", 403);
  }
  const n = Math.min(365, Math.max(1, Math.floor(Number(days) || 7)));
  await pool.query(
    `UPDATE companies SET
      config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('pool_recycle_days', $1::int),
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [n, user.company_id]
  );
  await writeAuditLog({
    user,
    action: "pool.rule.update",
    targetType: "company",
    targetId: user.company_id,
    summary: `公海回收天数设为 ${n} 天`,
  });
  return n;
}

/** Move overdue private customers into public pool */
export async function recycleStaleCustomers(companyId: number) {
  const days = await getPoolRecycleDays(companyId);
  const result = await pool.query(
    `WITH last_touch AS (
       SELECT c.id,
         COALESCE(
           (SELECT MAX(f.followed_at) FROM follow_ups f WHERE f.customer_id = c.id),
           c.claimed_at,
           c.created_at
         ) AS last_at,
         c.owner_id
       FROM customers c
       WHERE c.company_id = $1
         AND COALESCE(c.pool_status, 'private') = 'private'
         AND c.status = 'active'
     )
     UPDATE customers c SET
       pool_status = 'public',
       owner_id = NULL,
       released_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     FROM last_touch t
     WHERE c.id = t.id
       AND t.last_at < CURRENT_TIMESTAMP - ($2 || ' days')::interval
     RETURNING c.id, c.name, t.owner_id AS previous_owner_id`,
    [companyId, String(days)]
  );

  for (const row of result.rows) {
    if (row.previous_owner_id) {
      await createNotification({
        companyId,
        userId: row.previous_owner_id,
        type: "pool",
        title: "客户已回收至公海",
        body: `「${row.name}」超过 ${days} 天未跟进，已进入公海`,
        link: "/pool",
      });
    }
  }

  return { recycled: result.rows.length, days, rows: result.rows };
}

export async function releaseCustomerToPool(params: {
  user: SessionUser;
  customerId: number;
  reason?: string;
}) {
  const { user, customerId } = params;
  if (!user.company_id) throw new AuthError("缺少公司信息", 400);

  const res = await pool.query(`SELECT * FROM customers WHERE id = $1`, [
    customerId,
  ]);
  const customer = res.rows[0];
  if (!customer) throw new AuthError("客户不存在", 404);
  if (customer.company_id !== user.company_id) {
    throw new AuthError("无权操作", 403);
  }
  if (customer.pool_status === "public") {
    throw new AuthError("客户已在公海", 400);
  }

  const canRelease =
    canAssignPool(user) || customer.owner_id === user.id;
  if (!canRelease) throw new AuthError("无权放入公海", 403);

  const updated = await pool.query(
    `UPDATE customers SET
      pool_status = 'public',
      owner_id = NULL,
      released_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [customerId]
  );

  await writeAuditLog({
    user,
    action: "pool.release",
    targetType: "customer",
    targetId: customerId,
    summary: `将客户 ${customer.name} 放入公海${params.reason ? `：${params.reason}` : ""}`,
  });

  return updated.rows[0];
}

export async function claimCustomerFromPool(params: {
  user: SessionUser;
  customerId: number;
  ownerId?: number;
}) {
  const { user, customerId } = params;
  if (!user.company_id) throw new AuthError("缺少公司信息", 400);

  const res = await pool.query(`SELECT * FROM customers WHERE id = $1`, [
    customerId,
  ]);
  const customer = res.rows[0];
  if (!customer) throw new AuthError("客户不存在", 404);
  if (customer.company_id !== user.company_id) {
    throw new AuthError("无权操作", 403);
  }
  if (customer.pool_status !== "public") {
    throw new AuthError("客户不在公海", 400);
  }

  let ownerId = params.ownerId || user.id;
  if (params.ownerId && params.ownerId !== user.id) {
    if (!canAssignPool(user)) {
      throw new AuthError("无权分配给他人", 403);
    }
    const owner = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND company_id = $2 AND status='active'`,
      [ownerId, user.company_id]
    );
    if (!owner.rows[0]) throw new AuthError("目标销售不存在", 404);
  }

  const updated = await pool.query(
    `UPDATE customers SET
      pool_status = 'private',
      owner_id = $1,
      status = 'active',
      claimed_at = CURRENT_TIMESTAMP,
      released_at = NULL,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING *`,
    [ownerId, customerId]
  );

  await writeAuditLog({
    user,
    action: params.ownerId && params.ownerId !== user.id ? "pool.assign" : "pool.claim",
    targetType: "customer",
    targetId: customerId,
    summary: `公海客户 ${customer.name} → 负责人 ${ownerId}`,
  });

  if (ownerId !== user.id) {
    await createNotification({
      companyId: user.company_id,
      userId: ownerId,
      type: "pool",
      title: "已分配公海客户",
      body: `「${customer.name}」已分配给你`,
      link: `/customers/${customerId}`,
    });
  }

  return updated.rows[0];
}
