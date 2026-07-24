import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, verifyPassword } from "@/lib/auth";
import { assertCanAccessCustomer, crmRole, sameId } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { clientIp, assertNotRateLimited, enforceRateLimit } from "@/lib/security";
import { normalizePhone } from "@/lib/utils";
import { isCustomerStatus } from "@/types";
import { mergePainPoints } from "@/lib/pain-points";
import { resolvePublicRecordId } from "@/lib/public-id";

type Ctx = { params: Promise<{ id: string }> };

function canDeleteCustomer(user: Awaited<ReturnType<typeof requireSession>>) {
  const role = crmRole(user);
  return role === "company_admin" || role === "sales_manager";
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const key = (await params).id;
    const resolved = await resolvePublicRecordId("customers", key);
    if (!resolved) return jsonError("未找到", 404);
    const id = String(resolved.id);
    await assertCanAccessCustomer(user, Number(id));

    const result = await pool.query(
      `SELECT c.*, u.name AS owner_name
       FROM customers c
       LEFT JOIN users u ON u.id = c.owner_id
       WHERE c.id = $1`,
      [id]
    );
    if (!result.rows[0]) return jsonError("未找到", 404);

    const [followUps, opportunities, insights, mediaAssets] = await Promise.all([
      pool.query(
        `SELECT f.*, u.name AS owner_name FROM follow_ups f
         LEFT JOIN users u ON u.id = f.owner_id
         WHERE f.customer_id = $1 ORDER BY f.followed_at DESC LIMIT 50`,
        [id]
      ),
      pool.query(
        `SELECT * FROM opportunities WHERE customer_id = $1 ORDER BY updated_at DESC`,
        [id]
      ),
      pool.query(
        `SELECT * FROM ai_insights WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [id]
      ),
      pool.query(
        `SELECT m.id, m.kind, m.file_name, m.status, m.created_at, m.uploader_id, m.duration_ms,
                COALESCE(insight.result_json->'pain_points', '[]'::jsonb) AS pain_points,
                COALESCE(insight.result_json->'competitors', '[]'::jsonb) AS competitors
         FROM media_assets m
         LEFT JOIN LATERAL (
           SELECT i.result_json
           FROM ai_insights i
           WHERE i.media_asset_id = m.id
           ORDER BY i.created_at DESC
           LIMIT 1
         ) insight ON TRUE
         WHERE m.customer_id = $1
         ORDER BY m.created_at DESC
         LIMIT 10`,
        [id]
      ),
    ]);

    const customer = result.rows[0];
    const profile = (customer.profile_json || {}) as Record<string, unknown>;

    return jsonOk({
      ...customer,
      profile_json: {
        ...profile,
        pain_points: mergePainPoints([], profile.pain_points),
      },
      follow_ups: followUps.rows,
      opportunities: opportunities.rows,
      insights: insights.rows,
      media_assets: mediaAssets.rows.map((row) => ({
        ...row,
        pain_points: mergePainPoints([], row.pain_points, 5),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const key = (await params).id;
    const resolved = await resolvePublicRecordId("customers", key);
    if (!resolved) return jsonError("未找到", 404);
    const id = String(resolved.id);
    const existing = await assertCanAccessCustomer(user, Number(id));
    const body = await request.json();

    const companyName =
      body.company_name !== undefined ? String(body.company_name || "").trim() : null;
    const name = body.name !== undefined ? String(body.name || "").trim() : null;
    if (companyName !== null && !companyName) return jsonError("客户公司必填");
    if (name !== null && !name) return jsonError("客户名必填");

    let nextStatus: string | null = null;
    if (body.status !== undefined && body.status !== null) {
      if (!isCustomerStatus(body.status)) {
        return jsonError("客户状态无效，可选：跟进中 / 暂停 / 无效");
      }
      nextStatus = body.status;
    }

    const ownerChanged =
      body.owner_id != null && !sameId(body.owner_id, existing.owner_id);

    const result = await pool.query(
      `UPDATE customers SET
        company_name = COALESCE($1, company_name),
        name = COALESCE($2, name),
        phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
        industry = COALESCE($5, industry),
        scale = COALESCE($6, scale),
        source = COALESCE($7, source),
        status = COALESCE($8, status),
        owner_id = COALESCE($9, owner_id),
        tags = COALESCE($10::jsonb, tags),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $11
       RETURNING *`,
      [
        companyName,
        name,
        body.phone !== undefined,
        body.phone !== undefined ? normalizePhone(body.phone) : null,
        body.industry !== undefined ? body.industry || null : null,
        body.scale !== undefined ? body.scale || null : null,
        body.source !== undefined ? body.source || null : null,
        nextStatus,
        body.owner_id != null ? Number(body.owner_id) : null,
        body.tags ? JSON.stringify(body.tags) : null,
        id,
      ]
    );

    if (ownerChanged) {
      await writeAuditLog({
        user,
        action: "customer.assign",
        targetType: "customer",
        targetId: id,
        summary: `变更负责人 ${existing.owner_id} → ${body.owner_id}`,
      });
    } else {
      await writeAuditLog({
        user,
        action: "customer.update",
        targetType: "customer",
        targetId: id,
        summary: `更新客户 ${result.rows[0].company_name || ""} / ${result.rows[0].name}`,
      });
    }

    return jsonOk(result.rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    if (!canDeleteCustomer(user)) {
      return jsonError("仅公司管理员或销售经理可删除客户", 403);
    }

    const key = (await params).id;
    const resolved = await resolvePublicRecordId("customers", key);
    if (!resolved) return jsonError("未找到", 404);
    const id = String(resolved.id);
    await assertCanAccessCustomer(user, Number(id));

    const body = await request.json().catch(() => ({}));
    const password = String(body.password || "");
    if (!password) return jsonError("请输入登录密码以确认删除", 400);

    // 防试密码：仅统计错误次数；锁定后先拦截再验密
    const ip = clientIp(request);
    const userLimitKey = `customer-delete:user:${user.id}`;
    const ipLimitKey = `customer-delete:ip:${ip}`;
    await assertNotRateLimited(userLimitKey);
    await assertNotRateLimited(ipLimitKey);

    const auth = await pool.query(
      `SELECT password_hash FROM users WHERE id = $1 AND status = 'active' LIMIT 1`,
      [user.id]
    );
    const hash = String(auth.rows[0]?.password_hash || "");
    if (!hash || !(await verifyPassword(password, hash))) {
      await enforceRateLimit({
        key: userLimitKey,
        limit: 5,
        windowSeconds: 900,
        blockSeconds: 1800,
      });
      await enforceRateLimit({
        key: ipLimitKey,
        limit: 20,
        windowSeconds: 900,
        blockSeconds: 1800,
      });
      return jsonError("密码不正确", 403);
    }

    const existing = await pool.query(
      `SELECT id, company_name, name FROM customers WHERE id = $1`,
      [id]
    );
    const row = existing.rows[0];
    if (!row) return jsonError("未找到", 404);

    await pool.query(`DELETE FROM customers WHERE id = $1`, [id]);
    const label =
      [row.company_name, row.name].filter(Boolean).join(" / ") || String(id);
    await writeAuditLog({
      user,
      action: "customer.delete",
      targetType: "customer",
      targetId: id,
      summary: `删除客户 ${label}`,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
