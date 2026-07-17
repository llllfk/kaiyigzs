import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const result = await pool.query(
      `SELECT c.*,
        (SELECT COUNT(*)::int FROM competitor_mentions m WHERE m.competitor_id = c.id) AS mention_count
       FROM competitors c
       WHERE c.company_id = $1
       ORDER BY mention_count DESC, c.updated_at DESC`,
      [user.company_id]
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
    const name = String(body.name || "").trim();
    if (!name) return jsonError("竞品名称必填");

    const result = await pool.query(
      `INSERT INTO competitors
        (company_id, name, summary, strengths, weaknesses, playbook)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        user.company_id,
        name,
        body.summary || null,
        body.strengths || null,
        body.weaknesses || null,
        body.playbook || null,
      ]
    );

    await writeAuditLog({
      user,
      action: "competitor.create",
      targetType: "competitor",
      targetId: result.rows[0].id,
      summary: `创建竞品 ${name}`,
    });

    return jsonOk(result.rows[0], 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const body = await request.json();
    const id = Number(body.id);
    if (!id) return jsonError("缺少 id");

    const result = await pool.query(
      `UPDATE competitors SET
        name = COALESCE($1, name),
        summary = COALESCE($2, summary),
        strengths = COALESCE($3, strengths),
        weaknesses = COALESCE($4, weaknesses),
        playbook = COALESCE($5, playbook),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND company_id = $7
       RETURNING *`,
      [
        body.name ?? null,
        body.summary ?? null,
        body.strengths ?? null,
        body.weaknesses ?? null,
        body.playbook ?? null,
        id,
        user.company_id,
      ]
    );
    if (!result.rows[0]) return jsonError("未找到", 404);
    return jsonOk(result.rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!id) return jsonError("缺少 id");
    await pool.query(
      `DELETE FROM competitors WHERE id = $1 AND company_id = $2`,
      [id, user.company_id]
    );
    await writeAuditLog({
      user,
      action: "competitor.delete",
      targetType: "competitor",
      targetId: id,
      summary: `删除竞品 ${id}`,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
