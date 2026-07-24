import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCanAccessCustomer, assertCanAccessMedia } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { commitMediaAnalysis } from "@/lib/analyze";
import type { InsightResult } from "@/lib/insights";
import { mergePainPoints } from "@/lib/pain-points";
import { resolvePublicRecordId } from "@/lib/public-id";

type Ctx = { params: Promise<{ id: string }> };

function asStringList(raw: unknown, max = 20): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, max);
}

/** 用户确认解析结果后，才写入洞察 / 画像 / 待办 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const resolved = await resolvePublicRecordId("media_assets", (await params).id);
    if (!resolved) return jsonError("上传记录不存在", 404);
    const mediaId = Number(resolved.id);
    if (!mediaId) return jsonError("记录参数无效");

    await assertCanAccessMedia(user, mediaId);

    const mediaRes = await pool.query(`SELECT * FROM media_assets WHERE id = $1`, [
      mediaId,
    ]);
    const media = mediaRes.rows[0];
    if (!media) return jsonError("上传记录不存在", 404);
    if (
      media.company_id != null &&
      user.company_id != null &&
      Number(media.company_id) !== Number(user.company_id) &&
      user.role !== "super_admin"
    ) {
      return jsonError("无权操作", 403);
    }
    if (media.customer_id) {
      await assertCanAccessCustomer(user, Number(media.customer_id));
    }

    const body = await request.json().catch(() => ({}));
    const draft = (body.draft && typeof body.draft === "object"
      ? body.draft
      : {}) as Partial<InsightResult>;

    const result: InsightResult = {
      intent: String(draft.intent || "medium"),
      pain_points: mergePainPoints(
        [],
        body.pain_points !== undefined ? body.pain_points : draft.pain_points,
        5
      ),
      competitors: asStringList(
        body.competitors !== undefined ? body.competitors : draft.competitors
      ),
      commitments: asStringList(draft.commitments),
      next_actions: asStringList(draft.next_actions, 5),
      sentiment: String(draft.sentiment || "neutral"),
      summary: String(body.summary ?? draft.summary ?? "").trim(),
      stage_suggestion: String(draft.stage_suggestion || ""),
      price_sensitivity: String(draft.price_sensitivity || ""),
      decision_makers: asStringList(draft.decision_makers),
    };

    const insight = await commitMediaAnalysis({
      user,
      mediaId,
      result,
    });

    await writeAuditLog({
      user,
      action: "media.confirm_analysis",
      targetType: "media_asset",
      targetId: mediaId,
      summary: `确认保存解析「${media.file_name || mediaId}」`,
    });

    return jsonOk({ media_id: mediaId, insight });
  } catch (err) {
    return handleApiError(err);
  }
}
