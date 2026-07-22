/**
 * 火山引擎 / 豆包语音：录音文件识别大模型（直连，无需扣子工作流）
 * 文档：openspeech.bytedance.com /api/v3/auc/bigmodel/{submit,query}
 * 支持 audio.data(base64) 或 audio.url(https)
 *
 * 鉴权优先读公司 config.volc_asr，未配置时回退全局 env。
 */

import { randomUUID } from "crypto";
import pool from "@/lib/db";

const SUBMIT_URL =
  "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit";
const QUERY_URL =
  "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query";

/** 约 15MB 原始音频走 base64；更大则优先用公网 url（若有） */
const BASE64_MAX_BYTES = 15 * 1024 * 1024;

export type VolcAsrCredentials = {
  apiKey: string;
  appId: string;
  accessToken: string;
  resourceId: string;
  source: "company" | "env";
};

function defaultResourceId() {
  return process.env.VOLC_ASR_RESOURCE_ID?.trim() || "volc.seedasr.auc";
}

function envVolcAsr(): VolcAsrCredentials | null {
  const apiKey =
    process.env.VOLC_ASR_API_KEY?.trim() ||
    process.env.DOUBAO_API_KEY?.trim() ||
    "";
  const appId =
    process.env.VOLC_ASR_APP_ID?.trim() ||
    process.env.VOLC_ASR_APP_KEY?.trim() ||
    "";
  const accessToken =
    process.env.VOLC_ASR_ACCESS_TOKEN?.trim() ||
    process.env.VOLC_ASR_ACCESS_KEY?.trim() ||
    "";
  if (!apiKey && !(appId && accessToken)) return null;
  return {
    apiKey,
    appId,
    accessToken,
    resourceId: defaultResourceId(),
    source: "env",
  };
}

export function volcAsrCredsValid(
  c: Pick<VolcAsrCredentials, "apiKey" | "appId" | "accessToken"> | null | undefined
) {
  if (!c) return false;
  return Boolean(c.apiKey || (c.appId && c.accessToken));
}

/** 仅检查全局 env（同步）；完整判断请用 resolveVolcAsrCredentials */
export function volcAsrConfigured() {
  return Boolean(envVolcAsr());
}

/**
 * 解析火山 ASR 凭证：公司 config.volc_asr 优先，否则全局 env。
 * 公司字段：api_key | app_id（或 app_key）| access_token | resource_id
 */
export async function resolveVolcAsrCredentials(
  companyId?: number | null
): Promise<VolcAsrCredentials | null> {
  if (companyId) {
    const res = await pool.query(`SELECT config FROM companies WHERE id = $1`, [
      companyId,
    ]);
    const volc = (
      res.rows[0]?.config as { volc_asr?: Record<string, unknown> } | null
    )?.volc_asr;
    if (volc) {
      const apiKey = String(volc.api_key || "").trim();
      const appId = String(volc.app_id || volc.app_key || "").trim();
      const accessToken = String(
        volc.access_token || volc.access_key || ""
      ).trim();
      const resourceId =
        String(volc.resource_id || "").trim() || defaultResourceId();
      if (apiKey || (appId && accessToken)) {
        return {
          apiKey,
          appId,
          accessToken,
          resourceId,
          source: "company",
        };
      }
    }
  }
  return envVolcAsr();
}

/** 鉴权头：优先新版 X-Api-Key，否则旧版 App-Key + Access-Key */
function authHeaders(
  creds: VolcAsrCredentials,
  requestId: string
): Record<string, string> {
  const base: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Resource-Id": creds.resourceId,
    "X-Api-Request-Id": requestId,
    "X-Api-Sequence": "-1",
  };
  if (creds.apiKey) {
    base["X-Api-Key"] = creds.apiKey;
    return base;
  }
  base["X-Api-App-Key"] = creds.appId;
  base["X-Api-Access-Key"] = creds.accessToken;
  return base;
}

