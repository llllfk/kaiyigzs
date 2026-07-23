import { NextRequest } from "next/server";
import { requireSession, AuthError } from "@/lib/auth";
import { assertCompanyAccess, getVisibleOwnerIds } from "@/lib/permissions";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { resolvePublicRecordId } from "@/lib/public-id";
import pool from "@/lib/db";
import { listOpportunityStageHistory } from "@/lib/opportunity-stage-history";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const resolved = await resolvePublicRecordId("opportunities", (await params).id);
    if (!resolved) return jsonError("商机不存在", 404);
    const id = String(resolved.id);
    const oppRes = await pool.query(`SELECT * FROM opportunities WHERE id = $1`, [
      id,
    ]);
    const opp = oppRes.rows[0];
    if (!opp) return jsonError("未找到", 404);
    assertCompanyAccess(user, opp.company_id);

    const owners = await getVisibleOwnerIds(user);
    if (Array.isArray(owners) && !owners.includes(opp.owner_id)) {
      throw new AuthError("无权查看该商机", 403);
    }

    const rows = await listOpportunityStageHistory(Number(id));
    return jsonOk(rows);
  } catch (err) {
    return handleApiError(err);
  }
}
