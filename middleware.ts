import { NextRequest, NextResponse } from "next/server";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/$/, "");
}

function firstHeaderValue(value: string | null) {
  if (!value) return "";
  return value.split(",")[0].trim();
}

/** Compare hosts ignoring optional default ports and proxy suffixes. */
function hostsEqual(a: string, b: string) {
  const left = firstHeaderValue(a).toLowerCase().replace(/:\d+$/, "");
  const right = firstHeaderValue(b).toLowerCase().replace(/:\d+$/, "");
  return Boolean(left && right && left === right);
}

function allowedOrigins(request: NextRequest) {
  const configured = (process.env.APP_ORIGINS || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
  if (process.env.NODE_ENV === "production") return new Set(configured);
  return new Set([...configured, normalizeOrigin(request.nextUrl.origin)]);
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

  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    // Invalid origins are rejected below.
  }

  const trustProxy = process.env.TRUST_PROXY === "true";
  const requestHost = trustProxy
    ? firstHeaderValue(request.headers.get("x-forwarded-host")) ||
      firstHeaderValue(request.headers.get("host"))
    : firstHeaderValue(request.headers.get("host"));

  const isDev = process.env.NODE_ENV !== "production";
  const originInAllowlist = allowedOrigins(request).has(normalizeOrigin(origin));
  // Coze / reverse proxy: Origin is public domain, Host may be internal — only enforce allowlist.
  const hostMatches = hostsEqual(originHost, requestHost);
  const hostOk = isDev || trustProxy || hostMatches;

  if (!originInAllowlist || !hostOk) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  return response;
}

export const config = { matcher: "/api/:path*" };
