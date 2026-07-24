import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError, isActingAsCompany } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { getCompanyVoiceCloneSlots } from "@/lib/company-config";
import { VOICE_TRAINING_TIMES_LIMIT } from "@/lib/voice-constants";
import { getCloneVoiceSynthStatsMap } from "@/lib/voice-synth-logs";

function assertPlatformSuperAdmin(
  user: Awaited<ReturnType<typeof requireSession>>
) {
  if (user.role !== "super_admin" || isActingAsCompany(user)) {
    throw new AuthError("仅平台超级管理员可管理音色", 403);
  }
}

function nextSlotIndex(used: number[], maxSlots: number): number | null {
  for (let i = 0; i < maxSlots; i++) {
    if (!used.includes(i)) return i;
  }
  return null;
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function serializeVoiceRow(row: Record<string, unknown>) {
  const meta =
    row.meta && typeof row.meta === "object"
      ? (row.meta as Record<string, unknown>)
      : {};
  const timesRaw = meta.available_training_times;
  const times =
    timesRaw == null || timesRaw === ""
      ? null
      : Number(timesRaw);
  return {
    ...row,
    id: toNum(row.id),
    company_id: toNum(row.company_id),
    created_by: toNum(row.created_by),
    slot_index: toNum(row.slot_index) ?? 0,
    sample_size_bytes: toNum(row.sample_size_bytes),
    company_slots: toNum(row.company_slots) ?? 0,
    available_training_times:
      times != null && Number.isFinite(times) ? times : null,
    volc_state: meta.volc_state != null ? String(meta.volc_state) : null,
  };
}

/** 全平台音色列表（含 Speaker ID） */
export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    assertPlatformSuperAdmin(user);

    const sync = request.nextUrl.searchParams.get("sync") === "1";
    const [list, companies] = await Promise.all([
      pool.query(
        `SELECT v.id, v.company_id, v.created_by, v.name, v.slot_index,
                v.sample_file_name, v.sample_mime, v.sample_size_bytes,
                v.provider_speaker_id, v.status, v.error_message, v.meta,
                v.created_at, v.updated_at,
                c.name AS company_name,
                u.name AS creator_name,
                COALESCE((c.config->>'voice_clone_slots')::int, 0) AS company_slots
         FROM voice_speakers v
         JOIN companies c ON c.id = v.company_id
         LEFT JOIN users u ON u.id = v.created_by
         ORDER BY v.id DESC`
      ),
      pool.query(
        `SELECT c.id, c.name, c.status,
                COALESCE((c.config->>'voice_clone_slots')::int, 0) AS voice_clone_slots,
                COALESCE((c.config->>'synth_minutes_quota')::int, 0) AS synth_minutes_quota
         FROM companies c
         WHERE c.status = 'active'
         ORDER BY c.id DESC`
      ),
    ]);

    const synthUsageRes = await pool.query(
      `SELECT company_id,
              COALESCE(
                SUM(duration_sec) FILTER (
                  WHERE status = 'success' AND duration_sec IS NOT NULL
                ),
                0
              )::float AS used_sec
       FROM voice_synth_logs
       WHERE company_id IS NOT NULL
       GROUP BY company_id`
    );
    const synthUsedSecByCompany = new Map<number, number>();
    for (const row of synthUsageRes.rows) {
      const cid = Number(row.company_id);
      if (!cid) continue;
      synthUsedSecByCompany.set(
        cid,
        Math.round((Number(row.used_sec) || 0) * 10) / 10
      );
    }

    let volcStatuses: Record<string, unknown> | null = null;
    let syncError: string | null = null;
    /** 仅作可选能力；训练/合成/状态不依赖 OpenAPI */
    let openApiOk = false;
    try {
      const saas = await import("@/lib/volc-speech-saas");
      openApiOk = Boolean(saas.resolveVolcOpenApiCredentials());
    } catch {
      openApiOk = false;
    }

    let syncSummary: {
      total: number;
      ok: number;
      failed: number;
    } | null = null;

    if (sync) {
      try {
        const voice = await import("@/lib/volc-voice");
        const creds = await voice.resolveVolcVoiceCredentials();
        if (!voice.volcVoiceCredsValid(creds) || !creds) {
          syncError =
            "未配置豆包 API Key（VOLC_VOICE_API_KEY / VOLC_ASR_API_KEY），无法查询剩余训练次数";
        } else {
          const synced: Record<string, unknown>[] = [];
          let ok = 0;
          let failed = 0;
          for (const row of list.rows) {
            const sid = String(row.provider_speaker_id || "").trim();
            if (!sid) continue;
            try {
              const { status, raw } = await voice.queryVoiceCloneStatus({
                creds,
                speakerId: sid,
              });
              const fromVolc = voice.pickAvailableTrainingTimes(raw);
              const prevMeta =
                row.meta && typeof row.meta === "object"
                  ? (row.meta as Record<string, unknown>)
                  : {};
              const nextMeta = {
                ...prevMeta,
                ...(fromVolc != null
                  ? { available_training_times: fromVolc }
                  : {}),
                volc_state: status,
                volc_synced_at: new Date().toISOString(),
              };
              await pool.query(
                `UPDATE voice_speakers
                 SET meta = $1::jsonb, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [JSON.stringify(nextMeta), row.id]
              );
              row.meta = nextMeta;
              ok += 1;
              synced.push({
                speaker_id: sid,
                status,
                available_training_times:
                  fromVolc ??
                  (Number.isFinite(Number(prevMeta.available_training_times))
                    ? Number(prevMeta.available_training_times)
                    : null),
                raw,
              });
            } catch (e) {
              failed += 1;
              synced.push({
                speaker_id: sid,
                error: e instanceof Error ? e.message : "查询失败",
              });
            }
          }
          volcStatuses = { items: synced };
          syncSummary = {
            total: synced.length,
            ok,
            failed,
          };
          if (!synced.length) {
            syncError = "没有可查询的 Speaker ID";
          } else if (failed > 0 && ok === 0) {
            syncError = `全部 ${failed} 个音色查询失败，请检查 API Key 与 Speaker ID`;
          } else if (failed > 0) {
            syncError = `${ok} 个成功，${failed} 个失败（见下方原始数据）`;
          }
        }
      } catch (e) {
        syncError = e instanceof Error ? e.message : "查询剩余训练次数失败";
      }
    }

    const speakerIds = list.rows
      .map((r) => toNum(r.id))
      .filter((id): id is number => id != null);
    const synthStatsMap = await getCloneVoiceSynthStatsMap(speakerIds);

    return jsonOk({
      items: list.rows.map((r) => {
        const base = serializeVoiceRow(r as Record<string, unknown>);
        const id = base.id;
        const st =
          id != null
            ? synthStatsMap.get(id) || {
                total: 0,
                success: 0,
                failed: 0,
                saved: 0,
                success_duration_sec: 0,
              }
            : {
                total: 0,
                success: 0,
                failed: 0,
                saved: 0,
                success_duration_sec: 0,
              };
        return {
          ...base,
          synth_total: st.total,
          synth_success: st.success,
          synth_failed: st.failed,
          synth_saved: st.saved,
          synth_success_duration_sec: st.success_duration_sec,
        };
      }),
      companies: companies.rows.map((r) => {
        const id = toNum(r.id);
        const usedSec =
          id != null ? synthUsedSecByCompany.get(id) || 0 : 0;
        return {
          id,
          name: r.name,
          status: r.status,
          voice_clone_slots: toNum(r.voice_clone_slots) ?? 0,
          synth_minutes_quota: toNum(r.synth_minutes_quota) ?? 0,
          synth_used_sec: usedSec,
          synth_used_minutes: Math.round((usedSec / 60) * 10) / 10,
        };
      }),
      openapi_configured: openApiOk,
      training_times_limit: VOICE_TRAINING_TIMES_LIMIT,
      volc_statuses: volcStatuses,
      sync_error: syncError,
      sync_summary: syncSummary,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * 平台为公司分配音色槽位 + Speaker ID（公司随后才能上传样音训练）
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    assertPlatformSuperAdmin(user);

    const body = await request.json().catch(() => ({}));
    const companyId = Number(body.company_id);
    const speakerId = String(body.provider_speaker_id || "").trim();
    const name = String(body.name || "").trim() || "公司音色";
    if (!companyId) return jsonError("请选择公司");
    if (!speakerId) return jsonError("请填写火山 Speaker ID");

    const company = await pool.query(
      `SELECT id, name, config FROM companies WHERE id = $1`,
      [companyId]
    );
    if (!company.rows[0]) return jsonError("公司不存在", 404);
    const slots = getCompanyVoiceCloneSlots(company.rows[0].config);
    if (slots <= 0) {
      return jsonError("该公司复刻槽位为 0，请先在公司 AI 配置中设为 1 或 2", 400);
    }

    const existing = await pool.query(
      `SELECT id, slot_index, provider_speaker_id FROM voice_speakers WHERE company_id = $1`,
      [companyId]
    );
    if (existing.rows.length >= slots) {
      return jsonError(`该公司已用满 ${slots} 个槽位`, 400);
    }

    const dup = await pool.query(
      `SELECT id FROM voice_speakers WHERE provider_speaker_id = $1 LIMIT 1`,
      [speakerId]
    );
    if (dup.rows[0]) {
      return jsonError("该 Speaker ID 已被分配，请勿重复使用", 400);
    }

    const slotIndex = nextSlotIndex(
      existing.rows.map((r) => Number(r.slot_index)),
      slots
    );
    if (slotIndex == null) return jsonError(`该公司已用满 ${slots} 个槽位`, 400);

    const inserted = await pool.query(
      `INSERT INTO voice_speakers (
         company_id, created_by, name, slot_index,
         provider_speaker_id, status, error_message, meta
       ) VALUES ($1,$2,$3,$4,$5,'draft',NULL,$6::jsonb)
       RETURNING *`,
      [
        companyId,
        user.id,
        name.slice(0, 100),
        slotIndex,
        speakerId,
        JSON.stringify({
          assigned_by: "platform",
          note: String(body.note || "").slice(0, 500),
          /** 未查询前默认满额；点「查询剩余次数」后以火山 get_voice 为准 */
          available_training_times: VOICE_TRAINING_TIMES_LIMIT,
        }),
      ]
    );

    await writeAuditLog({
      user,
      companyId,
      action: "voice.platform_assign",
      targetType: "voice_speaker",
      targetId: inserted.rows[0].id,
      summary: `为「${company.rows[0].name}」分配 Speaker ID ${speakerId}`,
    });

    return jsonOk(inserted.rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}

/** 平台修改 Speaker ID / 名称 / 备注 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSession();
    assertPlatformSuperAdmin(user);

    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return jsonError("缺少音色 ID");

    const existing = await pool.query(
      `SELECT * FROM voice_speakers WHERE id = $1`,
      [id]
    );
    if (!existing.rows[0]) return jsonError("音色不存在", 404);
    const prev = existing.rows[0];

    const name =
      body.name !== undefined
        ? String(body.name || "").trim().slice(0, 100)
        : prev.name;
    const speakerId =
      body.provider_speaker_id !== undefined
        ? String(body.provider_speaker_id || "").trim()
        : prev.provider_speaker_id;
    if (!speakerId) return jsonError("Speaker ID 不能为空");

    if (speakerId !== prev.provider_speaker_id) {
      const dup = await pool.query(
        `SELECT id FROM voice_speakers WHERE provider_speaker_id = $1 AND id <> $2 LIMIT 1`,
        [speakerId, id]
      );
      if (dup.rows[0]) {
        return jsonError("该 Speaker ID 已被其他音色使用", 400);
      }
    }

    const status =
      body.status !== undefined
        ? String(body.status || "").trim()
        : prev.status;

    const prevMeta =
      prev.meta && typeof prev.meta === "object" ? prev.meta : {};
    const nextMeta = {
      ...prevMeta,
      ...(body.note !== undefined
        ? { note: String(body.note || "").slice(0, 500) }
        : {}),
    };

    const updated = await pool.query(
      `UPDATE voice_speakers
       SET name = $1,
           provider_speaker_id = $2,
           status = $3,
           meta = $4::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [
        name || prev.name,
        speakerId,
        status || prev.status,
        JSON.stringify(nextMeta),
        id,
      ]
    );

    await writeAuditLog({
      user,
      companyId: prev.company_id,
      action: "voice.platform_update",
      targetType: "voice_speaker",
      targetId: id,
      summary: `平台更新音色 #${id} SpeakerID=${speakerId}`,
    });

    return jsonOk(updated.rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSession();
    assertPlatformSuperAdmin(user);
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!id) return jsonError("缺少音色 ID");
    const existing = await pool.query(
      `SELECT * FROM voice_speakers WHERE id = $1`,
      [id]
    );
    if (!existing.rows[0]) return jsonError("音色不存在", 404);
    await pool.query(`DELETE FROM voice_speakers WHERE id = $1`, [id]);
    await writeAuditLog({
      user,
      companyId: existing.rows[0].company_id,
      action: "voice.delete",
      targetType: "voice_speaker",
      targetId: id,
      summary: `平台删除音色「${existing.rows[0].name}」`,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
