import pool from "@/lib/db";
import { getCompanySynthMinutesQuota } from "@/lib/company-config";

export type VoiceSynthSource = "clone" | "official";
export type VoiceSynthStatus = "success" | "failed";

export type VoiceSynthLogInput = {
  companyId: number | null;
  userId: number | null;
  source: VoiceSynthSource;
  voiceSpeakerId?: number | null;
  officialSpeakerId?: string | null;
  speakerLabel?: string | null;
  iclModelType?: number | null;
  status: VoiceSynthStatus;
  errorMessage?: string | null;
  textContent: string;
  contextText?: string | null;
  audioBytes?: number | null;
  /** 已知码率估算时长；客户端可再回写更准的 duration_sec */
  durationSec?: number | null;
  saved?: boolean;
};

export function countTextChars(text: string): number {
  return Array.from(String(text || "")).length;
}

/** 按合成时固定码率估算 MP3 秒数（默认 160kbps） */
export function estimateMp3DurationSec(
  bytes: number | null | undefined,
  bitRate = 160000
): number | null {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 200) return null;
  const sec = (n * 8) / bitRate;
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.round(sec * 10) / 10;
}

export async function insertVoiceSynthLog(
  input: VoiceSynthLogInput
): Promise<number | null> {
  try {
    const text = String(input.textContent || "");
    const duration =
      input.durationSec != null && Number.isFinite(Number(input.durationSec))
        ? Number(input.durationSec)
        : estimateMp3DurationSec(input.audioBytes);
    const res = await pool.query(
      `INSERT INTO voice_synth_logs (
         company_id, user_id, source, voice_speaker_id, official_speaker_id,
         speaker_label, icl_model_type, status, error_message,
         text_content, text_char_count, context_text,
         duration_sec, audio_bytes, saved, saved_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         CASE WHEN $15 THEN CURRENT_TIMESTAMP ELSE NULL END
       )
       RETURNING id`,
      [
        input.companyId,
        input.userId,
        input.source,
        input.voiceSpeakerId ?? null,
        input.officialSpeakerId ? String(input.officialSpeakerId).trim() : null,
        input.speakerLabel || null,
        input.iclModelType ?? null,
        input.status,
        input.errorMessage ? String(input.errorMessage).slice(0, 500) : null,
        text,
        countTextChars(text),
        input.contextText?.trim() || null,
        duration,
        input.audioBytes ?? null,
        Boolean(input.saved),
      ]
    );
    const id = Number(res.rows[0]?.id);
    return Number.isFinite(id) ? id : null;
  } catch (err) {
    console.error("[voice-synth-logs] insert failed", err);
    return null;
  }
}

export async function markVoiceSynthLogSaved(params: {
  logId?: number | null;
  companyId: number;
  userId: number;
  source: VoiceSynthSource;
  voiceSpeakerId?: number | null;
  officialSpeakerId?: string | null;
  durationSec?: number | null;
}): Promise<boolean> {
  try {
    const duration =
      params.durationSec != null && Number.isFinite(Number(params.durationSec))
        ? Math.max(0, Number(params.durationSec))
        : null;

    if (params.logId) {
      const res = await pool.query(
        `UPDATE voice_synth_logs
         SET saved = TRUE,
             saved_at = COALESCE(saved_at, CURRENT_TIMESTAMP),
             duration_sec = COALESCE($2::numeric, duration_sec)
         WHERE id = $1
           AND company_id = $3
           AND user_id = $4
         RETURNING id`,
        [params.logId, duration, params.companyId, params.userId]
      );
      return Boolean(res.rows[0]);
    }

    // 回退：标记该用户最近一次成功且未保存的合成
    const res = await pool.query(
      `UPDATE voice_synth_logs
       SET saved = TRUE,
           saved_at = COALESCE(saved_at, CURRENT_TIMESTAMP),
           duration_sec = COALESCE($1::numeric, duration_sec)
       WHERE id = (
         SELECT id FROM voice_synth_logs
         WHERE company_id = $2
           AND user_id = $3
           AND source = $4
           AND status = 'success'
           AND saved = FALSE
           AND (
             ($4 = 'clone' AND voice_speaker_id = $5)
             OR ($4 = 'official' AND official_speaker_id = $6)
           )
         ORDER BY created_at DESC
         LIMIT 1
       )
       RETURNING id`,
      [
        duration,
        params.companyId,
        params.userId,
        params.source,
        params.voiceSpeakerId ?? null,
        params.officialSpeakerId
          ? String(params.officialSpeakerId).trim()
          : null,
      ]
    );
    return Boolean(res.rows[0]);
  } catch (err) {
    console.error("[voice-synth-logs] mark saved failed", err);
    return false;
  }
}

