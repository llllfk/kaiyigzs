import { NextRequest, NextResponse } from "next/server";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/$/, "");
}

function firstHeaderValue(value: string | null) {
  if (!value) return "";
  return value.split(",")[0].trim();
}

/** Compare hosts ignoring optional ports / proxy list suffixes. */
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

/**
 * CSRF guard for unsafe API methods.
 * Coze Edge middleware often cannot see APP_ORIGINS/TRUST_PROXY at runtime,
 * so also accept Origin that matches the public reverse-proxy host.
 */
function isOriginAllowed(request: NextRequest, origin: string) {
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

  // Public host reported by Coze / reverse proxy (does not require env vars).
  if (xfHost) {
    if (hostsEqual(originHost, xfHost)) return true;
    const publicOrigin = normalizeOrigin(`${xfProto}://${firstHeaderValue(xfHost)}`);
    if (normalized === publicOrigin) return true;
  }

  // Direct access (local next start without proxy): Origin host must match Host.
  if (!xfHost && hostsEqual(originHost, requestHost)) {
    // If an allowlist is configured and reachable, require it; otherwise host match is enough.
    return allowlist.length === 0 || allowlist.includes(normalized);
  }

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
    if (process.env.NODE_ENV !== "production") return response;
    return NextResponse.json({ error: "Missing request origin" }, { status: 403 });
  }

  if (!isOriginAllowed(request, origin)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  return response;
}

export const config = { matcher: "/api/:path*" };
