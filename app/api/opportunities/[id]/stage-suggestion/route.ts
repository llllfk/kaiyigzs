import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { assertCompanyAccess, getVisibleOwnerIds } from "@/lib/permissions";
import { writeAuditLog, createNotification } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { recordOpportunityStageChange } from "@/lib/opportunity-stage-history";

type Ctx = { params: Promise<{ id: string }> };

async function loadOpp(id: string) {
  const res = await pool.query(`SELECT * FROM opportunities WHERE id = $1`, [id]);
  return res.rows[0];
}

async function assertOppAccess(user: Awaited<ReturnType<typeof requireSession>>, opp: {
  company_id: number;
  owner_id: number;
}) {
  assertCompanyAccess(user, opp.company_id);
  const owners = await getVisibleOwnerIds(user);
  if (Array.isArray(owners) && !owners.includes(opp.owner_id)) {
    throw new AuthError("无权操作该商机", 403);
  }
}

/** Accept AI stage suggestion */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const body = await request.json();
    const action = String(body.action || "accept");
    const opp = await loadOpp(id);
    if (!opp) return jsonError("未找到", 404);
    await assertOppAccess(user, opp);

    const suggestion = opp.stage_suggestion_json || {};
    const suggestedStage = suggestion.stage || body.stage;

    if (action === "dismiss") {
      const result = await pool.query(
        `UPDATE opportunities SET
          stage_suggestion_json = NULL,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      return jsonOk(result.rows[0]);
    }

    if (!suggestedStage) return jsonError("没有可采纳的阶段建议");

    const result = await pool.query(
      `UPDATE opportunities SET
        stage = $1,
        stage_suggestion_json = NULL,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [suggestedStage, id]
    );

    const aiReason =
      typeof suggestion.reason === "string" ? suggestion.reason.trim() : "";
    await recordOpportunityStageChange({
      user,
      companyId: opp.company_id,
      opportunityId: Number(id),
      fromStage: opp.stage,
      toStage: String(suggestedStage),
      reason: aiReason || "采纳 AI 阶段建议",
      source: "ai_accept",
    });

    await writeAuditLog({
      user,
      action: "opportunity.stage_accept",
      targetType: "opportunity",
      targetId: id,
      summary: `采纳阶段建议 ${opp.stage} → ${suggestedStage}`,
    });

    if (suggestedStage === "won" || suggestedStage === "lost") {
      await createNotification({
        companyId: opp.company_id,
        userId: opp.owner_id,
        type: "review",
        title: "请填写成交复盘",
        body: `商机已进入「${suggestedStage === "won" ? "成交" : "流失"}」，建议补充复盘`,
        link: "/opportunities",
      });
    }

    return jsonOk(result.rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}
