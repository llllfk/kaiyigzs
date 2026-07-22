import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import {
  resolveVolcVoiceCredentials,
  synthesizeWithClone,
  volcVoiceCredsValid,
} from "@/lib/volc-voice";
import { normalizeVoiceIclModelType, VOICE_SYNTH_TEXT_MAX } from "@/lib/voice-constants";
import {
  assertOfficialSpeakerEnabled,
  loadEnabledOfficialVoiceIds,
  OFFICIAL_TTS_RESOURCE_ID,
} from "@/lib/volc-official-voices";
import {
  assertCompanySynthMinutesAvailable,
  insertVoiceSynthLog,
  markVoiceSynthLogSaved,
  updateVoiceSynthLogDuration,
} from "@/lib/voice-synth-logs";

function requireCompanyId(user: Awaited<ReturnType<typeof requireSession>>) {
  if (!user.company_id) throw new AuthError("请先进入公司视图", 403);
  return user.company_id;
}

/**
 * 统一语音合成入口
 * body.source: "clone" | "official"
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    const companyId = requireCompanyId(user);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "synthesize");
    const source = String(body.source || "clone").trim() as "clone" | "official";

    if (action === "log_download") {
      const logId = Number(body.synth_log_id || body.log_id) || null;
      const durationSec = Number(body.duration_sec);
      const duration =
        Number.isFinite(durationSec) && durationSec > 0 ? durationSec : null;

      if (source === "official") {
        const speaker = String(body.speaker || "").trim();
        const defName = String(body.speaker_name || speaker || "官方音色");
        await markVoiceSynthLogSaved({
          logId,
          companyId,
          userId: user.id,
          source: "official",
          officialSpeakerId: speaker,
          durationSec: duration,
        });
        await writeAuditLog({
          user,
          companyId,
          action: "voice.synthesize_download",
          targetType: "official_voice",
          targetId: null,
          summary: [
            `下载合成音频「${defName}」`,
            `来源=官方`,
            speaker ? `speaker=${speaker}` : null,
            body.text ? `文案：${String(body.text).trim()}` : "文案：（未回传）",
            "已下载：是",
          ]
            .filter(Boolean)
            .join("\n"),
        });
        return jsonOk({ ok: true });
      }

      const id = Number(body.speaker_id || body.id);
      if (!id) return jsonError("缺少复刻音色 ID");
      const rowRes = await pool.query(
        `SELECT id, name FROM voice_speakers WHERE id = $1 AND company_id = $2`,
        [id, companyId]
      );
      const row = rowRes.rows[0];
      if (!row) return jsonError("音色不存在", 404);
      const modelType = normalizeVoiceIclModelType(body.model_type);
      await markVoiceSynthLogSaved({
        logId,
        companyId,
        userId: user.id,
        source: "clone",
        voiceSpeakerId: id,
        durationSec: duration,
      });
      await writeAuditLog({
        user,
        companyId,
        action: "voice.synthesize_download",
        targetType: "voice_speaker",
        targetId: id,
        summary: [
          `下载合成音频「${row.name}」`,
          `来源=复刻`,
          `ICL=${modelType}`,
          body.text ? `文案：${String(body.text).trim()}` : "文案：（未回传）",
          "已下载：是",
        ].join("\n"),
      });
      return jsonOk({ ok: true });
    }

    if (action === "report_duration") {
      const logId = Number(body.synth_log_id || body.log_id);
      const durationSec = Number(body.duration_sec);
      if (!logId) return jsonError("缺少合成记录 ID");
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        return jsonError("时长无效");
      }
      const ok = await updateVoiceSynthLogDuration({
        logId,
        companyId,
        userId: user.id,
        durationSec,
      });
      return jsonOk({ ok });
    }

    /** 官方音色短试听（仅已启用）— 不记入正式使用明细 */
    if (action === "preview") {
      if (source !== "official") {
        return jsonError("试听请指定 source=official");
      }
      const speaker = String(body.speaker || "").trim();
      if (!speaker) return jsonError("请选择官方音色");
      const enabled = await loadEnabledOfficialVoiceIds();
      let def;
      try {
        def = assertOfficialSpeakerEnabled(speaker, enabled);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : "官方音色不可用", 400);
      }

      const creds = await resolveVolcVoiceCredentials();
      if (!volcVoiceCredsValid(creds) || !creds) {
        return jsonError("未配置声音复刻凭证", 400);
      }

      const previewText =
        String(body.text || "").trim() ||
        `您好，我是${def.name}，这是官方音色试听效果。`;

      const { audio } = await synthesizeWithClone({
        creds,
        speakerId: def.speakerId,
        text: previewText.slice(0, 80),
        resourceId: OFFICIAL_TTS_RESOURCE_ID,
        voiceSource: "official",
        uid: `crm-official-preview-${companyId}-${user.id}`,
        format: "mp3",
      });

      return jsonOk({
        speaker_id: def.speakerId,
        name: def.name,
        demo_audio: `data:audio/mpeg;base64,${audio.toString("base64")}`,
      });
    }

    if (action !== "synthesize") return jsonError("不支持的操作");
    if (source !== "clone" && source !== "official") {
      return jsonError("source 须为 clone 或 official");
    }

    try {
      await assertCompanySynthMinutesAvailable(companyId);
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "合成分钟不足", 403);
    }

    const text = String(body.text || "").trim();
    if (!text) return jsonError("请填写合成文案");
    if (text.length > VOICE_SYNTH_TEXT_MAX) {
      return jsonError(`合成文案不能超过 ${VOICE_SYNTH_TEXT_MAX} 字`);
    }
    const contextText = String(body.context_text || "").trim();
    const speechRate = Number(body.speech_rate);
    const loudnessRate = Number(body.loudness_rate);

    const creds = await resolveVolcVoiceCredentials();
    if (!volcVoiceCredsValid(creds) || !creds) {
      return jsonError("未配置声音复刻凭证", 400);
    }

    if (source === "official") {
      const speaker = String(body.speaker || "").trim();
      if (!speaker) return jsonError("请选择官方音色");
      const enabled = await loadEnabledOfficialVoiceIds();
      let def;
      try {
        def = assertOfficialSpeakerEnabled(speaker, enabled);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : "官方音色不可用", 400);
      }

      try {
        const { audio, appliedContext } = await synthesizeWithClone({
          creds,
          speakerId: def.speakerId,
          text,
          contextText: contextText || undefined,
          speechRate: Number.isFinite(speechRate) ? speechRate : 0,
          loudnessRate: Number.isFinite(loudnessRate) ? loudnessRate : 0,
          resourceId: OFFICIAL_TTS_RESOURCE_ID,
          voiceSource: "official",
          uid: `crm-official-${companyId}-${user.id}`,
          format: "mp3",
        });

        if (contextText && !appliedContext) {
          return jsonError("语气提示未能下发，请重试", 500);
        }

        const logId = await insertVoiceSynthLog({
          companyId,
          userId: user.id,
          source: "official",
          officialSpeakerId: def.speakerId,
          speakerLabel: def.name,
          status: "success",
          textContent: text,
          contextText: contextText || null,
          audioBytes: audio.length,
        });

        await writeAuditLog({
          user,
          companyId,
          action: "voice.synthesize",
          targetType: "official_voice",
          targetId: null,
          summary: [
            `合成语音「${def.name}」`,
            `来源=官方`,
            `speaker=${def.speakerId}`,
            `语速=${Number.isFinite(speechRate) ? speechRate : 0}`,
            `音量=${Number.isFinite(loudnessRate) ? loudnessRate : 0}`,
            contextText ? `语气：${contextText}` : null,
            appliedContext ? `已下发指令：${appliedContext}` : "已下发指令：（无）",
            `文案：${text}`,
          ]
            .filter(Boolean)
            .join("\n"),
        });

        return new Response(new Uint8Array(audio), {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Disposition": `attachment; filename="tts-official-${def.speakerId}.mp3"`,
            "Cache-Control": "no-store",
            "Access-Control-Expose-Headers":
              "X-Voice-Synth-Log-Id, X-Voice-Context-Applied",
            ...(logId ? { "X-Voice-Synth-Log-Id": String(logId) } : {}),
            "X-Voice-Context-Applied": encodeURIComponent(appliedContext || ""),
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "合成失败";
        await insertVoiceSynthLog({
          companyId,
          userId: user.id,
          source: "official",
          officialSpeakerId: def.speakerId,
          speakerLabel: def.name,
          status: "failed",
          errorMessage: msg,
          textContent: text,
          contextText: contextText || null,
        });
        throw e;
      }
    }

    // clone
    const id = Number(body.speaker_id || body.id);
    if (!id) return jsonError("请选择复刻音色");
    const rowRes = await pool.query(
      `SELECT * FROM voice_speakers WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );
    const row = rowRes.rows[0];
    if (!row) return jsonError("音色不存在", 404);
    if (row.status !== "ready") return jsonError("音色未就绪，无法合成");
    const speakerId = String(row.provider_speaker_id || "").trim();
    if (!speakerId) return jsonError("缺少 Speaker ID");
    const modelType = normalizeVoiceIclModelType(body.model_type);

    try {
      const { audio, appliedContext } = await synthesizeWithClone({
        creds,
        speakerId,
        text,
        contextText: contextText || undefined,
        speechRate: Number.isFinite(speechRate) ? speechRate : 0,
        loudnessRate: Number.isFinite(loudnessRate) ? loudnessRate : 0,
        modelType,
        voiceSource: "clone",
        uid: `crm-${companyId}-${user.id}`,
        format: "mp3",
      });

      if (contextText && !appliedContext) {
        return jsonError("语气提示未能下发，请重试", 500);
      }

      const logId = await insertVoiceSynthLog({
        companyId,
        userId: user.id,
        source: "clone",
        voiceSpeakerId: id,
        speakerLabel: String(row.name || ""),
        iclModelType: modelType,
        status: "success",
        textContent: text,
        contextText: contextText || null,
        audioBytes: audio.length,
      });

      await writeAuditLog({
        user,
        companyId,
        action: "voice.synthesize",
        targetType: "voice_speaker",
        targetId: id,
        summary: [
          `合成语音「${row.name}」`,
          `来源=复刻`,
          `ICL=${modelType}`,
          `语速=${Number.isFinite(speechRate) ? speechRate : 0}`,
          `音量=${Number.isFinite(loudnessRate) ? loudnessRate : 0}`,
          contextText ? `语气：${contextText}` : null,
          appliedContext ? `已下发指令：${appliedContext}` : "已下发指令：（无）",
          `文案：${text}`,
        ]
          .filter(Boolean)
          .join("\n"),
      });

      return new Response(new Uint8Array(audio), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Disposition": `attachment; filename="tts-${id}.mp3"`,
          "Cache-Control": "no-store",
          "Access-Control-Expose-Headers":
            "X-Voice-Synth-Log-Id, X-Voice-Context-Applied",
          ...(logId ? { "X-Voice-Synth-Log-Id": String(logId) } : {}),
          "X-Voice-Context-Applied": encodeURIComponent(appliedContext || ""),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "合成失败";
      await insertVoiceSynthLog({
        companyId,
        userId: user.id,
        source: "clone",
        voiceSpeakerId: id,
        speakerLabel: String(row.name || ""),
        iclModelType: modelType,
        status: "failed",
        errorMessage: msg,
        textContent: text,
        contextText: contextText || null,
      });
      throw e;
    }
  } catch (err) {
    return handleApiError(err);
  }
}
