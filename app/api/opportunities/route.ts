import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { buildOwnerFilter, getVisibleOwnerIds } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { assertCanAccessCustomer } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireSession();
    const owners = await getVisibleOwnerIds(user);
    const filter = buildOwnerFilter(owners, user.company_id, "o");
    const result = await pool.query(
      `SELECT o.*, c.name AS customer_name, u.name AS owner_name
       FROM opportunities o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = o.owner_id
       WHERE ${filter.sql}
       ORDER BY o.updated_at DESC
       LIMIT 200`,
      filter.params
    );
    return jsonOk(result.rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const body = await request.json();
    const customerId = Number(body.customer_id);
    const title = String(body.title || "").trim();
    if (!customerId || !title) return jsonError("客户与商机标题必填");

    await assertCanAccessCustomer(user, customerId);

    const result = await pool.query(
      `INSERT INTO opportunities
        (company_id, customer_id, owner_id, title, stage, amount, expected_close_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        user.company_id,
        customerId,
        body.owner_id ? Number(body.owner_id) : user.id,
        title,
        body.stage || "lead",
        body.amount != null ? Number(body.amount) : null,
        body.expected_close_date || null,
      ]
    );

    await writeAuditLog({
      user,
      action: "opportunity.create",
      targetType: "opportunity",
      targetId: result.rows[0].id,
      summary: `创建商机 ${title}`,
    });

    return jsonOk(result.rows[0], 201);
  } catch (err) {
    return handleApiError(err);
  }
}