export async function updateVoiceSynthLogDuration(params: {
  logId: number;
  companyId: number;
  userId: number;
  durationSec: number;
}): Promise<boolean> {
  try {
    const sec = Math.max(0, Math.round(Number(params.durationSec) * 10) / 10);
    if (!Number.isFinite(sec)) return false;
    const res = await pool.query(
      `UPDATE voice_synth_logs
       SET duration_sec = $1
       WHERE id = $2 AND company_id = $3 AND user_id = $4
       RETURNING id`,
      [sec, params.logId, params.companyId, params.userId]
    );
    return Boolean(res.rows[0]);
  } catch (err) {
    console.error("[voice-synth-logs] update duration failed", err);
    return false;
  }
}

export type VoiceSynthStats = {
  total: number;
  success: number;
  failed: number;
  saved: number;
  /** 仅成功合成的时长合计（秒） */
  success_duration_sec: number;
};

export async function getVoiceSynthStats(filter: {
  voiceSpeakerId?: number | null;
  officialSpeakerId?: string | null;
  companyId?: number | null;
}): Promise<VoiceSynthStats> {
  const res = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'success')::int AS success,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE saved = TRUE)::int AS saved,
       COALESCE(
         SUM(duration_sec) FILTER (
           WHERE status = 'success' AND duration_sec IS NOT NULL
         ),
         0
       )::float AS success_duration_sec
     FROM voice_synth_logs
     WHERE ($1::bigint IS NULL OR voice_speaker_id = $1)
       AND ($2::text IS NULL OR official_speaker_id = $2)
       AND ($3::bigint IS NULL OR company_id = $3)`,
    [
      filter.voiceSpeakerId ?? null,
      filter.officialSpeakerId
        ? String(filter.officialSpeakerId).trim()
        : null,
      filter.companyId ?? null,
    ]
  );
  const row = res.rows[0] || {};
  return {
    total: Number(row.total) || 0,
    success: Number(row.success) || 0,
    failed: Number(row.failed) || 0,
    saved: Number(row.saved) || 0,
    success_duration_sec:
      Math.round((Number(row.success_duration_sec) || 0) * 10) / 10,
  };
}

export type CompanySynthQuotaStatus = {
  quota_minutes: number;
  used_sec: number;
  used_minutes: number;
  remaining_sec: number;
  remaining_minutes: number;
  /** 配额为 0 或已用尽 */
  exhausted: boolean;
};

/** 公司公用合成分钟：复刻 + 官方成功合成时长合计 */
export async function getCompanySynthQuotaStatus(
  companyId: number
): Promise<CompanySynthQuotaStatus> {
  const companyRes = await pool.query(
    `SELECT config FROM companies WHERE id = $1`,
    [companyId]
  );
  const quotaMinutes = getCompanySynthMinutesQuota(companyRes.rows[0]?.config);
  const stats = await getVoiceSynthStats({ companyId });
  const usedSec = stats.success_duration_sec;
  const quotaSec = quotaMinutes * 60;
  const remainingSec = Math.max(0, Math.round((quotaSec - usedSec) * 10) / 10);
  return {
    quota_minutes: quotaMinutes,
    used_sec: usedSec,
    used_minutes: Math.round((usedSec / 60) * 10) / 10,
    remaining_sec: remainingSec,
    remaining_minutes: Math.round((remainingSec / 60) * 10) / 10,
    exhausted: quotaMinutes <= 0 || usedSec >= quotaSec,
  };
}

/** 正式合成前校验；试听不计入也不拦截 */
export async function assertCompanySynthMinutesAvailable(
  companyId: number
): Promise<CompanySynthQuotaStatus> {
  const status = await getCompanySynthQuotaStatus(companyId);
  if (status.quota_minutes <= 0) {
    throw new Error("公司未开通声音合成分钟数，请联系平台管理员");
  }
  if (status.exhausted) {
    throw new Error(
      `合成分钟数已用尽（已用 ${status.used_minutes} / ${status.quota_minutes} 分钟，复刻与官方共用）`
    );
  }
  return status;
}

export async function listVoiceSynthLogs(params: {
  voiceSpeakerId?: number | null;
  officialSpeakerId?: string | null;
  companyId?: number | null;
  userId?: number | null;
  source?: VoiceSynthSource | null;
  status?: VoiceSynthStatus | null;
  saved?: boolean | null;
  from?: string | null;
  to?: string | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
  /** 导出时放开 pageSize 上限（最多 5000） */
  forExport?: boolean;
}) {
  const page = Math.max(1, Number(params.page) || 1);
  const rawSize = Number(params.pageSize);
  const pageSize = params.forExport
    ? Math.min(
        Math.max(1, Number.isFinite(rawSize) ? rawSize : 5000),
        5000
      )
    : [10, 20, 50].includes(rawSize)
      ? rawSize
      : 20;

  const where: string[] = [];
  const args: unknown[] = [];

  if (params.voiceSpeakerId != null && Number(params.voiceSpeakerId)) {
    args.push(Number(params.voiceSpeakerId));
    where.push(`l.voice_speaker_id = $${args.length}`);
  }
  if (params.officialSpeakerId?.trim()) {
    args.push(String(params.officialSpeakerId).trim());
    where.push(`l.official_speaker_id = $${args.length}`);
  }
  if (params.companyId != null && Number(params.companyId)) {
    args.push(Number(params.companyId));
    where.push(`l.company_id = $${args.length}`);
  }
  if (params.userId != null && Number(params.userId)) {
    args.push(Number(params.userId));
    where.push(`l.user_id = $${args.length}`);
  }
  if (params.source === "clone" || params.source === "official") {
    args.push(params.source);
    where.push(`l.source = $${args.length}`);
  }
  if (params.status === "success" || params.status === "failed") {
    args.push(params.status);
    where.push(`l.status = $${args.length}`);
  }
  if (params.saved === true || params.saved === false) {
    args.push(params.saved);
    where.push(`l.saved = $${args.length}`);
  }
  if (params.from?.trim()) {
    args.push(params.from.trim());
    where.push(`l.created_at >= $${args.length}::date`);
  }
  if (params.to?.trim()) {
    args.push(params.to.trim());
    where.push(`l.created_at < ($${args.length}::date + INTERVAL '1 day')`);
  }
  if (params.q?.trim()) {
    args.push(`%${params.q.trim()}%`);
    const i = args.length;
    where.push(
      `(l.text_content ILIKE $${i} OR COALESCE(l.context_text, '') ILIKE $${i} OR COALESCE(l.speaker_label, '') ILIKE $${i} OR COALESCE(l.official_speaker_id, '') ILIKE $${i} OR COALESCE(u.name, '') ILIKE $${i})`
    );
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const fromSql = `FROM voice_synth_logs l
     LEFT JOIN users u ON u.id = l.user_id
     LEFT JOIN companies c ON c.id = l.company_id
     ${whereSql}`;

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS c ${fromSql}`,
    args
  );
  const total = Number(countRes.rows[0]?.c) || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;

  const listArgs = [...args, pageSize, offset];
  const listRes = await pool.query(
    `SELECT
       l.id, l.company_id, l.user_id, l.source, l.voice_speaker_id,
       l.official_speaker_id, l.speaker_label, l.icl_model_type,
       l.status, l.error_message, l.text_content, l.text_char_count,
       l.context_text, l.duration_sec, l.audio_bytes, l.saved, l.saved_at,
       l.created_at,
       u.name AS user_name,
       c.name AS company_name
     ${fromSql}
     ORDER BY l.created_at DESC
     LIMIT $${listArgs.length - 1} OFFSET $${listArgs.length}`,
    listArgs
  );

  return {
    total,
    page: safePage,
    pageSize,
    totalPages,
    items: listRes.rows.map((r) => ({
      id: Number(r.id),
      company_id: r.company_id != null ? Number(r.company_id) : null,
      company_name: r.company_name || null,
      user_id: r.user_id != null ? Number(r.user_id) : null,
      user_name: r.user_name || null,
      source: r.source as VoiceSynthSource,
      source_label: r.source === "official" ? "官方音色" : "声音复刻",
      voice_speaker_id:
        r.voice_speaker_id != null ? Number(r.voice_speaker_id) : null,
      official_speaker_id: r.official_speaker_id || null,
      speaker_label: r.speaker_label || null,
      icl_model_type:
        r.icl_model_type != null ? Number(r.icl_model_type) : null,
      status: r.status as VoiceSynthStatus,
      error_message: r.error_message || null,
      text_content: r.text_content || "",
      text_char_count: Number(r.text_char_count) || 0,
      context_text: r.context_text || null,
      duration_sec:
        r.duration_sec != null && Number.isFinite(Number(r.duration_sec))
          ? Number(r.duration_sec)
          : null,
      audio_bytes: r.audio_bytes != null ? Number(r.audio_bytes) : null,
      saved: Boolean(r.saved),
      saved_at: r.saved_at || null,
      created_at: r.created_at,
    })),
  };
}

