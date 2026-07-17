import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { assertCompanyAccess, getVisibleOwnerIds } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

async function getOpp(id: string) {
  const res = await pool.query(`SELECT * FROM opportunities WHERE id = $1`, [id]);
  return res.rows[0];
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const opp = await getOpp(id);
    if (!opp) return jsonError("未找到", 404);
    assertCompanyAccess(user, opp.company_id);

    const owners = await getVisibleOwnerIds(user);
    if (Array.isArray(owners) && !owners.includes(opp.owner_id)) {
      throw new AuthError("无权修改该商机", 403);
    }

    const body = await request.json();
    const stageChanged = body.stage && body.stage !== opp.stage;

    const result = await pool.query(
      `UPDATE opportunities SET
        title = COALESCE($1, title),
        stage = COALESCE($2, stage),
        amount = COALESCE($3, amount),
        expected_close_date = COALESCE($4, expected_close_date),
        stage_suggestion_json = COALESCE($5::jsonb, stage_suggestion_json),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        body.title ?? null,
        body.stage ?? null,
        body.amount != null ? Number(body.amount) : null,
        body.expected_close_date ?? null,
        body.stage_suggestion_json
          ? JSON.stringify(body.stage_suggestion_json)
          : null,
        id,
      ]
    );

    if (stageChanged) {
      await writeAuditLog({
        user,
        action: "opportunity.stage_change",
        targetType: "opportunity",
        targetId: id,
        summary: `阶段 ${opp.stage} → ${body.stage}`,
      });
    }

    return jsonOk(result.rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}
