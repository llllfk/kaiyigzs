/**
 * 通话录音转写：优先扣子 ASR 工作流，其次智能体听音频 / Whisper；再 LLM 标成销售/客户对话。
 */

import { chatCompletion } from "@/lib/ai";
import {
  getPresignedGetUrl,
  publicUrlForObjectUri,
  saveObject,
} from "@/lib/storage";
import { appPublicBaseUrl, putTempAudio } from "@/lib/temp-audio";
import {
  resolveVolcAsrCredentials,
  transcribeViaVolcAsr,
} from "@/lib/volc-asr";

const DEFAULT_WORKFLOW_ID = "7664217934688567346";

function apiBase() {
  return process.env.COZE_API_BASE?.trim() || "https://api.coze.cn";
}

function apiKey() {
  return process.env.COZE_AI_API_KEY?.trim() || "";
}

function workflowId() {
  return (
    process.env.COZE_ASR_WORKFLOW_ID?.trim() ||
    DEFAULT_WORKFLOW_ID
  );
}

function aiTimeoutMs() {
  const n = Number(process.env.AI_TIMEOUT_MS || 150000);
  return Number.isFinite(n) && n > 0 ? n : 150000;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  ms = aiTimeoutMs()
) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 上传到扣子，返回 file_id；尽量再取临时 download_url 供火山 ASR */
export async function uploadAudioToCoze(params: {
  fileName: string;
  mime?: string | null;
  body: Buffer;
}): Promise<{ fileId: string; downloadUrl?: string | null }> {
  const key = apiKey();
  if (!key) throw new Error("未配置 COZE_AI_API_KEY，无法上传音频到扣子");

  const form = new FormData();
  const blob = new Blob([new Uint8Array(params.body)], {
    type: params.mime || "application/octet-stream",
  });
  form.append("file", blob, params.fileName || "call-audio");

  const res = await fetchWithTimeout(`${apiBase()}/v1/files/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as {
    code?: number;
    msg?: string;
    message?: string;
    data?: { id?: string; download_url?: string; url?: string };
  };
  if (!res.ok || json.code !== 0 || !json.data?.id) {
    throw new Error(
      json.msg ||
        json.message ||
        `扣子文件上传失败 (${res.status})`
    );
  }
  const fileId = String(json.data.id);
  let downloadUrl =
    json.data.download_url || json.data.url || null;

  if (!downloadUrl) {
    try {
      await new Promise((r) => setTimeout(r, 800));
      const ret = await fetchWithTimeout(
        `${apiBase()}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${key}` },
        }
      );
      const retJson = (await ret.json().catch(() => ({}))) as {
        code?: number;
        data?: {
          download_url?: string;
          url?: string;
          file_info?: { download_url?: string; url?: string };
        };
      };
      if (ret.ok && retJson.code === 0) {
        downloadUrl =
          retJson.data?.download_url ||
          retJson.data?.url ||
          retJson.data?.file_info?.download_url ||
          retJson.data?.file_info?.url ||
          null;
      }
    } catch {
      /* ignore */
    }
  }

  return { fileId, downloadUrl };
}

function extractTextFromUnknown(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") {
    const t = data.trim();
    if (!t) return "";
    // 可能是 JSON 字符串
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return extractTextFromUnknown(JSON.parse(t));
      } catch {
        return t;
      }
    }
    return t;
  }
  if (Array.isArray(data)) {
    return data.map(extractTextFromUnknown).filter(Boolean).join("\n");
  }
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const preferred = [
      "transcript",
      "text",
      "result",
      "content",
      "output",
      "asr_text",
      "message",
    ];
    for (const k of preferred) {
      if (obj[k] != null) {
        const v = extractTextFromUnknown(obj[k]);
        if (v) return v;
      }
    }
    // 常见：data.Output / data.output
    for (const [k, v] of Object.entries(obj)) {
      if (/text|transcript|result|content|output/i.test(k)) {
        const got = extractTextFromUnknown(v);
        if (got) return got;
      }
    }
  }
  return "";
}

function parseWorkflowSse(raw: string): string {
  let last = "";
  const blocks = raw.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n");
    let event = "";
    let dataLine = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLine += line.slice(5).trim();
    }
    if (!dataLine || dataLine === "[DONE]") continue;
    try {
      const payload = JSON.parse(dataLine) as Record<string, unknown>;
      if (event === "Error" || payload.error_message) {
        throw new Error(
          String(payload.error_message || payload.error || "工作流执行失败")
        );
      }
      const content =
        extractTextFromUnknown(payload.content) ||
        extractTextFromUnknown(payload.data) ||
        extractTextFromUnknown(payload);
      if (content) last = content;
    } catch (err) {
      if (err instanceof Error && err.message.includes("工作流")) throw err;
    }
  }
  return last;
}

function asrUrlParamName() {
  // 火山节点要 String；开始节点参数名与此一致，默认 file_url
  return process.env.COZE_ASR_FILE_PARAM?.trim() || "file_url";
}

/**
 * 为火山 ASR 准备可公网访问的 https URL。
 * 扣子 /v1/files/upload 通常不返回 download_url，故优先对象存储 / 临时下载接口。
 */
export async function resolveAudioHttpsUrl(params: {
  companyId: number;
  fileName: string;
  mime?: string | null;
  body: Buffer;
}): Promise<{ url: string; storageUri?: string }> {
  // 1) 已配置公网桶基址或可预签名
  const saved = await saveObject({
    companyId: params.companyId,
    folder: "crm",
    fileName: params.fileName,
    contentType: params.mime || undefined,
    body: params.body,
  });
  const publicBase = publicUrlForObjectUri(saved.uri);
  if (publicBase?.startsWith("http")) {
    return { url: publicBase, storageUri: saved.uri };
  }
  const signed = await getPresignedGetUrl(saved.uri);
  if (signed?.startsWith("http")) {
    return { url: signed, storageUri: saved.uri };
  }

  // 2) 本机临时下载（火山服务器必须能访问，需公网域名）
  const base = appPublicBaseUrl();
  if (base.startsWith("http") && !/localhost|127\.0\.0\.1/i.test(base)) {
    const token = putTempAudio(params.body, params.mime);
    return {
      url: `${base}/api/media/temp/${token}`,
      storageUri: saved.uri,
    };
  }

  // 3) 尝试扣子 upload 的 download_url（多数账号没有）
  try {
    const uploaded = await uploadAudioToCoze({
      fileName: params.fileName,
      mime: params.mime,
      body: params.body,
    });
    if (uploaded.downloadUrl?.startsWith("http")) {
      return { url: uploaded.downloadUrl, storageUri: saved.uri };
    }
  } catch (err) {
    console.warn("[resolveAudioHttpsUrl.cozeUpload]", err);
  }

  throw new Error(
    "无法生成火山可用的 https 音频地址。请任选其一：① 配置 COZE_STORAGE_* 与 COZE_STORAGE_PUBLIC_BASE（或安装预签名依赖）；② 配置公网 PUBLIC_APP_BASE_URL；③ 粘贴转写文本；④ 配置 OPENAI_API_KEY 用 Whisper"
  );
}

/** 调用扣子 ASR 工作流：向 String 型 file_url 传入公网 https 地址 */
export async function transcribeViaCozeWorkflow(params: {
  fileName: string;
  mime?: string | null;
  body: Buffer;
  publicUrl: string;
}): Promise<string> {
  const key = apiKey();
  const wf = workflowId();
  if (!key) throw new Error("未配置 COZE_AI_API_KEY");
  if (!wf) throw new Error("未配置 COZE_ASR_WORKFLOW_ID");
  if (!params.publicUrl.startsWith("http")) {
    throw new Error("file_url 必须是 https 地址");
  }

  const urlParam = asrUrlParamName();
  const body = {
    workflow_id: wf,
    parameters: { [urlParam]: params.publicUrl },
  };

  const runRes = await fetchWithTimeout(`${apiBase()}/v1/workflow/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (runRes.ok) {
    const json = (await runRes.json()) as {
      code?: number;
      msg?: string;
      message?: string;
      data?: unknown;
    };
    if (json.code === 0) {
      const text = extractTextFromUnknown(json.data);
      // 火山成功但空 result 时不要当成功
      if (text) return text;
    } else {
      console.warn("[transcribe.workflow.run]", json.code, json.msg || json.message);
    }
  }

  const streamRes = await fetchWithTimeout(`${apiBase()}/v1/workflow/stream_run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await streamRes.text();
  if (!streamRes.ok) {
    throw new Error(
      `语音转写工作流失败 (${streamRes.status}) ${raw.slice(0, 200)}`
    );
  }
  const text = parseWorkflowSse(raw) || extractTextFromUnknown(raw);
  if (!text) {
    throw new Error(
      "语音转写工作流未返回文本（result 为空）。请确认开始节点 file_url 已引用到火山节点，且传入的是可访问 https 链接"
    );
  }
  return text;
}

/** 无公网 URL 时：上传 file_id，用智能体听音频转写（不经火山工作流） */
async function transcribeViaCozeBotAudio(params: {
  fileName: string;
  mime?: string | null;
  body: Buffer;
  companyId?: number | null;
  userId?: number | null;
}): Promise<string> {
  const { resolveCozeCredentials } = await import("@/lib/ai");
  const creds = await resolveCozeCredentials(params.companyId);
  if (!creds) throw new Error("未配置扣子智能体，无法用对话转写音频");

  const uploaded = await uploadAudioToCoze({
    fileName: params.fileName,
    mime: params.mime,
    body: params.body,
  });

  const content = JSON.stringify([
    {
      type: "text",
      text: "请完整转写这段通话录音的全部内容，只输出转写正文，不要解释、不要 markdown。",
    },
    { type: "audio", file_id: uploaded.fileId },
  ]);

  const res = await fetchWithTimeout(`${creds.apiBase}/v3/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.apiKey}`,
    },
    body: JSON.stringify({
      bot_id: creds.botId,
      user_id: `crm_${params.userId || "asr"}`,
      stream: true,
      auto_save_history: false,
      additional_messages: [
        {
          role: "user",
          content,
          content_type: "object_string",
        },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`智能体音频转写失败: ${res.status} ${errText.slice(0, 200)}`);
  }
  const raw = await res.text();
  const text = parseWorkflowSse(raw) || extractTextFromUnknown(raw);
  // parseWorkflowSse 主要看 content；复用 ai 的 SSE 解析更稳 — 简单抽 answer
  let answer = text;
  if (!answer) {
    const m = raw.match(/"content"\s*:\s*"((?:\\.|[^"\\])*)"/g);
    if (m?.length) {
      const last = m[m.length - 1];
      const inner = last.replace(/^"content"\s*:\s*"/, "").replace(/"$/, "");
      try {
        answer = JSON.parse(`"${inner}"`);
      } catch {
        answer = inner;
      }
    }
  }
  if (!answer?.trim()) {
    throw new Error("智能体未返回转写文本");
  }
  return answer.trim();
}

async function transcribeViaWhisper(params: {
  fileName: string;
  mime?: string | null;
  body: Buffer;
}): Promise<string> {
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openAiKey) throw new Error("未配置 OPENAI_API_KEY");

  const base = process.env.AI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const form = new FormData();
  const blob = new Blob([new Uint8Array(params.body)], {
    type: params.mime || "audio/mpeg",
  });
  form.append("file", blob, params.fileName || "audio.mp3");
  form.append("model", process.env.WHISPER_MODEL?.trim() || "whisper-1");
  form.append("language", "zh");

  const res = await fetchWithTimeout(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as {
    text?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.text) {
    throw new Error(json.error?.message || `Whisper 转写失败 (${res.status})`);
  }
  return String(json.text).trim();
}

/** ASR：优先火山直连 → 扣子工作流 → 智能体听音频 → Whisper */
export async function transcribeAudio(params: {
  fileName: string;
  mime?: string | null;
  body: Buffer;
  companyId: number;
  userId?: number | null;
  publicUrl?: string | null;
}): Promise<{
  text: string;
  provider: "volc_asr" | "coze_workflow" | "coze_bot_audio" | "whisper";
  storageUri?: string;
  durationMs?: number | null;
}> {
  const errors: string[] = [];

  // A. 火山豆包直连（公司凭证优先，否则全局 env）
  const volcCreds = await resolveVolcAsrCredentials(params.companyId);
  if (volcCreds) {
    try {
      let publicUrl = params.publicUrl?.startsWith("http")
        ? params.publicUrl
        : undefined;
      let storageUri: string | undefined;
      // 超大文件才尝试拼公网 URL
      if (!publicUrl && params.body.length > 15 * 1024 * 1024) {
        try {
          const resolved = await resolveAudioHttpsUrl({
            companyId: params.companyId,
            fileName: params.fileName,
            mime: params.mime,
            body: params.body,
          });
          publicUrl = resolved.url;
          storageUri = resolved.storageUri;
        } catch {
          /* base64 路径会自行报错 */
        }
      }
      const got = await transcribeViaVolcAsr({
        fileName: params.fileName,
        mime: params.mime,
        body: params.body,
        publicUrl,
        credentials: volcCreds,
      });
      return {
        text: got.text,
        provider: "volc_asr",
        storageUri,
        durationMs: got.durationMs,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`火山直连: ${msg}`);
      console.warn("[transcribe.volc]", err);
    }
  }

  // B. 扣子工作流（需要 https）
  if (apiKey() && workflowId()) {
    try {
      let url = params.publicUrl?.startsWith("http") ? params.publicUrl : "";
      let storageUri: string | undefined;
      if (!url) {
        const resolved = await resolveAudioHttpsUrl({
          companyId: params.companyId,
          fileName: params.fileName,
          mime: params.mime,
          body: params.body,
        });
        url = resolved.url;
        storageUri = resolved.storageUri;
      }
      const text = await transcribeViaCozeWorkflow({
        fileName: params.fileName,
        mime: params.mime,
        body: params.body,
        publicUrl: url,
      });
      return { text, provider: "coze_workflow", storageUri };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`工作流: ${msg}`);
      console.warn("[transcribe.workflow]", err);
    }
  }

  // C. 智能体 + file_id 听写（无需公网 URL）
  if (apiKey()) {
    try {
      const text = await transcribeViaCozeBotAudio({
        fileName: params.fileName,
        mime: params.mime,
        body: params.body,
        companyId: params.companyId,
        userId: params.userId,
      });
      return { text, provider: "coze_bot_audio" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`智能体听写: ${msg}`);
      console.warn("[transcribe.botAudio]", err);
    }
  }

  // D. Whisper
  if (process.env.OPENAI_API_KEY?.trim()) {
    try {
      const text = await transcribeViaWhisper(params);
      return { text, provider: "whisper" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Whisper: ${msg}`);
    }
  }

  throw new Error(
    errors.length
      ? `语音识别失败：${errors.join("；")}`
      : "未配置可用的语音识别方式（请在公司管理配置豆包识别凭证，或设置全局 VOLC_ASR_*）"
  );
}

