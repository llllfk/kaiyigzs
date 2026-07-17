import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { assertCompanyAccess, getVisibleOwnerIds } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const opportunityId = request.nextUrl.searchParams.get("opportunity_id");

    if (opportunityId) {
      const result = await pool.query(
        `SELECT * FROM opportunity_reviews
         WHERE opportunity_id = $1 AND company_id = $2
         ORDER BY id DESC`,
        [Number(opportunityId), user.company_id]
      );
      return jsonOk(result.rows);
    }

    const owners = await getVisibleOwnerIds(user);
    let sql = `SELECT r.*, o.title AS opportunity_title, c.name AS customer_name
      FROM opportunity_reviews r
      JOIN opportunities o ON o.id = r.opportunity_id
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE r.company_id = $1`;
    const params: unknown[] = [user.company_id];

    if (Array.isArray(owners)) {
      params.push(owners);
      sql += ` AND o.owner_id = ANY($${params.length}::bigint[])`;
    }
    sql += ` ORDER BY r.created_at DESC LIMIT 100`;

    const result = await pool.query(sql, params);
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
    const opportunityId = Number(body.opportunity_id);
    const outcome = String(body.outcome || "");
    if (!opportunityId || !["won", "lost"].includes(outcome)) {
      return jsonError("商机与结果（won/lost）必填");
    }

    const oppRes = await pool.query(
      `SELECT * FROM opportunities WHERE id = $1`,
      [opportunityId]
    );
    const opp = oppRes.rows[0];
    if (!opp) return jsonError("商机不存在", 404);
    assertCompanyAccess(user, opp.company_id);

    const owners = await getVisibleOwnerIds(user);
    if (Array.isArray(owners) && !owners.includes(opp.owner_id)) {
      throw new AuthError("无权复盘该商机", 403);
    }

    // sync stage if needed
    if (opp.stage !== outcome) {
      await pool.query(
        `UPDATE opportunities SET stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [outcome, opportunityId]
      );
      await writeAuditLog({
        user,
        action: "opportunity.stage_change",
        targetType: "opportunity",
        targetId: opportunityId,
        summary: `复盘同步阶段 ${opp.stage} → ${outcome}`,
      });
    }

    const result = await pool.query(
      `INSERT INTO opportunity_reviews
        (company_id, opportunity_id, outcome, reason_category, detail, lessons, extra, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       RETURNING *`,
      [
        user.company_id,
        opportunityId,
        outcome,
        body.reason_category || null,
        body.detail || null,
        body.lessons || null,
        JSON.stringify(body.extra || {}),
        user.id,
      ]
    );

    await writeAuditLog({
      user,
      action: "opportunity.review",
      targetType: "opportunity_review",
      targetId: result.rows[0].id,
      summary: `提交${outcome === "won" ? "赢单" : "输单"}复盘`,
    });

    return jsonOk(result.rows[0], 201);
  } catch (err) {
    return handleApiError(err);
  }
}
