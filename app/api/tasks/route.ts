import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    const status = request.nextUrl.searchParams.get("status");
    const result = await pool.query(
      `SELECT t.*, c.name AS customer_name
       FROM tasks t
       LEFT JOIN customers c ON c.id = t.customer_id
       WHERE t.owner_id = $1
         AND ($2::text IS NULL OR t.status = $2)
       ORDER BY
         CASE WHEN t.status = 'done' THEN 1 ELSE 0 END,
         t.due_at NULLS LAST,
         t.id DESC
       LIMIT 200`,
      [user.id, status]
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
    const title = String(body.title || "").trim();
    if (!title) return jsonError("标题必填");

    const result = await pool.query(
      `INSERT INTO tasks
        (company_id, customer_id, opportunity_id, owner_id, title, due_at, status, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        user.company_id,
        body.customer_id ? Number(body.customer_id) : null,
        body.opportunity_id ? Number(body.opportunity_id) : null,
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
    const body = await request.json();
    const id = Number(body.id);
    if (!id) return jsonError("缺少 id");

    const result = await pool.query(
      `UPDATE tasks SET
        status = COALESCE($1, status),
        title = COALESCE($2, title),
        due_at = COALESCE($3, due_at),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND owner_id = $5
       RETURNING *`,
      [body.status ?? null, body.title ?? null, body.due_at ?? null, id, user.id]
    );
    if (!result.rows[0]) return jsonError("未找到", 404);
    return jsonOk(result.rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}
