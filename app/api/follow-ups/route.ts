import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCanAccessCustomer } from "@/lib/permissions";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const body = await request.json();
    const customerId = Number(body.customer_id);
    const content = String(body.content || "").trim();
    if (!customerId || !content) return jsonError("客户与跟进内容必填");

    await assertCanAccessCustomer(user, customerId);

    const followedAt =
      body.followed_at ||
      (body.date && body.time
        ? `${body.date}T${body.time}:00`
        : body.date
          ? `${body.date}T09:00:00`
          : null);

    const result = await pool.query(
      `INSERT INTO follow_ups
        (company_id, customer_id, opportunity_id, owner_id, type, content, followed_at)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, CURRENT_TIMESTAMP))
       RETURNING *`,
      [
        user.company_id,
        customerId,
        body.opportunity_id ? Number(body.opportunity_id) : null,
        user.id,
        body.type || "call",
        content,
        followedAt,
      ]
    );

    await pool.query(
      `UPDATE customers SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [customerId]
    );

    return jsonOk(result.rows[0], 201);
  } catch (err) {
    return handleApiError(err);
  }
}
