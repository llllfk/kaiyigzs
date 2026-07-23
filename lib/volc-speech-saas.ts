/**
 * 火山 OpenAPI（speech_saas_prod）：音色下单 / 按订单查 SpeakerID / 分页查状态
 * 鉴权：访问控制 AK/SK（与豆包语音 API Key 不同）
 */

import { createHash, createHmac } from "node:crypto";
import { ensurePlatformEnvLoaded } from "@/lib/runtime-env";

const HOST = "open.volcengineapi.com";
const REGION = "cn-north-1";
const SERVICE = "speech_saas_prod";
const VERSION = "2023-11-07";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function addVolcAuthorization(params: {
  headers: Record<string, string>;
  query: URLSearchParams;
  body: string;
  accessKeyId: string;
  secretKey: string;
}) {
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = datetime.slice(0, 8);
  params.headers["X-Date"] = datetime;
  params.headers["X-Content-Sha256"] = sha256(params.body);
  const signedHeaders = Object.keys(params.headers)
    .map((key) => key.toLowerCase())
    .filter((key) => !["authorization", "content-type", "content-length", "user-agent"].includes(key))
    .sort();
  const canonicalHeaders = signedHeaders
    .map((key) => `${key}:${params.headers[Object.keys(params.headers).find((item) => item.toLowerCase() === key)!].trim().replace(/\s+/g, " ")}`)
    .join("\n");
  const query = [...params.query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const canonical = ["POST", "/", query, `${canonicalHeaders}\n`, signedHeaders.join(";"), params.headers["X-Content-Sha256"]].join("\n");
  const scope = `${date}/${REGION}/${SERVICE}/request`;
  const stringToSign = ["HMAC-SHA256", datetime, scope, sha256(canonical)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(params.secretKey, date), REGION), SERVICE), "request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  params.headers.Authorization = `HMAC-SHA256 Credential=${params.accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`;
}

export type VolcOpenApiCredentials = {
  accessKeyId: string;
  secretKey: string;
  appId: string;
};

export function resolveVolcOpenApiCredentials(): VolcOpenApiCredentials | null {
  const accessKeyId =
    process.env.VOLC_ACCESS_KEY_ID?.trim() ||
    process.env.VOLC_ACCESSKEY?.trim() ||
    "";
  const secretKey =
    process.env.VOLC_SECRET_ACCESS_KEY?.trim() ||
    process.env.VOLC_SECRETKEY?.trim() ||
    "";
  const appId =
    process.env.VOLC_VOICE_APP_ID?.trim() ||
    process.env.VOLC_ASR_APP_ID?.trim() ||
    "";
  if (!accessKeyId || !secretKey || !appId) return null;
  return { accessKeyId, secretKey, appId };
}

export async function ensureVolcOpenApiCredentials(): Promise<VolcOpenApiCredentials | null> {
  await ensurePlatformEnvLoaded();
  return resolveVolcOpenApiCredentials();
}

