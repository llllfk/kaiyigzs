import { NextRequest, NextResponse } from "next/server";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function allowedOrigins(request: NextRequest) {
  const configured = (process.env.APP_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (process.env.NODE_ENV === "production") return new Set(configured);
  return new Set([...configured, request.nextUrl.origin]);
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
  const requestHost = process.env.TRUST_PROXY === "true"
    ? request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
    : request.headers.get("host") || "";
  if (!allowedOrigins(request).has(origin.replace(/\/$/, "")) || originHost !== requestHost) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  return response;
}

export const config = { matcher: "/api/:path*" };
