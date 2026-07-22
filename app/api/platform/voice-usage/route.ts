import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError, isActingAsCompany } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import {
  getVoiceSynthStats,
  listCompanyOfficialVoiceStats,
  listVoiceSynthLogs,
} from "@/lib/voice-synth-logs";
import { getOfficialVoiceDef } from "@/lib/volc-official-voices";
import {
  EXPORT_ROW_LIMIT,
  csvFileResponse,
  exportStamp,
  formatCsvDateTime,
  rowsToCsv,
} from "@/lib/csv";

function assertPlatformSuperAdmin(
  user: Awaited<ReturnType<typeof requireSession>>
) {
  if (user.role !== "super_admin" || isActingAsCompany(user)) {
    throw new AuthError("仅平台超级管理员可查看音色使用明细", 403);
  }
}

function logsToCsv(
  items: Awaited<ReturnType<typeof listVoiceSynthLogs>>["items"]
) {
  const headers = [
    "时间",
    "使用者",
    "公司",
    "来源",
    "模型",
    "状态",
    "字数",
    "时长(秒)",
    "保存",
    "文案",
    "语气",
    "错误信息",
  ];
  const rows = items.map((log) => [
    formatCsvDateTime(log.created_at),
    log.user_name || "",
    log.company_name || "",
    log.source_label || log.source || "",
    log.icl_model_type != null
      ? `ICL ${log.icl_model_type === 1 ? "1.0" : "3.0"}`
      : "",
    log.status === "success" ? "成功" : "失败",
    log.text_char_count ?? "",
    log.duration_sec ?? "",
    log.saved ? "已保存" : "未保存",
    log.text_content || "",
    log.context_text || "",
    log.error_message || "",
  ]);
  return rowsToCsv(headers, rows);
}

/**
 * GET ?company_id=1                          → 该公司用过的官方音色汇总
 * GET ?source=clone&voice_speaker_id=1
 * GET ?source=official&official_speaker_id=...
 * 可选 company_id：明细/统计限定到该公司
 * 可选 format=csv：导出当前筛选下的合成明细（最多 5000 条）
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    assertPlatformSuperAdmin(user);

    const sp = request.nextUrl.searchParams;
    const source = String(sp.get("source") || "").trim();
    const asCsv = String(sp.get("format") || "").trim().toLowerCase() === "csv";
    const page = Number(sp.get("page") || 1);
    const pageSize = Number(sp.get("pageSize") || 20);
    const companyIdRaw = sp.get("company_id");
    const companyId =
      companyIdRaw != null && String(companyIdRaw).trim() !== ""
        ? Number(companyIdRaw)
        : null;
    if (companyId != null && (!Number.isFinite(companyId) || companyId <= 0)) {
      return jsonError("company_id 无效");
    }

    // 公司维度：官方音色使用汇总（无 source 时）
    if (!source && companyId) {
      if (asCsv) return jsonError("公司汇总暂不支持 CSV，请打开具体音色使用明细后再导出");
      const companyRes = await pool.query(
        `SELECT id, name FROM companies WHERE id = $1`,
        [companyId]
      );
      if (!companyRes.rows[0]) return jsonError("公司不存在", 404);
      const official = await listCompanyOfficialVoiceStats(companyId);
      return jsonOk({
        company: {
          id: Number(companyRes.rows[0].id),
          name: companyRes.rows[0].name,
        },
        official: official.map((row) => {
          const def = getOfficialVoiceDef(row.official_speaker_id);
          return {
            speaker_id: row.official_speaker_id,
            name:
              def?.name ||
              row.speaker_label ||
              row.official_speaker_id,
            gender: def?.gender || null,
            hint: def?.hint || null,
            synth_total: row.stats.total,
            synth_success: row.stats.success,
            synth_failed: row.stats.failed,
            synth_saved: row.stats.saved,
            synth_success_duration_sec: row.stats.success_duration_sec,
          };
        }),
      });
    }

    if (source === "clone") {
      const voiceSpeakerId = Number(sp.get("voice_speaker_id") || sp.get("id"));
      if (!voiceSpeakerId) return jsonError("缺少 voice_speaker_id");

      const voiceRes = await pool.query(
        `SELECT v.id, v.name, v.provider_speaker_id, v.status, v.company_id,
                c.name AS company_name
         FROM voice_speakers v
         JOIN companies c ON c.id = v.company_id
         WHERE v.id = $1`,
        [voiceSpeakerId]
      );
      const voice = voiceRes.rows[0];
      if (!voice) return jsonError("音色不存在", 404);

      const filterCompanyId =
        companyId ?? (Number(voice.company_id) || null);

      if (asCsv) {
        const logs = await listVoiceSynthLogs({
          voiceSpeakerId,
          companyId: companyId || undefined,
          page: 1,
          pageSize: EXPORT_ROW_LIMIT,
          forExport: true,
        });
        const name = String(voice.name || voiceSpeakerId).replace(
          /[\\/:*?"<>|]+/g,
          "_"
        );
        return csvFileResponse(
          `音色使用明细-${name}-${exportStamp()}.csv`,
          logsToCsv(logs.items)
        );
      }

      const [stats, logs] = await Promise.all([
        getVoiceSynthStats({
          voiceSpeakerId,
          companyId: companyId || undefined,
        }),
        listVoiceSynthLogs({
          voiceSpeakerId,
          companyId: companyId || undefined,
          page,
          pageSize,
        }),
      ]);

      return jsonOk({
        source: "clone",
        voice: {
          id: Number(voice.id),
          name: voice.name,
          provider_speaker_id: voice.provider_speaker_id,
          status: voice.status,
          company_id: Number(voice.company_id),
          company_name: voice.company_name,
        },
        filter_company_id: filterCompanyId,
        stats,
        ...logs,
      });
    }

    if (source === "official") {
      const officialSpeakerId = String(
        sp.get("official_speaker_id") || sp.get("speaker") || ""
      ).trim();
      if (!officialSpeakerId) return jsonError("缺少 official_speaker_id");
      const def = getOfficialVoiceDef(officialSpeakerId);

      if (asCsv) {
        const logs = await listVoiceSynthLogs({
          officialSpeakerId,
          companyId: companyId || undefined,
          page: 1,
          pageSize: EXPORT_ROW_LIMIT,
          forExport: true,
        });
        const name = String(def?.name || officialSpeakerId).replace(
          /[\\/:*?"<>|]+/g,
          "_"
        );
        return csvFileResponse(
          `音色使用明细-${name}-${exportStamp()}.csv`,
          logsToCsv(logs.items)
        );
      }

      const [stats, logs] = await Promise.all([
        getVoiceSynthStats({
          officialSpeakerId,
          companyId: companyId || undefined,
        }),
        listVoiceSynthLogs({
          officialSpeakerId,
          companyId: companyId || undefined,
          page,
          pageSize,
        }),
      ]);

      return jsonOk({
        source: "official",
        voice: {
          speaker_id: officialSpeakerId,
          name: def?.name || officialSpeakerId,
          gender: def?.gender || null,
        },
        filter_company_id: companyId,
        stats,
        ...logs,
      });
    }

    return jsonError("source 须为 clone 或 official，或传入 company_id 查看公司汇总");
  } catch (err) {
    return handleApiError(err);
  }
}
