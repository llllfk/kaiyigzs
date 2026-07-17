import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCanAccessCustomer } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await params;
    await assertCanAccessCustomer(user, Number(id));

    const result = await pool.query(
      `SELECT c.*, u.name AS owner_name
       FROM customers c
       LEFT JOIN users u ON u.id = c.owner_id
       WHERE c.id = $1`,
      [id]
    );
    if (!result.rows[0]) return jsonError("未找到", 404);

    const [contacts, followUps, opportunities, insights] = await Promise.all([
      pool.query(
        `SELECT * FROM contacts WHERE customer_id = $1 ORDER BY id DESC`,
        [id]
      ),
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
    ]);

    return jsonOk({
      ...result.rows[0],
      contacts: contacts.rows,
      follow_ups: followUps.rows,
      opportunities: opportunities.rows,
      insights: insights.rows,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const existing = await assertCanAccessCustomer(user, Number(id));
    const body = await request.json();

    const ownerChanged =
      body.owner_id != null && Number(body.owner_id) !== existing.owner_id;

    const result = await pool.query(
      `UPDATE customers SET
        name = COALESCE($1, name),
        industry = COALESCE($2, industry),
        scale = COALESCE($3, scale),
        source = COALESCE($4, source),
        status = COALESCE($5, status),
        owner_id = COALESCE($6, owner_id),
        tags = COALESCE($7::jsonb, tags),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [
        body.name ?? null,
        body.industry ?? null,
        body.scale ?? null,
        body.source ?? null,
        body.status ?? null,
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
        summary: `更新客户 ${result.rows[0].name}`,
      });
    }

    return jsonOk(result.rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await params;
    await assertCanAccessCustomer(user, Number(id));
    if (user.role === "sales") {
      return jsonError("销售无权删除客户", 403);
    }
    await pool.query(`DELETE FROM customers WHERE id = $1`, [id]);
    await writeAuditLog({
      user,
      action: "customer.delete",
      targetType: "customer",
      targetId: id,
      summary: `删除客户 ${id}`,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