function detectFormat(fileName?: string | null, mime?: string | null): string {
  const name = (fileName || "").toLowerCase();
  const m = (mime || "").toLowerCase();
  const fromExt = name.match(/\.([a-z0-9]+)$/)?.[1];
  const map: Record<string, string> = {
    mp3: "mp3",
    wav: "wav",
    m4a: "m4a",
    aac: "aac",
    flac: "flac",
    ogg: "ogg",
    opus: "ogg",
    amr: "amr",
    webm: "webm",
  };
  if (fromExt && map[fromExt]) return map[fromExt];
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  return "mp3";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseStatusCode(res: Response, body: Record<string, unknown>): number | null {
  const h = res.headers.get("X-Api-Status-Code") || "";
  const header = body.header as { code?: number } | undefined;
  if (typeof header?.code === "number") return header.code;
  if (/^\d+$/.test(h)) return Number(h);
  return null;
}

function extractDurationMs(data: Record<string, unknown>): number | null {
  const audioInfo = data.audio_info as { duration?: number | string } | undefined;
  const result = data.result as
    | { additions?: { duration?: string | number } }
    | undefined;
  const raw =
    audioInfo?.duration ??
    result?.additions?.duration ??
    null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function extractFromResponse(data: Record<string, unknown>): {
  text: string;
  durationMs: number | null;
} {
  return {
    text: extractTranscript(data),
    durationMs: extractDurationMs(data),
  };
}

function extractTranscript(data: Record<string, unknown>): string {
  const result = (data.result || data.data) as Record<string, unknown> | undefined;
  if (!result) return "";

  const utterances = result.utterances as
    | Array<{
        text?: string;
        additions?: { speaker?: string | number };
      }>
    | undefined;

  if (Array.isArray(utterances) && utterances.length > 0) {
    const lines = utterances
      .map((u) => {
        const t = String(u.text || "").trim();
        if (!t) return "";
        const sp = u.additions?.speaker;
        if (sp != null && String(sp) !== "") {
          return `说话人${sp}：${t}`;
        }
        return t;
      })
      .filter(Boolean);
    if (lines.length) return lines.join("\n");
  }

  const text = result.text;
  if (typeof text === "string" && text.trim()) return text.trim();
  return "";
}

async function queryUntilDone(params: {
  creds: VolcAsrCredentials;
  requestId: string;
  timeoutMs: number;
}): Promise<{ text: string; durationMs: number | null }> {
  const started = Date.now();
  let interval = 2000;
  while (Date.now() - started < params.timeoutMs) {
    await sleep(interval);
    interval = Math.min(interval + 500, 5000);

    const res = await fetch(QUERY_URL, {
      method: "POST",
      headers: authHeaders(params.creds, params.requestId),
      body: "{}",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const code = parseStatusCode(res, json);
    const msg =
      res.headers.get("X-Api-Message") ||
      String((json.header as { message?: string } | undefined)?.message || "");

    if (code === 20000000) {
      const got = extractFromResponse(json);
      if (got.text) return got;
      continue;
    }
    if (code === 20000001 || code === 20000002) {
      continue;
    }
    if (code != null) {
      throw new Error(`火山 ASR 查询失败 code=${code} ${msg}`.trim());
    }
  }
  throw new Error("火山 ASR 识别超时，请缩短录音或稍后重试");
}

/**
 * 直连火山豆包录音文件识别。
 * 优先 base64（本地即可）；超大文件且提供了 publicUrl 则用 url。
 */
export async function transcribeViaVolcAsr(params: {
  fileName: string;
  mime?: string | null;
  body: Buffer;
  publicUrl?: string | null;
  companyId?: number | null;
  credentials?: VolcAsrCredentials | null;
}): Promise<{ text: string; durationMs: number | null }> {
  const creds =
    params.credentials ||
    (await resolveVolcAsrCredentials(params.companyId));
  if (!creds) {
    throw new Error(
      "未配置火山语音鉴权：请在公司管理配置豆包识别凭证，或设置全局 VOLC_ASR_API_KEY / APP_ID + ACCESS_TOKEN"
    );
  }

  const requestId = randomUUID();
  const format = detectFormat(params.fileName, params.mime);
  const useUrl =
    params.body.length > BASE64_MAX_BYTES &&
    Boolean(params.publicUrl?.startsWith("http"));

  const audio: Record<string, string> = {
    format,
    language: "zh-CN",
  };
  if (useUrl && params.publicUrl) {
    audio.url = params.publicUrl;
  } else {
    if (params.body.length > BASE64_MAX_BYTES) {
      throw new Error(
        `录音过大（>${Math.round(BASE64_MAX_BYTES / 1024 / 1024)}MB），请配置公网存储 URL，或压缩后上传`
      );
    }
    audio.data = params.body.toString("base64");
  }

  const payload = {
    user: { uid: creds.appId || "crm-asr" },
    audio,
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      show_utterances: true,
      enable_speaker_info: true,
    },
  };

  const timeoutMs = (() => {
    const n = Number(process.env.VOLC_ASR_TIMEOUT_MS || 180000);
    return Number.isFinite(n) && n > 0 ? n : 180000;
  })();

  const submitRes = await fetch(SUBMIT_URL, {
    method: "POST",
    headers: authHeaders(creds, requestId),
    body: JSON.stringify(payload),
  });

  const submitJson = (await submitRes.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const submitCode = parseStatusCode(submitRes, submitJson);
  const submitMsg =
    submitRes.headers.get("X-Api-Message") ||
    String(
      (submitJson.header as { message?: string } | undefined)?.message || ""
    );

  if (submitCode === 20000000) {
    const immediate = extractFromResponse(submitJson);
    if (immediate.text) return immediate;
  }

  if (
    submitCode != null &&
    submitCode !== 20000000 &&
    submitCode !== 20000001 &&
    submitCode !== 20000002
  ) {
    throw new Error(
      `火山 ASR 提交失败 code=${submitCode} ${submitMsg || submitRes.status}`.trim()
    );
  }

  if (!submitRes.ok && submitCode == null) {
    throw new Error(
      `火山 ASR 提交失败 HTTP ${submitRes.status} ${JSON.stringify(submitJson).slice(0, 200)}`
    );
  }

  return queryUntilDone({
    creds,
    requestId,
    timeoutMs,
  });
}
