import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { assertCanAccessCustomer, canSearchCustomersByOwner, crmRole, getVisibleOwnerIds, narrowOwnerId } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { parsePageParams, resolvePagination } from "@/lib/pagination";
import { parseOwnerIdParam } from "@/lib/utils";

async function resolveTaskScope(params: {
  user: Awaited<ReturnType<typeof requireSession>>;
  customerId?: number | null;
  opportunityId?: number | null;
}): Promise<{ customerId: number; opportunityId: number | null }> {
  let customerId = params.customerId ? Number(params.customerId) : null;
  let opportunityId = params.opportunityId ? Number(params.opportunityId) : null;

  if (opportunityId) {
    const opp = await pool.query(
      `SELECT id, customer_id, company_id FROM opportunities WHERE id = $1`,
      [opportunityId]
    );
    if (!opp.rows[0]) throw new AuthError("商机不存在", 404);
    await assertCanAccessCustomer(params.user, Number(opp.rows[0].customer_id));
    customerId = Number(opp.rows[0].customer_id);
  } else if (customerId) {
    await assertCanAccessCustomer(params.user, customerId);
  } else {
    throw new AuthError("请关联客户或商机", 400);
  }

  return { customerId, opportunityId };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const sp = request.nextUrl.searchParams;
    const status = sp.get("status");
    const customerId = sp.get("customer_id") ? Number(sp.get("customer_id")) : null;
    const opportunityId = sp.get("opportunity_id")
      ? Number(sp.get("opportunity_id"))
      : null;
    const q = sp.get("q")?.trim() || "";
    const dueFrom = sp.get("due_from")?.trim() || "";
    const dueTo = sp.get("due_to")?.trim() || "";
    const urgency = sp.get("urgency")?.trim() || "";
    const ownerQ = canSearchCustomersByOwner(user)
      ? sp.get("owner_q")?.trim() || ""
      : "";
    const { paginate, page, pageSize } = parsePageParams(sp);

    const params: unknown[] = [];
    const where: string[] = [`t.company_id = $1`];
    params.push(user.company_id);

    const owners = await getVisibleOwnerIds(user);
    const scopedOwnerId = narrowOwnerId(owners, parseOwnerIdParam(sp.get("owner_id")));

    if (customerId) {
      await assertCanAccessCustomer(user, customerId);
      params.push(customerId);
      where.push(`t.customer_id = $${params.length}`);
    } else if (opportunityId) {
      const opp = await pool.query(
        `SELECT customer_id FROM opportunities WHERE id = $1 AND company_id = $2`,
        [opportunityId, user.company_id]
      );
      if (!opp.rows[0]) return jsonError("商机不存在", 404);
      await assertCanAccessCustomer(user, Number(opp.rows[0].customer_id));
      params.push(opportunityId);
      where.push(`t.opportunity_id = $${params.length}`);
    } else if (scopedOwnerId != null) {
      params.push(scopedOwnerId);
      where.push(`t.owner_id = $${params.length}`);
    } else {
      // 列表范围与客户可见范围一致：管理员全公司，经理本人+下属，销售本人
      if (owners === "all" || owners === "company" || crmRole(user) === "company_admin") {
        // company_id 已限制
      } else {
        params.push(owners);
        where.push(`t.owner_id = ANY($${params.length}::bigint[])`);
      }
    }

    if (status) {
      params.push(status);
      where.push(`t.status = $${params.length}`);
    }
    if (ownerQ) {
      params.push(`%${ownerQ}%`);
      where.push(`u.name ILIKE $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(
        c.company_name ILIKE $${params.length}
        OR c.name ILIKE $${params.length}
        OR cu.name ILIKE $${params.length}
        OR o.title ILIKE $${params.length}
      )`);
    }
    if (dueFrom) {
      params.push(dueFrom);
      where.push(`t.due_at >= $${params.length}::date`);
    }
    if (dueTo) {
      params.push(dueTo);
      where.push(`t.due_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    if (urgency === "overdue" || urgency === "urgent" || urgency === "normal") {
      // 紧急程度只针对「待办」状态（已确认不再标逾期/紧急）
      const shToday = `((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AT TIME ZONE 'Asia/Shanghai')`;
      where.push(`t.status = 'pending'`);
      if (urgency === "overdue") {
        where.push(`t.due_at IS NOT NULL AND t.due_at < ${shToday}`);
      } else if (urgency === "urgent") {
        where.push(
          `t.due_at IS NOT NULL AND t.due_at >= ${shToday} AND t.due_at < ${shToday} + INTERVAL '1 day'`
        );
      } else {
        where.push(
          `(t.due_at IS NULL OR t.due_at >= ${shToday} + INTERVAL '1 day')`
        );
      }
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const fromSql = `FROM tasks t
       LEFT JOIN customers c ON c.id = t.customer_id
       LEFT JOIN opportunities o ON o.id = t.opportunity_id
       LEFT JOIN users u ON u.id = t.owner_id
       LEFT JOIN users cu ON cu.id = c.owner_id
       ${whereSql}`;
    const selectSql = `SELECT t.*,
         TRIM(BOTH ' · ' FROM CONCAT_WS(' · ', NULLIF(c.company_name,''), NULLIF(c.name,''))) AS customer_name,
         c.public_id AS customer_public_id,
         o.title AS opportunity_title,
         u.name AS owner_name,
         cu.name AS customer_owner_name`;
    const orderSql = `ORDER BY
         CASE WHEN t.status = 'done' THEN 1 ELSE 0 END,
         t.created_at DESC,
         t.id DESC`;

    if (!paginate) {
      const result = await pool.query(
        `${selectSql} ${fromSql} ${orderSql} LIMIT 200`,
        params
      );
      return jsonOk(result.rows);
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total ${fromSql}`,
      params
    );
    const total = countRes.rows[0]?.total ?? 0;
    const { meta, offset, limit } = resolvePagination(total, page, pageSize);
    const listParams = [...params, limit, offset];
    const result = await pool.query(
      `${selectSql} ${fromSql} ${orderSql}
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return jsonOk(result.rows, 200, meta);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const body = await request.json();
    const title = String(body.title || "").trim();
    if (!title) return jsonError("标题必填");

    const scope = await resolveTaskScope({
      user,
      customerId: body.customer_id ? Number(body.customer_id) : null,
      opportunityId: body.opportunity_id ? Number(body.opportunity_id) : null,
    });

    if (scope.opportunityId) {
      const check = await pool.query(
        `SELECT id FROM opportunities
         WHERE id = $1 AND customer_id = $2 AND company_id = $3`,
        [scope.opportunityId, scope.customerId, user.company_id]
      );
      if (!check.rows[0]) return jsonError("商机与客户不匹配", 400);
    }

    const result = await pool.query(
      `INSERT INTO tasks
        (company_id, customer_id, opportunity_id, owner_id, title, due_at, status, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        user.company_id,
        scope.customerId,
        scope.opportunityId,
        body.owner_id ? Number(body.owner_id) : user.id,
        title,
        body.due_at || null,
        body.status || "pending",
        body.source || "manual",
      ]
    );
    return jsonOk(result.rows[0], 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const body = await request.json();
    const id = Number(body.id);
    if (!id) return jsonError("缺少 id");

    const existing = await pool.query(
      `SELECT * FROM tasks WHERE id = $1 AND owner_id = $2 AND company_id = $3`,
      [id, user.id, user.company_id]
    );
    if (!existing.rows[0]) return jsonError("未找到待办或无权操作", 404);

    let customerId = existing.rows[0].customer_id
      ? Number(existing.rows[0].customer_id)
      : null;
    let opportunityId =
      existing.rows[0].opportunity_id != null
        ? Number(existing.rows[0].opportunity_id)
        : null;

    if (body.customer_id !== undefined || body.opportunity_id !== undefined) {
      const scope = await resolveTaskScope({
        user,
        customerId:
          body.customer_id !== undefined
            ? body.customer_id
              ? Number(body.customer_id)
              : null
            : customerId,
        opportunityId:
          body.opportunity_id !== undefined
            ? body.opportunity_id
              ? Number(body.opportunity_id)
              : null
            : opportunityId,
      });
      customerId = scope.customerId;
      opportunityId = scope.opportunityId;
      if (opportunityId) {
        const check = await pool.query(
          `SELECT id FROM opportunities
           WHERE id = $1 AND customer_id = $2 AND company_id = $3`,
          [opportunityId, customerId, user.company_id]
        );
        if (!check.rows[0]) return jsonError("商机与客户不匹配", 400);
      }
    }

    const title =
      body.title != null ? String(body.title).trim() : existing.rows[0].title;
    if (!title) return jsonError("标题必填");

    const result = await pool.query(
      `UPDATE tasks SET
         title = $1,
         status = COALESCE($2, status),
         due_at = $3,
         customer_id = $4,
         opportunity_id = $5,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND owner_id = $7
       RETURNING *`,
      [
        title,
        body.status ?? null,
        body.due_at !== undefined ? body.due_at || null : existing.rows[0].due_at,
        customerId,
        opportunityId,
        id,
        user.id,
      ]
    );

    return jsonOk(result.rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSession();
    let id = Number(request.nextUrl.searchParams.get("id"));
    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = Number(body?.id);
    }
    if (!id) return jsonError("缺少 id");

    const existing = await pool.query(
      `SELECT id, title FROM tasks WHERE id = $1 AND owner_id = $2`,
      [id, user.id]
    );
    const row = existing.rows[0];
    if (!row) return jsonError("未找到待办或无权操作", 404);

    await pool.query(`DELETE FROM tasks WHERE id = $1 AND owner_id = $2`, [
      id,
      user.id,
    ]);

    await writeAuditLog({
      user,
      action: "task.delete",
      targetType: "task",
      targetId: id,
      summary: `删除待办 ${row.title || id}`,
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
