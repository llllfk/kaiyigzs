import { NextRequest, NextResponse } from "next/server";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function normalizeOrigin(value: string) {
  return value.trim().replace(/^["']|["']$/g, "").replace(/\/$/, "");
}

function firstHeaderValue(value: string | null) {
  if (!value) return "";
  return value.split(",")[0].trim();
}

function hostsEqual(a: string, b: string) {
  const left = firstHeaderValue(a).toLowerCase().replace(/:\d+$/, "");
  const right = firstHeaderValue(b).toLowerCase().replace(/:\d+$/, "");
  return Boolean(left && right && left === right);
}

function configuredOrigins() {
  return (process.env.APP_ORIGINS || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function isTrustedPublicHost(host: string) {
  const h = firstHeaderValue(host).toLowerCase().replace(/:\d+$/, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "127.0.0.1" ||
    h.endsWith(".coze.site") ||
    h.endsWith(".coze.cn") ||
    h.endsWith(".coze.com")
  );
}

/**
 * Optional CSRF Origin check.
 *
 * Default OFF: Coze Edge middleware often cannot read APP_ORIGINS, and proxy
 * Host / X-Forwarded-* headers do not match the browser Origin, causing false
 * 403s. Session cookies are SameSite=Lax + HttpOnly, which already blocks
 * typical cross-site POST CSRF.
 *
 * Set ENFORCE_APP_ORIGINS=true to re-enable strict checks when the runtime
 * reliably injects APP_ORIGINS into middleware.
 */
function isOriginAllowed(request: NextRequest, origin: string) {
  if (process.env.ENFORCE_APP_ORIGINS !== "true") return true;

  const normalized = normalizeOrigin(origin);
  const allowlist = configuredOrigins();
  if (allowlist.includes(normalized)) return true;

  if (process.env.NODE_ENV !== "production") {
    if (normalized === normalizeOrigin(request.nextUrl.origin)) return true;
  }

  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  const xfHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const requestHost = firstHeaderValue(request.headers.get("host"));
  const xfProto = firstHeaderValue(request.headers.get("x-forwarded-proto")) || "https";

  if (xfHost && hostsEqual(originHost, xfHost)) return true;
  if (xfHost) {
    const publicOrigin = normalizeOrigin(`${xfProto}://${firstHeaderValue(xfHost)}`);
    if (normalized === publicOrigin) return true;
  }
  if (!xfHost && hostsEqual(originHost, requestHost)) return true;
  if (isTrustedPublicHost(originHost)) return true;

  return false;
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/public/quotes/")) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  if (!request.nextUrl.pathname.startsWith("/api/") || !UNSAFE.has(request.method)) {
    return response;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    // Same-origin navigations / some clients omit Origin; cookies are SameSite=Lax.
    return response;
  }

  if (!isOriginAllowed(request, origin)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  return response;
}

export const config = { matcher: "/api/:path*" };
