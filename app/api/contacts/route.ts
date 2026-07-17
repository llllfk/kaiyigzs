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
    const name = String(body.name || "").trim();
    if (!customerId || !name) return jsonError("客户与联系人姓名必填");

    await assertCanAccessCustomer(user, customerId);

    const result = await pool.query(
      `INSERT INTO contacts
        (company_id, customer_id, name, title, phone, wechat, email)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        user.company_id,
        customerId,
        name,
        body.title || null,
        body.phone || null,
        body.wechat || null,
        body.email || null,
      ]
    );
    return jsonOk(result.rows[0], 201);
  } catch (err) {
    return handleApiError(err);
  }
}
