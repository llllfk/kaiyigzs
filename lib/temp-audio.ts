import { randomUUID } from "crypto";

type TempEntry = {
  body: Buffer;
  mime: string;
  expiresAt: number;
};

const store = new Map<string, TempEntry>();
const TTL_MS = 20 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
}

/** 内存临时音频，供火山通过公网 URL 拉取（需配置 PUBLIC_APP_BASE_URL） */
export function putTempAudio(body: Buffer, mime?: string | null) {
  sweep();
  const token = randomUUID().replace(/-/g, "");
  store.set(token, {
    body,
    mime: mime || "application/octet-stream",
    expiresAt: Date.now() + TTL_MS,
  });
  return token;
}

export function takeTempAudio(token: string): TempEntry | null {
  sweep();
  const hit = store.get(token);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(token);
    return null;
  }
  return hit;
}

export function appPublicBaseUrl() {
  const raw =
    process.env.PUBLIC_APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  return raw.replace(/\/$/, "");
}
