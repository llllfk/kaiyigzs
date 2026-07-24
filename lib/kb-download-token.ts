import { createHmac, timingSafeEqual } from "node:crypto";

type KbDownloadPayload = {
  v: 1;
  fileId: number;
  companyId: number | null;
  userId: number;
  exp: number;
};

function secret() {
  const s = process.env.SESSION_SECRET?.trim();
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is required for download tokens");
  }
  return s;
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/** 短时下载令牌：供系统浏览器打开，无需携带 Session Cookie */
export function createKbDownloadToken(params: {
  fileId: number;
  companyId: number | null;
  userId: number;
  ttlSec?: number;
}) {
  const ttl = Math.min(600, Math.max(30, params.ttlSec ?? 120));
  const payload: KbDownloadPayload = {
    v: 1,
    fileId: Number(params.fileId),
    companyId: params.companyId == null ? null : Number(params.companyId),
    userId: Number(params.userId),
    exp: Date.now() + ttl * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyKbDownloadToken(token: string): KbDownloadPayload | null {
  const raw = String(token || "").trim();
  const i = raw.lastIndexOf(".");
  if (i <= 0) return null;
  const body = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  if (!body || !sig) return null;
  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as KbDownloadPayload;
    if (payload?.v !== 1) return null;
    if (!Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;
    if (!Number.isFinite(payload.fileId) || !Number.isFinite(payload.userId)) {
      return null;
    }
    return {
      v: 1,
      fileId: Number(payload.fileId),
      companyId:
        payload.companyId == null ? null : Number(payload.companyId),
      userId: Number(payload.userId),
      exp: Number(payload.exp),
    };
  } catch {
    return null;
  }
}

export function publicAppOrigin(requestUrl: URL, requestOrigin?: string | null) {
  const env = process.env.PUBLIC_APP_BASE_URL?.trim().replace(/\/$/, "");
  if (env) return env;
  const first = process.env.APP_ORIGINS?.split(",")[0]?.trim().replace(/\/$/, "");
  if (first) return first;
  if (requestOrigin) return requestOrigin.replace(/\/$/, "");
  return requestUrl.origin;
}