/** 某公司用过的官方音色及合成统计 */
export async function listCompanyOfficialVoiceStats(companyId: number): Promise<
  Array<{
    official_speaker_id: string;
    speaker_label: string | null;
    stats: VoiceSynthStats;
  }>
> {
  const cid = Number(companyId);
  if (!cid) return [];
  const res = await pool.query(
    `SELECT
       official_speaker_id,
       MAX(speaker_label) FILTER (WHERE speaker_label IS NOT NULL AND speaker_label <> '') AS speaker_label,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'success')::int AS success,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE saved = TRUE)::int AS saved,
       COALESCE(
         SUM(duration_sec) FILTER (
           WHERE status = 'success' AND duration_sec IS NOT NULL
         ),
         0
       )::float AS success_duration_sec
     FROM voice_synth_logs
     WHERE company_id = $1
       AND source = 'official'
       AND official_speaker_id IS NOT NULL
       AND official_speaker_id <> ''
     GROUP BY official_speaker_id
     ORDER BY COUNT(*) DESC, official_speaker_id ASC`,
    [cid]
  );
  return res.rows.map((row) => ({
    official_speaker_id: String(row.official_speaker_id),
    speaker_label: row.speaker_label ? String(row.speaker_label) : null,
    stats: {
      total: Number(row.total) || 0,
      success: Number(row.success) || 0,
      failed: Number(row.failed) || 0,
      saved: Number(row.saved) || 0,
      success_duration_sec:
        Math.round((Number(row.success_duration_sec) || 0) * 10) / 10,
    },
  }));
}

/** 批量统计复刻音色使用次数（平台列表） */
export async function getCloneVoiceSynthStatsMap(
  speakerIds: number[]
): Promise<Map<number, VoiceSynthStats>> {
  const map = new Map<number, VoiceSynthStats>();
  if (!speakerIds.length) return map;
  const res = await pool.query(
    `SELECT
       voice_speaker_id,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'success')::int AS success,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE saved = TRUE)::int AS saved,
       COALESCE(
         SUM(duration_sec) FILTER (
           WHERE status = 'success' AND duration_sec IS NOT NULL
         ),
         0
       )::float AS success_duration_sec
     FROM voice_synth_logs
     WHERE voice_speaker_id = ANY($1::bigint[])
     GROUP BY voice_speaker_id`,
    [speakerIds]
  );
  for (const row of res.rows) {
    const id = Number(row.voice_speaker_id);
    if (!id) continue;
    map.set(id, {
      total: Number(row.total) || 0,
      success: Number(row.success) || 0,
      failed: Number(row.failed) || 0,
      saved: Number(row.saved) || 0,
      success_duration_sec:
        Math.round((Number(row.success_duration_sec) || 0) * 10) / 10,
    });
  }
  return map;
}
