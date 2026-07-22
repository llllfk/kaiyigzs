import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { canManageCompanyVoices } from "@/lib/role-access";
import { deleteObject, saveObject } from "@/lib/storage";
import {
  pickAvailableTrainingTimes,
  pickDemoAudios,
  queryVoiceCloneStatus,
  resolveVolcVoiceCredentials,
  synthesizeWithClone,
  uploadVoiceClone,
  volcVoiceCredsValid,
  waitVoiceCloneReady,
} from "@/lib/volc-voice";
import { normalizeVoiceIclModelType, VOICE_SYNTH_TEXT_MAX } from "@/lib/voice-constants";

type Ctx = { params: Promise<{ id: string }> };

async function loadOwned(id: number, companyId: number) {
  const res = await pool.query(
    `SELECT * FROM voice_speakers WHERE id = $1 AND company_id = $2`,
    [id, companyId]
  );
  return res.rows[0] || null;
}

function requireCompanyId(user: Awaited<ReturnType<typeof requireSession>>) {
  if (!user.company_id) throw new AuthError("请先进入公司视图", 403);
  return user.company_id;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const companyId = requireCompanyId(user);
    const id = Number((await params).id);
    if (!id) return jsonError("ID 无效");
    const row = await loadOwned(id, companyId);
    if (!row) return jsonError("音色不存在", 404);
    return jsonOk(row);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const companyId = requireCompanyId(user);
    if (!canManageCompanyVoices(user)) {
      throw new AuthError("仅公司管理员或销售经理可删除复刻音色", 403);
    }
    const id = Number((await params).id);
    if (!id) return jsonError("ID 无效");
    const row = await loadOwned(id, companyId);
    if (!row) return jsonError("音色不存在", 404);

    await pool.query(`DELETE FROM voice_speakers WHERE id = $1`, [id]);
    if (row.sample_uri) {
      try {
        await deleteObject(row.sample_uri);
      } catch {
        /* ignore */
      }
    }
    await writeAuditLog({
      user,
      companyId,
      action: "voice.delete",
      targetType: "voice_speaker",
      targetId: id,
      summary: `删除复刻音色「${row.name}」`,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

/** multipart retrain 或 JSON synthesize */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const companyId = requireCompanyId(user);
    const id = Number((await params).id);
    if (!id) return jsonError("ID 无效");
    const row = await loadOwned(id, companyId);
    if (!row) return jsonError("音色不存在", 404);

    const contentType = request.headers.get("content-type") || "";

    // 下载审计不依赖火山凭证
    if (contentType.includes("application/json")) {
      const peek = await request.clone().json().catch(() => ({}));
      if (String(peek.action || "") === "log_download") {
        const text = String(peek.text || "").trim();
        const modelType = normalizeVoiceIclModelType(peek.model_type);
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
            text ? `文案：${text}` : "文案：（未回传）",
            "已下载：是",
          ].join("\n"),
        });
        return jsonOk({ ok: true });
      }
    }

    const creds = await resolveVolcVoiceCredentials();
    if (!volcVoiceCredsValid(creds) || !creds) {
      return jsonError("未配置声音复刻凭证", 400);
    }

    if (contentType.includes("multipart/form-data")) {
      if (!canManageCompanyVoices(user)) {
        throw new AuthError("仅公司管理员或销售经理可训练复刻音色", 403);
      }
      const form = await request.formData();
      const action = String(form.get("action") || "retrain");
      if (action !== "retrain") return jsonError("不支持的操作");
      const file = form.get("file");
      if (!(file instanceof File)) return jsonError("请上传样音文件");
      if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
        return jsonError("样音大小需在 10MB 以内");
      }
      const speakerId = String(row.provider_speaker_id || "").trim();
      if (!speakerId) return jsonError("缺少 Speaker ID，无法训练");
      const metaPre =
        row.meta && typeof row.meta === "object"
          ? (row.meta as Record<string, unknown>)
          : {};
      const remainPre = Number(metaPre.available_training_times);
      if (Number.isFinite(remainPre) && remainPre <= 0) {
        return jsonError("该音色剩余训练次数为 0，请联系平台换新 Speaker ID", 400);
      }

      const buf = Buffer.from(await file.arrayBuffer());
      const saved = await saveObject({
        companyId,
        folder: "voice",
        fileName: file.name || "sample.mp3",
        contentType: file.type || "audio/mpeg",
        body: buf,
      });
      if (row.sample_uri) {
        try {
          await deleteObject(row.sample_uri);
        } catch {
          /* ignore */
        }
      }

      await pool.query(
        `UPDATE voice_speakers SET
           sample_uri=$1, sample_mime=$2, sample_file_name=$3, sample_size_bytes=$4,
           status='training', error_message=NULL, updated_at=CURRENT_TIMESTAMP
         WHERE id=$5`,
        [saved.uri, file.type || null, file.name || null, saved.size, id]
      );

      try {
        await uploadVoiceClone({
          creds,
          speakerId,
          audio: buf,
          fileName: file.name,
          mime: file.type,
        });
        const ready = await waitVoiceCloneReady({ creds, speakerId });
        const wasRetrain = row.status === "ready" || Boolean(row.sample_uri);
        const prevMeta =
          row.meta && typeof row.meta === "object"
            ? (row.meta as Record<string, unknown>)
            : {};
        const fromVolc = pickAvailableTrainingTimes(ready.raw);
        const prevTimes = Number(prevMeta.available_training_times);
        const nextMeta = {
          ...prevMeta,
          available_training_times:
            fromVolc != null
              ? fromVolc
              : Number.isFinite(prevTimes) && prevTimes > 0
                ? Math.max(0, prevTimes - 1)
                : prevMeta.available_training_times,
          volc_state: ready.status,
        };
        const updated = await pool.query(
          `UPDATE voice_speakers
           SET status='ready', error_message=NULL, meta=$2::jsonb,
               updated_at=CURRENT_TIMESTAMP
           WHERE id=$1 RETURNING *`,
          [id, JSON.stringify(nextMeta)]
        );
        await writeAuditLog({
          user,
          companyId,
          action: "voice.train",
          targetType: "voice_speaker",
          targetId: id,
          summary: `${wasRetrain ? "重新训练" : "训练"}复刻音色「${row.name}」`,
        });
        return jsonOk({
          id: updated.rows[0].id,
          name: updated.rows[0].name,
          status: updated.rows[0].status,
          available_training_times: nextMeta.available_training_times ?? null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "训练失败";
        await pool.query(
          `UPDATE voice_speakers SET status='failed', error_message=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
          [msg.slice(0, 500), id]
        );
        return jsonError(msg, 502);
      }
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "synthesize");

    /** 试听：不依赖本系统是否上传过；有 Speaker ID 即查火山。
     *  控制台已训练的音色可直接试听，并同步本地状态为 ready。 */
    if (action === "preview") {
      const speakerId = String(row.provider_speaker_id || "").trim();
      if (!speakerId) return jsonError("缺少 Speaker ID");

      const { status, raw } = await queryVoiceCloneStatus({
        creds,
        speakerId,
      });

      const times = pickAvailableTrainingTimes(raw);
      const prevMeta =
        row.meta && typeof row.meta === "object"
          ? (row.meta as Record<string, unknown>)
          : {};
      const nextMeta = {
        ...prevMeta,
        ...(times != null ? { available_training_times: times } : {}),
        volc_state: status,
        volc_synced_at: new Date().toISOString(),
      };

      if (status === "success" || status === "active") {
        // 火山侧已可用：同步本系统为 ready（含控制台先训练、系统后分配的情况）
        await pool.query(
          `UPDATE voice_speakers
           SET status='ready', error_message=NULL, meta=$1::jsonb,
               updated_at=CURRENT_TIMESTAMP
           WHERE id=$2`,
          [JSON.stringify(nextMeta), id]
        );
      } else {
        await pool.query(
          `UPDATE voice_speakers
           SET meta=$1::jsonb, updated_at=CURRENT_TIMESTAMP
           WHERE id=$2`,
          [JSON.stringify(nextMeta), id]
        );
        return jsonError(
          status === "training"
            ? "火山侧音色仍在训练中，请稍后再试"
            : status === "failed"
              ? "火山侧训练失败，请在本系统重新上传样音训练"
              : status === "unknown"
                ? "火山侧尚未找到该音色或未完成训练，请先在本系统上传样音训练"
                : "火山侧音色暂不可用，请先上传样音完成训练",
          400
        );
      }

      const demos = pickDemoAudios(raw);
      if (demos.length) {
        return jsonOk({
          id: row.id,
          name: row.name,
          speaker_id: speakerId,
          status: "ready",
          available_training_times: times,
          source: "demo",
          demos: demos.map((d) => ({
            model_type: d.modelType,
            label: d.label,
            demo_audio: d.demoAudio,
          })),
        });
      }

      // demo 过期/缺失：短文本合成试听
      const previewText =
        String(body.text || "").trim() ||
        "您好，这是当前音色的试听效果。";
      const { audio } = await synthesizeWithClone({
        creds,
        speakerId,
        text: previewText.slice(0, 80),
        voiceSource: "clone",
        uid: `crm-preview-${companyId}-${user.id}`,
        format: "mp3",
      });

      return jsonOk({
        id: row.id,
        name: row.name,
        speaker_id: speakerId,
        status: "ready",
        available_training_times: times,
        source: "synthesize",
        demos: [
          {
            model_type: null,
            label: "合成试听",
            demo_audio: `data:audio/mpeg;base64,${audio.toString("base64")}`,
          },
        ],
      });
    }

    if (action !== "synthesize") return jsonError("不支持的操作");
    if (row.status !== "ready") {
      return jsonError("音色未就绪，无法合成");
    }
    const speakerId = String(row.provider_speaker_id || "").trim();
    if (!speakerId) return jsonError("缺少 Speaker ID");
    const text = String(body.text || "").trim();
    if (!text) return jsonError("请填写合成文案");
    if (text.length > VOICE_SYNTH_TEXT_MAX) {
      return jsonError(`合成文案不能超过 ${VOICE_SYNTH_TEXT_MAX} 字`);
    }
    const contextText = String(body.context_text || "").trim();
    const speechRate = Number(body.speech_rate);
    const loudnessRate = Number(body.loudness_rate);
    const modelType = normalizeVoiceIclModelType(body.model_type);

    const { audio } = await synthesizeWithClone({
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
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