const DIALOGUE_SYSTEM = `你是通话整理助手。将语音转写原文整理为双人对话记录。
规则：
1. 只输出对话正文，不要 markdown、不要前言后语
2. 每行格式：销售：… 或 客户：…
3. 根据语气与内容判断角色（推销/报价/跟进方为销售，需求/顾虑/决策方为客户）
4. 合并同一人的连续短句；保留关键信息，可轻微标点修正，不要编造原文没有的内容
5. 若无法区分角色，用 说话人A： / 说话人B：`;

/** 将 ASR 原文标成销售/客户对话 */
export async function formatCallDialogue(params: {
  rawText: string;
  customerName?: string | null;
  companyId?: number | null;
  userId?: number | null;
}): Promise<string> {
  const raw = params.rawText.trim();
  if (!raw) return "";
  // 已是对话格式则直接用
  if (/^(销售|客户|说话人[AB\d]+)[：:]/m.test(raw) && raw.split("\n").length >= 2) {
    return raw;
  }

  try {
    const content = await chatCompletion({
      system: DIALOGUE_SYSTEM,
      prompt: `客户名：${params.customerName || "未知"}\n\n转写原文：\n${raw.slice(0, 20000)}`,
      companyId: params.companyId,
      userId: params.userId,
    });
    const cleaned = content
      .replace(/^```[\s\S]*?\n/, "")
      .replace(/```$/, "")
      .trim();
    return cleaned || raw;
  } catch (err) {
    console.error("[formatCallDialogue]", err);
    return raw;
  }
}

export async function asrConfigured(companyId?: number | null) {
  if (await resolveVolcAsrCredentials(companyId)) return true;
  return Boolean(apiKey() || process.env.OPENAI_API_KEY?.trim());
}
