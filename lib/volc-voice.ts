/**
 * 火山引擎 / 豆包：声音复刻 V3 + 语音合成（克隆音色）
 * 训练：POST /api/v3/tts/voice_clone
 * 状态：POST /api/v3/tts/get_voice
 * 合成：POST /api/v3/tts/unidirectional（X-Api-Resource-Id: seed-icl-2.0）
 *
 * 鉴权优先新版控制台 X-Api-Key；旧版为 X-Api-App-Key + X-Api-Access-Key。
 */

import { randomUUID } from "crypto";
import { ensurePlatformEnvLoaded } from "@/lib/runtime-env";
import {
  normalizeVoiceIclModelType,
  resourceIdForIclModelType,
  type VoiceIclModelType,
  VOICE_SYNTH_TEXT_MAX,
  VOICE_TRAINING_TIMES_LIMIT,
} from "@/lib/voice-constants";

export {
  VOICE_TRAINING_TIMES_LIMIT,
  VOICE_SYNTH_TEXT_MAX,
  VOICE_ICL_OPTIONS,
  DEFAULT_VOICE_ICL_MODEL_TYPE,
  normalizeVoiceIclModelType,
  resourceIdForIclModelType,
  type VoiceIclModelType,
} from "@/lib/voice-constants";

const CLONE_URL =
  "https://openspeech.bytedance.com/api/v3/tts/voice_clone";
const GET_VOICE_URL =
  "https://openspeech.bytedance.com/api/v3/tts/get_voice";
const TTS_URL =
  "https://openspeech.bytedance.com/api/v3/tts/unidirectional";

export type VolcVoiceCredentials = {
  apiKey: string;
  /** 旧版可选；新版 API Key 模式可不填 */
  appId: string;
  accessToken: string;
  source: "env";
};

export type CloneStatusCode =
  | "unknown"
  | "training"
  | "success"
  | "failed"
  | "active"
  | "other";

function envVoice(): VolcVoiceCredentials | null {
  const apiKey =
    process.env.VOLC_VOICE_API_KEY?.trim() ||
    process.env.VOLC_ASR_API_KEY?.trim() ||
    process.env.DOUBAO_API_KEY?.trim() ||
    "";
  const appId =
    process.env.VOLC_VOICE_APP_ID?.trim() ||
    process.env.VOLC_ASR_APP_ID?.trim() ||
    process.env.VOLC_ASR_APP_KEY?.trim() ||
    "";
  const accessToken =
    process.env.VOLC_VOICE_ACCESS_TOKEN?.trim() ||
    process.env.VOLC_ASR_ACCESS_TOKEN?.trim() ||
    process.env.VOLC_ASR_ACCESS_KEY?.trim() ||
    "";
  // 新版：仅 API Key；旧版：AppID + Access Token
  if (apiKey) return { apiKey, appId, accessToken, source: "env" };
  if (appId && accessToken) {
    return { apiKey: "", appId, accessToken, source: "env" };
  }
  return null;
}

export function volcVoiceCredsValid(
  c: VolcVoiceCredentials | null | undefined
) {
  if (!c) return false;
  if (c.apiKey) return true;
  return Boolean(c.appId && c.accessToken);
}

export async function resolveVolcVoiceCredentials(): Promise<VolcVoiceCredentials | null> {
  await ensurePlatformEnvLoaded();
  return envVoice();
}

/** 训练 / 查询：新控制台 X-Api-Key；旧控制台 App-Key + Access-Key */
function voiceCloneAuthHeaders(
  creds: VolcVoiceCredentials
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Request-Id": randomUUID(),
  };
  if (creds.apiKey) {
    headers["X-Api-Key"] = creds.apiKey;
    return headers;
  }
  if (creds.appId) headers["X-Api-App-Key"] = creds.appId;
  if (creds.accessToken) headers["X-Api-Access-Key"] = creds.accessToken;
  return headers;
}

function ttsAuthHeaders(
  creds: VolcVoiceCredentials,
  resourceId: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Resource-Id": resourceId,
    "X-Api-Request-Id": randomUUID(),
  };
  if (creds.apiKey) {
    headers["X-Api-Key"] = creds.apiKey;
    return headers;
  }
  if (creds.appId) headers["X-Api-App-Key"] = creds.appId;
  if (creds.accessToken) headers["X-Api-Access-Key"] = creds.accessToken;
  return headers;
}

