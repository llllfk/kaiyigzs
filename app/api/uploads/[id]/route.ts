import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { previewMediaAnalysis } from "@/lib/analyze";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { assertCanAccessCustomer } from "@/lib/permissions";
import { mergePainPoints } from "@/lib/pain-points";
import { deleteObject } from "@/lib/storage";
import { renameKeepingExtension, splitFileName } from "@/lib/utils";
import pool from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** 重新解析预览：只跑 AI，不写洞察；确认后走 /confirm */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const mediaId = Number(id);
    if (!Number.isFinite(mediaId) || mediaId <= 0) {
      return jsonError("无效的记录 ID");
    }

    if (body.transcript) {
      await pool.query(
        `UPDATE media_assets SET transcript = $1 WHERE id = $2`,
        [String(body.transcript), mediaId]
      );
    }

    const draft = await previewMediaAnalysis({
      user,
      mediaId,
    });
    return jsonOk({ media_id: mediaId, draft });
  } catch (err) {
    return handleApiError(err);
  }
}

/** 更新解析记录：文件名、类型、客户、转写、洞察痛点/竞品；可选重新解析 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const mediaId = Number(id);
    if (!Number.isFinite(mediaId) || mediaId <= 0) {
      return jsonError("无效的记录 ID");
    }

    const body = await request.json().catch(() => ({}));
    const existing = await pool.query(`SELECT * FROM media_assets WHERE id = $1`, [
      mediaId,
    ]);
    const row = existing.rows[0];
    if (!row) return jsonError("未找到", 404);

    const sameCompany =
      row.company_id != null &&
      user.company_id != null &&
      Number(row.company_id) === Number(user.company_id);
    if (!sameCompany && user.role !== "super_admin") {
      return jsonError("无权修改", 403);
    }

    const updates: string[] = [];
    const paramsSql: unknown[] = [];
    const push = (sqlFrag: string, value: unknown) => {
      paramsSql.push(value);
      updates.push(`${sqlFrag} = $${paramsSql.length}`);
    };

    let nextFileName = String(row.file_name || "");
    if (body.file_name !== undefined || body.name !== undefined) {
      const baseInput = String(body.file_name ?? body.name ?? "").trim();
      if (!baseInput) return jsonError("请输入文件名");
      nextFileName = renameKeepingExtension(baseInput, String(row.file_name || ""));
      if (nextFileName.length > 300) return jsonError("文件名过长");
      if (nextFileName !== row.file_name) push("file_name", nextFileName);
    }

    let nextKind = String(row.kind || "");
    if (body.kind !== undefined) {
      const kind = String(body.kind || "").trim();
      if (kind !== "call" && kind !== "wechat") {
        return jsonError("类型无效，可选：通话 / 微信");
      }
      nextKind = kind;
      if (kind !== row.kind) push("kind", kind);
    }

    let nextCustomerId =
      row.customer_id == null ? null : Number(row.customer_id);
    if (body.customer_id !== undefined) {
      if (body.customer_id === null || body.customer_id === "") {
        nextCustomerId = null;
        if (row.customer_id != null) push("customer_id", null);
      } else {
        const cid = Number(body.customer_id);
        if (!Number.isFinite(cid) || cid <= 0) return jsonError("客户无效");
        await assertCanAccessCustomer(user, cid);
        nextCustomerId = cid;
        if (Number(row.customer_id) !== cid) push("customer_id", cid);
      }
    }

    let transcriptChanged = false;
    if (body.transcript !== undefined) {
      const transcript = String(body.transcript ?? "");
      if (transcript !== String(row.transcript ?? "")) {
        push("transcript", transcript);
        transcriptChanged = true;
      }
    }

    let updated = row;
    if (updates.length) {
      paramsSql.push(mediaId);
      const result = await pool.query(
        `UPDATE media_assets SET ${updates.join(", ")} WHERE id = $${paramsSql.length} RETURNING *`,
        paramsSql
      );
      updated = result.rows[0];
    }

    if (nextCustomerId !== (row.customer_id == null ? null : Number(row.customer_id))) {
      await pool.query(
        `UPDATE ai_insights SET customer_id = $1 WHERE media_asset_id = $2`,
        [nextCustomerId, mediaId]
      );
    }

    if (nextKind !== String(row.kind || "")) {
      await pool.query(
        `UPDATE ai_insights SET kind = $1 WHERE media_asset_id = $2`,
        [nextKind, mediaId]
      );
    }

    const reanalyze = Boolean(body.reanalyze);

    // 重新解析：只更新元数据/文本并返回 AI 预览，痛点竞品等用户确认后再写入
    if (reanalyze) {
      const text = String(
        body.transcript !== undefined ? body.transcript : updated.transcript || ""
      ).trim();
      if (!text) return jsonError("重新解析需要转写或聊天文本");
      if (transcriptChanged || body.transcript !== undefined) {
        const tRes = await pool.query(
          `UPDATE media_assets SET transcript = $1 WHERE id = $2 RETURNING *`,
          [text, mediaId]
        );
        updated = tRes.rows[0] || updated;
      }

      const draft = await previewMediaAnalysis({ user, mediaId });

      await writeAuditLog({
        user,
        action: "media.reanalyze",
        targetType: "media_asset",
        targetId: mediaId,
        summary: `重新解析预览「${nextFileName}」（待确认保存）`,
      });

      return jsonOk({
        ...(updated || row),
        ext: splitFileName(String((updated || row).file_name || "")).ext,
        draft,
      });
    }

    const hasPain = Array.isArray(body.pain_points);
    const hasComp = Array.isArray(body.competitors);
    if (hasPain || hasComp) {
      const painPoints = hasPain
        ? (body.pain_points as unknown[])
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .slice(0, 20)
        : null;
      const competitors = hasComp
        ? (body.competitors as unknown[])
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .slice(0, 20)
        : null;

      const latest = await pool.query(
        `SELECT id, result_json FROM ai_insights
         WHERE media_asset_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [mediaId]
      );
      if (latest.rows[0]) {
        const prev = (latest.rows[0].result_json || {}) as Record<string, unknown>;
        const nextJson = {
          ...prev,
          ...(painPoints ? { pain_points: painPoints } : {}),
          ...(competitors ? { competitors } : {}),
        };
        await pool.query(
          `UPDATE ai_insights SET result_json = $1::jsonb WHERE id = $2`,
          [JSON.stringify(nextJson), latest.rows[0].id]
        );

        // 同步写回客户画像，便于详情页立即看到确认后的痛点/竞品
        if (nextCustomerId != null) {
          const cur = await pool.query(
            `SELECT profile_json FROM customers WHERE id = $1`,
            [nextCustomerId]
          );
          const profile = (cur.rows[0]?.profile_json || {}) as Record<string, unknown>;
          const nextProfile = {
            ...profile,
            ...(painPoints
              ? {
                  pain_points: mergePainPoints(
                    profile.pain_points,
                    painPoints
                  ),
                }
              : {}),
            ...(competitors
              ? {
                  competitors: Array.from(
                    new Set([
                      ...((profile.competitors as string[]) || []),
                      ...competitors,
                    ])
                  ).slice(0, 20),
                }
              : {}),
            updated_by_ai_at: new Date().toISOString(),
          };
          await pool.query(
            `UPDATE customers SET profile_json = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [JSON.stringify(nextProfile), nextCustomerId]
          );
        }
      }
    }

    const parts: string[] = [];
    if (nextFileName !== row.file_name) parts.push("文件名");
    if (nextKind !== String(row.kind || "")) parts.push("类型");
    if (nextCustomerId !== (row.customer_id == null ? null : Number(row.customer_id))) {
      parts.push("客户");
    }
    if (transcriptChanged) parts.push("文本");
    if (hasPain || hasComp) parts.push("痛点/竞品");

    await writeAuditLog({
      user,
      action: "media.update",
      targetType: "media_asset",
      targetId: mediaId,
      summary:
        parts.length > 0
          ? `更新解析记录 ${nextFileName}（${parts.join("、")}）`
          : `更新解析记录 ${nextFileName}`,
    });

    const refreshed = await pool.query(
      `SELECT m.*,
              COALESCE(insight.result_json->'pain_points', '[]'::jsonb) AS pain_points,
              COALESCE(insight.result_json->'competitors', '[]'::jsonb) AS competitors
       FROM media_assets m
       LEFT JOIN LATERAL (
         SELECT i.result_json
         FROM ai_insights i
         WHERE i.media_asset_id = m.id
         ORDER BY i.created_at DESC
         LIMIT 1
       ) insight ON TRUE
       WHERE m.id = $1`,
      [mediaId]
    );

    return jsonOk({
      ...(refreshed.rows[0] || updated),
      ext: splitFileName(String((refreshed.rows[0] || updated).file_name || "")).ext,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const result = await pool.query(
      `SELECT m.*, i.id AS insight_id, i.result_json, i.summary AS insight_summary
       FROM media_assets m
       LEFT JOIN ai_insights i ON i.media_asset_id = m.id
       WHERE m.id = $1
       ORDER BY i.created_at DESC
       LIMIT 1`,
      [id]
    );
    const row = result.rows[0];
    if (!row) return jsonError("未找到", 404);
    if (
      user.role !== "super_admin" &&
      Number(row.company_id) !== Number(user.company_id)
    ) {
      return jsonError("无权访问", 403);
    }
    return jsonOk(row);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const mediaId = Number(id);
    if (!Number.isFinite(mediaId) || mediaId <= 0) {
      return jsonError("无效的记录 ID");
    }

    const existing = await pool.query(`SELECT * FROM media_assets WHERE id = $1`, [
      mediaId,
    ]);
    const row = existing.rows[0];
    if (!row) return jsonError("未找到", 404);

    const sameCompany =
      row.company_id != null &&
      user.company_id != null &&
      Number(row.company_id) === Number(user.company_id);
    if (!sameCompany && user.role !== "super_admin") {
      return jsonError("无权删除", 403);
    }

    if (row.customer_id != null) {
      await assertCanAccessCustomer(user, Number(row.customer_id));
    }

    // FK is ON DELETE SET NULL; remove insights tied to this media for cleanliness
    await pool.query(`DELETE FROM ai_insights WHERE media_asset_id = $1`, [mediaId]);

    if (row.uri) {
      await deleteObject(String(row.uri));
    }

    await pool.query(`DELETE FROM media_assets WHERE id = $1`, [mediaId]);

    await writeAuditLog({
      user,
      action: "media.delete",
      targetType: "media_asset",
      targetId: mediaId,
      summary: `删除解析记录 ${row.file_name || mediaId}`,
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