async function callSpeechSaas<T = Record<string, unknown>>(params: {
  creds: VolcOpenApiCredentials;
  action: string;
  body: Record<string, unknown>;
}): Promise<T> {
  const query = new URLSearchParams({
    Action: params.action,
    Version: VERSION,
  });
  const bodyStr = JSON.stringify(params.body);
  const pathname = "/";
  const headers: Record<string, string> = {
      Host: HOST,
      "Content-Type": "application/json; charset=utf-8",
  };
  addVolcAuthorization({
    headers,
    query,
    body: bodyStr,
    accessKeyId: params.creds.accessKeyId,
    secretKey: params.creds.secretKey,
  });

  const url = `https://${HOST}${pathname}?${query.toString()}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: bodyStr,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const meta = json.ResponseMetadata as
    | { Error?: { Code?: string; Message?: string } }
    | undefined;
  if (!res.ok || meta?.Error) {
    const msg =
      meta?.Error?.Message ||
      meta?.Error?.Code ||
      (json.message as string) ||
      `火山 OpenAPI ${params.action} 失败 HTTP ${res.status}`;
    throw new Error(msg);
  }
  return (json.Result ?? json) as T;
}

export type OrderedSpeaker = {
  orderId: string;
  speakerId: string;
};

/**
 * 下单 1 个声音复刻音色（Model_storage），再按订单取 SpeakerID
 */
export async function orderVoiceCloneSpeaker(params?: {
  months?: number;
  creds?: VolcOpenApiCredentials | null;
}): Promise<OrderedSpeaker> {
  const creds =
    params?.creds ?? (await ensureVolcOpenApiCredentials());
  if (!creds) {
    throw new Error(
      "未配置火山下单凭证：请在平台设置填写 VOLC_ACCESS_KEY_ID、VOLC_SECRET_ACCESS_KEY、VOLC_VOICE_APP_ID"
    );
  }

  const appIdNum = Number(creds.appId);
  if (!Number.isFinite(appIdNum) || appIdNum <= 0) {
    throw new Error("VOLC_VOICE_APP_ID 必须是数字应用 ID");
  }

  const months = Math.max(1, Math.min(36, params?.months ?? 12));
  const orderResult = await callSpeechSaas<{ OrderIDs?: string[] }>({
    creds,
    action: "OrderAccessResourcePacks",
    body: {
      AppID: appIdNum,
      ResourceID: "volc.megatts.voiceclone",
      Code: "Model_storage",
      Times: months,
      Quantity: 1,
      AutoUseCoupon: true,
    },
  });

  const orderId = orderResult.OrderIDs?.[0];
  if (!orderId) {
    throw new Error("火山下单成功但未返回订单号");
  }

  // 订单落账可能有短暂延迟
  let speakerId = "";
  for (let i = 0; i < 8; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 800));
    const listed = await callSpeechSaas<{
      Speakers?: Array<{ SpeakerID?: string; SpeakerId?: string; ID?: string }>;
      SpeakerIDs?: string[];
    }>({
      creds,
      action: "ListMegaTTSByOrderID",
      body: {
        AppID: appIdNum,
        OrderID: orderId,
      },
    });

    speakerId =
      listed.SpeakerIDs?.[0] ||
      listed.Speakers?.[0]?.SpeakerID ||
      listed.Speakers?.[0]?.SpeakerId ||
      listed.Speakers?.[0]?.ID ||
      "";
    if (speakerId) break;
  }

  if (!speakerId) {
    throw new Error(
      `订单 ${orderId} 已创建，但暂未查到 SpeakerID，请稍后在平台音色管理中刷新`
    );
  }

  return { orderId, speakerId: String(speakerId) };
}

/** 分页查询应用下音色训练状态（平台查询用） */
export async function batchListMegaTtsTrainStatus(params?: {
  pageNumber?: number;
  pageSize?: number;
  speakerIds?: string[];
  creds?: VolcOpenApiCredentials | null;
}) {
  const creds =
    params?.creds ?? (await ensureVolcOpenApiCredentials());
  if (!creds) {
    throw new Error("未配置火山下单凭证");
  }
  const appIdNum = Number(creds.appId);
  const body: Record<string, unknown> = {
    AppID: appIdNum,
    PageNumber: params?.pageNumber ?? 1,
    PageSize: params?.pageSize ?? 100,
  };
  if (params?.speakerIds?.length) {
    body.SpeakerIDs = params.speakerIds;
  }
  return callSpeechSaas<Record<string, unknown>>({
    creds,
    action: "BatchListMegaTTSTrainStatus",
    body,
  });
}

export type MegaTtsSpeakerStatus = {
  speakerId: string;
  state?: string;
  /** 剩余可上传训练次数（每个音色通常共 15 次） */
  availableTrainingTimes: number | null;
  version?: string;
  expireTime?: number | null;
  alias?: string;
  raw: Record<string, unknown>;
};

/** 从 BatchListMegaTTSTrainStatus 结果解析各 Speaker 剩余训练次数 */
export function parseMegaTtsTrainStatuses(
  result: Record<string, unknown> | null | undefined
): MegaTtsSpeakerStatus[] {
  if (!result || typeof result !== "object") return [];
  const statuses = result.Statuses;
  if (!Array.isArray(statuses)) return [];
  const parsed: MegaTtsSpeakerStatus[] = [];
  for (const item of statuses) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const speakerId = String(row.SpeakerID || row.SpeakerId || "").trim();
    if (!speakerId) continue;
    const timesRaw = row.AvailableTrainingTimes;
    const times =
      timesRaw == null || timesRaw === "" ? null : Number(timesRaw);
    parsed.push({
        speakerId,
        state: row.State != null ? String(row.State) : undefined,
        availableTrainingTimes:
          times != null && Number.isFinite(times) ? times : null,
        version: row.Version != null ? String(row.Version) : undefined,
        expireTime:
          row.ExpireTime != null && Number.isFinite(Number(row.ExpireTime))
            ? Number(row.ExpireTime)
            : null,
        alias: row.Alias != null ? String(row.Alias) : undefined,
        raw: row,
    });
  }
  return parsed;
}