function detectAudioFormat(fileName?: string | null, mime?: string | null) {
  const name = (fileName || "").toLowerCase();
  const m = (mime || "").toLowerCase();
  const ext = name.match(/\.([a-z0-9]+)$/)?.[1];
  const map: Record<string, string> = {
    mp3: "mp3",
    wav: "wav",
    m4a: "m4a",
    aac: "aac",
    ogg: "ogg",
    pcm: "pcm",
  };
  if (ext && map[ext]) return map[ext];
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("ogg")) return "ogg";
  return "mp3";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function mapStatus(code: number | undefined): CloneStatusCode {
  // 0 NotFound, 1 Training, 2 Success, 3 Failed, 4 Active
  if (code === 0) return "unknown";
  if (code === 1) return "training";
  if (code === 2) return "success";
  if (code === 3) return "failed";
  if (code === 4) return "active";
  return "other";
}

function pickSpeakerIdFromVolc(raw: Record<string, unknown>, fallback: string) {
  const sid =
    raw.speaker_id ||
    raw.SpeakerID ||
    raw.SpeakerId ||
    (raw.data as { speaker_id?: string } | undefined)?.speaker_id;
  return {
    speakerId: String(sid || fallback),
  };
}

/** 从 V3 get_voice / voice_clone 响应解析剩余训练次数 */
export function pickAvailableTrainingTimes(
  raw: Record<string, unknown> | null | undefined
): number | null {
  if (!raw || typeof raw !== "object") return null;
  const nested =
    raw.data && typeof raw.data === "object"
      ? (raw.data as Record<string, unknown>)
      : null;
  const candidates = [
    raw.available_training_times,
    raw.AvailableTrainingTimes,
    nested?.available_training_times,
    nested?.AvailableTrainingTimes,
  ];
  for (const v of candidates) {
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

export type VoiceDemoClip = {
  modelType: number | null;
  label: string;
  demoAudio: string;
};

const MODEL_TYPE_LABELS: Record<number, string> = {
  1: "声音复刻 ICL 1.0",
  2: "DiT 标准版",
  3: "DiT 还原版",
  4: "声音复刻 ICL 2.0",
  5: "声音复刻 ICL 3.0",
};

/** 解析试听音频（Success 时返回，约 1 小时有效）；保留各 model 供切换，默认优先 ICL 3.0 */
export function pickDemoAudios(
  raw: Record<string, unknown> | null | undefined
): VoiceDemoClip[] {
  if (!raw || typeof raw !== "object") return [];
  const list = Array.isArray(raw.speaker_status)
    ? raw.speaker_status
    : Array.isArray((raw.data as { speaker_status?: unknown } | undefined)?.speaker_status)
      ? ((raw.data as { speaker_status: unknown[] }).speaker_status)
      : [];
  const clips: VoiceDemoClip[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = String(row.demo_audio || row.DemoAudio || "").trim();
    if (!url) continue;
    const modelTypeRaw = Number(row.model_type ?? row.ModelType);
    const modelType = Number.isFinite(modelTypeRaw) ? modelTypeRaw : null;
    // 试听与合成一致：仅展示 ICL 1.0 / 3.0
    if (modelType !== 1 && modelType !== 5) continue;
    clips.push({
      modelType,
      label:
        modelType != null && MODEL_TYPE_LABELS[modelType]
          ? MODEL_TYPE_LABELS[modelType]
          : modelType != null
            ? `模型 ${modelType}`
            : "试听",
      demoAudio: url,
    });
  }
  // 展示顺序：ICL 1.0 → 3.0
  clips.sort((a, b) => {
    const rank = (t: number | null) => (t === 1 ? 0 : t === 5 ? 1 : 9);
    return rank(a.modelType) - rank(b.modelType);
  });
  return clips;
}

function assertVolcOk(
  res: Response,
  json: Record<string, unknown>,
  fallback: string
) {
  const code = Number(json.code);
  if (!res.ok || (Number.isFinite(code) && code !== 0 && code !== 20000000)) {
    const msg =
      (json.message as string) ||
      (json.error as string) ||
      `${fallback} HTTP ${res.status}${Number.isFinite(code) ? ` code=${code}` : ""}`;
    throw new Error(msg);
  }
}

/**
 * 仅用豆包 API Key：上传样音 → 查询状态 → 落库火山返回的 Speaker ID
 * （预付费：请求里带控制台下发的 speaker_id）
 */
export async function cloneVoiceFromSample(params: {
  creds: VolcVoiceCredentials;
  audio: Buffer;
  fileName?: string | null;
  mime?: string | null;
  text?: string;
  /** 预付费槽位 ID；不传则用临时句柄（不推荐，预付费须控制台 ID） */
  speakerId?: string;
}): Promise<{
  speakerId: string;
  status: CloneStatusCode;
  raw: Record<string, unknown>;
}> {
  const requestSpeakerId =
    params.speakerId?.trim() ||
    `S_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const uploadRaw = await uploadVoiceClone({
    creds: params.creds,
    speakerId: requestSpeakerId,
    audio: params.audio,
    fileName: params.fileName,
    mime: params.mime,
    text: params.text,
  });
  const fromUpload = pickSpeakerIdFromVolc(uploadRaw, requestSpeakerId);
  const queryId = fromUpload.speakerId || requestSpeakerId;

  const { status, raw } = await waitVoiceCloneReady({
    creds: params.creds,
    speakerId: queryId,
  });
  const fromStatus = pickSpeakerIdFromVolc(raw, queryId);
  return {
    speakerId: fromStatus.speakerId,
    status,
    raw,
  };
}

export async function uploadVoiceClone(params: {
  creds: VolcVoiceCredentials;
  speakerId: string;
  audio: Buffer;
  fileName?: string | null;
  mime?: string | null;
  /** 可选：与录音对照的文本（WER 检测） */
  text?: string;
  language?: number;
  /** 后付费自定义音色代号；传入时 speaker_id 固定为 custom_speaker_id */
  customSpeakerId?: string;
  extraParams?: Record<string, unknown>;
}) {
  const audioFormat = detectAudioFormat(params.fileName, params.mime);
  const customId = params.customSpeakerId?.trim();
  const body: Record<string, unknown> = {
    speaker_id: customId ? "custom_speaker_id" : params.speakerId,
    ...(customId ? { custom_speaker_id: customId } : {}),
    audio: {
      data: params.audio.toString("base64"),
      format: audioFormat,
    },
    language: params.language ?? 0,
    extra_params: {
      // 复刻 2.0 默认不降噪；噪声大时可在调用方覆盖
      enable_audio_denoise: false,
      ...(params.extraParams || {}),
    },
  };
  if (params.text?.trim()) body.text = params.text.trim();

  const res = await fetch(CLONE_URL, {
    method: "POST",
    headers: voiceCloneAuthHeaders(params.creds),
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  assertVolcOk(res, json, "声音复刻训练失败");
  return json;
}

export async function queryVoiceCloneStatus(params: {
  creds: VolcVoiceCredentials;
  speakerId: string;
  customSpeakerId?: string;
}): Promise<{ status: CloneStatusCode; raw: Record<string, unknown> }> {
  const customId = params.customSpeakerId?.trim();
  const statusBody: Record<string, unknown> = customId
    ? {
        speaker_id: "custom_speaker_id",
        custom_speaker_id: customId,
      }
    : { speaker_id: params.speakerId };

  const res = await fetch(GET_VOICE_URL, {
    method: "POST",
    headers: voiceCloneAuthHeaders(params.creds),
    body: JSON.stringify(statusBody),
  });
  const json = (await res.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  assertVolcOk(res, json, "查询复刻状态失败");
  const statusNum = Number(json.status);
  return {
    status: mapStatus(Number.isFinite(statusNum) ? statusNum : undefined),
    raw: json,
  };
}

export async function waitVoiceCloneReady(params: {
  creds: VolcVoiceCredentials;
  speakerId: string;
  customSpeakerId?: string;
  timeoutMs?: number;
}): Promise<{ status: CloneStatusCode; raw: Record<string, unknown> }> {
  const timeout = params.timeoutMs ?? 120_000;
  const started = Date.now();
  let last: CloneStatusCode = "training";
  let lastRaw: Record<string, unknown> = {};
  while (Date.now() - started < timeout) {
    const { status, raw } = await queryVoiceCloneStatus(params);
    last = status;
    lastRaw = raw;
    if (status === "success" || status === "active") {
      return { status, raw };
    }
    if (status === "failed") throw new Error("声音复刻训练失败");
    await sleep(1500);
  }
  throw new Error(`声音复刻超时（最后状态：${last}）`);
}

/** 单向流式 TTS，拼接 base64 音频块为 Buffer */
export async function synthesizeWithClone(params: {
  creds: VolcVoiceCredentials;
  speakerId: string;
  text: string;
  format?: "mp3" | "wav" | "pcm";
  contextText?: string;
  uid?: string;
  /** 语速偏移 -50~100，0 为默认 */
  speechRate?: number;
  /** 音量偏移 -50~100，0 为默认 */
  loudnessRate?: number;
  /** ICL 版本：1 / 4 / 5，默认 5；官方音色可忽略 */
  modelType?: VoiceIclModelType | number;
  /**
   * 覆盖 Resource-Id。官方音色传 seed-tts-2.0；
   * 复刻不传则按 modelType 映射 seed-icl-*。
   */
  resourceId?: string;
  /**
   * 音色来源。显式传入可避免仅靠 resourceId 推断；
   * 有语气提示时：复刻强制表现力通道，官方走 seed-tts-2.0 + context_texts。
   */
  voiceSource?: "clone" | "official";
}): Promise<{ audio: Buffer; appliedContext: string | null }> {
  const text = params.text.trim();
  if (!text) throw new Error("合成文本不能为空");
  if (text.length > VOICE_SYNTH_TEXT_MAX) {
    throw new Error(`单次合成不超过 ${VOICE_SYNTH_TEXT_MAX} 字`);
  }

  const clampRate = (v: number | undefined) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(-50, Math.min(100, Math.round(n)));
  };

  const userContext = params.contextText?.trim() || "";
  const voiceSource: "clone" | "official" =
    params.voiceSource ||
    (String(params.resourceId || "").startsWith("seed-tts")
      ? "official"
      : "clone");

  const modelType = normalizeVoiceIclModelType(params.modelType);
  let resourceId =
    String(params.resourceId || "").trim() ||
    (voiceSource === "official"
      ? "seed-tts-2.0"
      : resourceIdForIclModelType(modelType));

  /**
   * 语气指令格式（火山文档）：
   * - 官方 TTS 2.0：对话式 QA，如「你可以用特别特别痛心的语气说话吗?」
   * - 复刻 2.0 表现力：演绎式，如「用最悲伤的语气演绎下面这句话：」
   */
  const buildAppliedContext = (raw: string, source: "clone" | "official") => {
    const looksComplete =
      raw.includes("演绎") ||
      raw.includes("说话") ||
      /[吗？?]$/.test(raw) ||
      raw.startsWith("用") ||
      raw.startsWith("你");
    if (looksComplete) return raw;
    return source === "official"
      ? `你可以用${raw}的语气说话吗?`
      : `用${raw}的语气演绎下面这句话：`;
  };

  const additions: Record<string, unknown> = {};
  let appliedContext: string | null = null;
  let synthModelType: number = modelType;

  if (voiceSource === "official") {
    resourceId = String(params.resourceId || "").trim() || "seed-tts-2.0";
    if (userContext) {
      appliedContext = buildAppliedContext(userContext, "official");
      additions.context_texts = [appliedContext];
    }
  } else {
    // 复刻：有语气 → 强制 ICL2 表现力通道，否则指令会被静默丢弃
    if (userContext) {
      resourceId = "seed-icl-2.0";
      synthModelType = 4;
      appliedContext = buildAppliedContext(userContext, "clone");
      additions.model_type = synthModelType;
      additions.context_texts = [appliedContext];
    } else {
      additions.model_type = synthModelType;
    }
  }

  const body = {
    user: { uid: params.uid || "crm" },
    req_params: {
      text,
      speaker: params.speakerId,
      // 仅复刻 + 语气：开启表现力版（官方 TTS 不走此字段）
      ...(voiceSource === "clone" && userContext
        ? { model: "seed-tts-2.0-expressive" }
        : {}),
      audio_params: {
        format: params.format || "mp3",
        sample_rate: 24000,
        bit_rate: 160000,
        speech_rate: clampRate(params.speechRate),
        loudness_rate: clampRate(params.loudnessRate),
      },
      ...(Object.keys(additions).length
        ? { additions: JSON.stringify(additions) }
        : {}),
    },
  };

  const res = await fetch(TTS_URL, {
    method: "POST",
    headers: ttsAuthHeaders(params.creds, resourceId),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`语音合成失败 HTTP ${res.status}${errText ? `：${errText.slice(0, 200)}` : ""}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json") || contentType.includes("ndjson") || contentType.includes("octet-stream") || contentType.includes("text/")) {
    const raw = await res.text();
    const chunks: Buffer[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(t) as Record<string, unknown>;
      } catch {
        continue;
      }
      const code = Number(obj.code ?? obj.status_code ?? 0);
      if (code && code !== 0 && code !== 20000000) {
        throw new Error(
          String(obj.message || obj.msg || `合成错误 code=${code}`)
        );
      }
      const data = obj.data as Record<string, unknown> | string | undefined;
      const audioB64 =
        (typeof data === "string" ? data : null) ||
        (typeof data === "object" && data
          ? String(data.audio || data.data || "")
          : "") ||
        String(obj.audio || "");
      if (audioB64 && audioB64.length > 8) {
        chunks.push(Buffer.from(audioB64, "base64"));
      }
    }
    if (!chunks.length) {
      try {
        const one = JSON.parse(raw) as Record<string, unknown>;
        const audio = String(
          (one.data as { audio?: string } | undefined)?.audio ||
            one.audio ||
            ""
        );
        if (audio) {
          return { audio: Buffer.from(audio, "base64"), appliedContext };
        }
      } catch {
        /* ignore */
      }
      throw new Error("语音合成未返回音频数据");
    }
    return { audio: Buffer.concat(chunks), appliedContext };
  }

  const ab = await res.arrayBuffer();
  if (!ab.byteLength) throw new Error("语音合成未返回音频数据");
  return { audio: Buffer.from(ab), appliedContext };
}
