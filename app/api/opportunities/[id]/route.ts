import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { assertCompanyAccess, getVisibleOwnerIds } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import {
  recordOpportunityStageChange,
  type StageChangeSource,
} from "@/lib/opportunity-stage-history";
import { resolvePublicRecordId } from "@/lib/public-id";

type Ctx = { params: Promise<{ id: string }> };

async function getOpp(id: string) {
  const res = await pool.query(`SELECT * FROM opportunities WHERE id = $1`, [id]);
  return res.rows[0];
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const resolved = await resolvePublicRecordId("opportunities", (await params).id);
    if (!resolved) return jsonError("未找到", 404);
    const id = String(resolved.id);
    const result = await pool.query(
      `SELECT o.*,
         TRIM(BOTH ' · ' FROM CONCAT_WS(' · ', NULLIF(c.company_name,''), NULLIF(c.name,''))) AS customer_name,
         u.name AS owner_name
       FROM opportunities o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = o.owner_id
       WHERE o.id = $1`,
      [id]
    );
    const opp = result.rows[0];
    if (!opp) return jsonError("未找到", 404);
    assertCompanyAccess(user, opp.company_id);

    const owners = await getVisibleOwnerIds(user);
    if (Array.isArray(owners) && !owners.includes(opp.owner_id)) {
      throw new AuthError("无权查看该商机", 403);
    }

    return jsonOk(opp);
  } catch (err) {
    return handleApiError(err);
  }
}

function resolveStageSource(body: {
  stage_source?: string;
  title?: unknown;
}): StageChangeSource {
  const raw = String(body.stage_source || "").trim();
  if (raw === "funnel" || raw === "edit" || raw === "manual") return raw;
  return body.title != null ? "edit" : "manual";
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const resolved = await resolvePublicRecordId("opportunities", (await params).id);
    if (!resolved) return jsonError("未找到", 404);
    const id = String(resolved.id);
    const opp = await getOpp(id);
    if (!opp) return jsonError("未找到", 404);
    assertCompanyAccess(user, opp.company_id);

    const owners = await getVisibleOwnerIds(user);
    if (Array.isArray(owners) && !owners.includes(opp.owner_id)) {
      throw new AuthError("无权修改该商机", 403);
    }

    const body = await request.json();
    const stageChanged = body.stage && body.stage !== opp.stage;
    const stageReason =
      body.stage_reason != null ? String(body.stage_reason).trim() : "";

    // 表单完整编辑：显式写入各字段（允许清空金额/成交日）
    if (body.title != null) {
      const result = await pool.query(
        `UPDATE opportunities SET
          title = $1,
          stage = COALESCE($2, stage),
          amount = $3,
          expected_close_date = $4,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING *`,
        [
          String(body.title).trim(),
          body.stage ?? null,
          body.amount != null && body.amount !== ""
            ? Number(body.amount)
            : null,
          body.expected_close_date || null,
          id,
        ]
      );

      if (stageChanged) {
        await recordOpportunityStageChange({
          user,
          companyId: opp.company_id,
          opportunityId: Number(id),
          fromStage: opp.stage,
          toStage: String(body.stage),
          reason: stageReason || null,
          source: resolveStageSource(body),
        });
        await writeAuditLog({
          user,
          action: "opportunity.stage_change",
          targetType: "opportunity",
          targetId: id,
          summary: `阶段 ${opp.stage} → ${body.stage}`,
        });
      }

      await writeAuditLog({
        user,
        action: "opportunity.update",
        targetType: "opportunity",
        targetId: id,
        summary: `更新商机 ${String(body.title).trim()}`,
      });

      return jsonOk(result.rows[0]);
    }

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
      await recordOpportunityStageChange({
        user,
        companyId: opp.company_id,
        opportunityId: Number(id),
        fromStage: opp.stage,
        toStage: String(body.stage),
        reason: stageReason || null,
        source: resolveStageSource(body),
      });
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

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const resolved = await resolvePublicRecordId("opportunities", (await params).id);
    if (!resolved) return jsonError("未找到", 404);
    const id = String(resolved.id);
    const opp = await getOpp(id);
    if (!opp) return jsonError("未找到", 404);
    assertCompanyAccess(user, opp.company_id);

    const owners = await getVisibleOwnerIds(user);
    if (Array.isArray(owners) && !owners.includes(opp.owner_id)) {
      throw new AuthError("无权删除该商机", 403);
    }

    await pool.query(`UPDATE tasks SET opportunity_id = NULL WHERE opportunity_id = $1`, [
      id,
    ]);

    await pool.query(`DELETE FROM opportunities WHERE id = $1`, [id]);

    await writeAuditLog({
      user,
      action: "opportunity.delete",
      targetType: "opportunity",
      targetId: id,
      summary: `删除商机 ${opp.title || id}`,
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
