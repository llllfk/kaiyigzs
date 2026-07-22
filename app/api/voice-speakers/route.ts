import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { getCompanyVoiceCloneSlots } from "@/lib/company-config";
import { getCompanySynthQuotaStatus } from "@/lib/voice-synth-logs";
import {
  resolveVolcVoiceCredentials,
  volcVoiceCredsValid,
} from "@/lib/volc-voice";

function requireCompanyId(user: Awaited<ReturnType<typeof requireSession>>) {
  if (!user.company_id) {
    throw new AuthError("请先进入公司视图", 403);
  }
  return user.company_id;
}

async function loadSlots(companyId: number) {
  const res = await pool.query(`SELECT config FROM companies WHERE id = $1`, [
    companyId,
  ]);
  if (!res.rows[0]) throw new AuthError("公司不存在", 404);
  return getCompanyVoiceCloneSlots(res.rows[0].config);
}

function publicVoiceRow(row: Record<string, unknown>) {
  const { sample_uri: _uri, meta, provider_speaker_id, ...rest } = row;
  const m =
    meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  const timesRaw = m.available_training_times;
  const times =
    timesRaw == null || timesRaw === "" ? null : Number(timesRaw);
  const speakerId = String(provider_speaker_id || "").trim();
  return {
    ...rest,
    speaker_id: speakerId || null,
    available_training_times:
      times != null && Number.isFinite(times) ? times : null,
  };
}

export async function GET() {
  try {
    const user = await requireSession();
    const companyId = requireCompanyId(user);
    const slots = await loadSlots(companyId);
    const synthQuota = await getCompanySynthQuotaStatus(companyId);
    const list = await pool.query(
      `SELECT id, company_id, name, slot_index, sample_file_name, sample_mime,
              sample_size_bytes, status, error_message, meta,
              created_at, updated_at, created_by,
              provider_speaker_id,
              CASE WHEN provider_speaker_id IS NOT NULL AND provider_speaker_id <> ''
                THEN true ELSE false END AS has_speaker
       FROM voice_speakers
       WHERE company_id = $1
       ORDER BY slot_index ASC, id ASC`,
      [companyId]
    );
    const creds = await resolveVolcVoiceCredentials();
    const assigned = list.rows.length;
    const pendingTrain = list.rows.filter(
      (r) => r.has_speaker && (r.status === "draft" || r.status === "failed")
    ).length;
    return jsonOk({
      slots,
      used: assigned,
      pending_train: pendingTrain,
      voice_configured: volcVoiceCredsValid(creds),
      synth_quota: synthQuota,
      items: list.rows.map((r) => publicVoiceRow(r)),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/** 公司端不可自行创建音色；须由平台分配 Speaker ID 后上传训练 */
export async function POST(_request: NextRequest) {
  try {
    await requireSession();
    return jsonError(
      "请等待平台管理员分配 Speaker ID 后再上传样音训练。公司端不可自行创建音色。",
      403
    );
  } catch (err) {
    return handleApiError(err);
  }
}
