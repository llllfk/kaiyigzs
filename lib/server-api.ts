import "server-only";

import { headers } from "next/headers";

/**
 * Server Component 复用现有鉴权 API 获取首屏数据。
 * 请求发生在服务端渲染阶段，浏览器拿到页面时即可直接展示列表。
 */
export async function fetchServerApiJson<T>(path: string): Promise<T | null> {
  try {
    const incoming = await headers();
    const host = incoming.get("x-forwarded-host") || incoming.get("host");
    if (!host) return null;
    const protocol =
      incoming.get("x-forwarded-proto") ||
      (process.env.NODE_ENV === "production" ? "https" : "http");
    const cookie = incoming.get("cookie") || "";
    const res = await fetch(`${protocol}://${host}${path}`, {
      cache: "no-store",
      headers: cookie ? { cookie } : undefined,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
