import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import pool from "@/lib/db";
import { AuthError } from "@/lib/auth";

export function securityHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function requestId() {
  return randomUUID();
}

export function clientIp(request: NextRequest | Request) {
  const trustProxy = process.env.TRUST_PROXY === "true";
  if (trustProxy) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim().slice(0, 100);
    const real = request.headers.get("x-real-ip");
    if (real) return real.trim().slice(0, 100);
  }
  return "unknown";
}

export async function enforceRateLimit(params: {
  key: string;
  limit: number;
  windowSeconds: number;
  blockSeconds?: number;
}) {
  const key = securityHash(params.key).slice(0, 64);
  const result = await pool.query(
    `INSERT INTO security_rate_limits(bucket_key,window_started_at,hit_count,updated_at)
     VALUES($1,CURRENT_TIMESTAMP,1,CURRENT_TIMESTAMP)
     ON CONFLICT(bucket_key) DO UPDATE SET
       hit_count = CASE
         WHEN security_rate_limits.window_started_at <= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second') THEN 1
         ELSE security_rate_limits.hit_count + 1 END,
       window_started_at = CASE
         WHEN security_rate_limits.window_started_at <= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second') THEN CURRENT_TIMESTAMP
         ELSE security_rate_limits.window_started_at END,
       blocked_until = CASE
         WHEN security_rate_limits.hit_count + 1 > $3
           AND security_rate_limits.window_started_at > CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second')
         THEN CURRENT_TIMESTAMP + ($4 * INTERVAL '1 second')
         WHEN security_rate_limits.blocked_until <= CURRENT_TIMESTAMP THEN NULL
         ELSE security_rate_limits.blocked_until END,
       updated_at=CURRENT_TIMESTAMP
     RETURNING hit_count,window_started_at,blocked_until`,
    [key, params.windowSeconds, params.limit, params.blockSeconds ?? params.windowSeconds]
  );
  const row = result.rows[0];
  const blockedUntil = row?.blocked_until ? new Date(row.blocked_until) : null;
  if (blockedUntil && blockedUntil.getTime() > Date.now()) {
    const retryAfter = Math.max(1, Math.ceil((blockedUntil.getTime() - Date.now()) / 1000));
    throw new RateLimitError(retryAfter);
  }
}

/** 仅检查是否已锁定，不增加计数（用于先拦再校验密码） */
export async function assertNotRateLimited(key: string) {
  const bucket = securityHash(key).slice(0, 64);
  const result = await pool.query(
    `SELECT blocked_until FROM security_rate_limits WHERE bucket_key = $1 LIMIT 1`,
    [bucket]
  );
  const blockedUntil = result.rows[0]?.blocked_until
    ? new Date(result.rows[0].blocked_until)
    : null;
  if (blockedUntil && blockedUntil.getTime() > Date.now()) {
    const retryAfter = Math.max(
      1,
      Math.ceil((blockedUntil.getTime() - Date.now()) / 1000)
    );
    throw new RateLimitError(retryAfter);
  }
}

export class RateLimitError extends AuthError {
  retryAfter: number;
  constructor(retryAfter: number) {
    super("请求过于频繁，请稍后重试", 429);
    this.retryAfter = retryAfter;
  }
}

const COMMON_PASSWORDS = new Set([
  "1234567890", "password123", "admin123!", "company123!", "manager123!", "sales123!",
]);

export function assertStrongPassword(password: string) {
  const normalized = password.trim().toLowerCase();
  if (password.length < 10) throw new AuthError("密码至少 10 位", 400);
  if (COMMON_PASSWORDS.has(normalized)) throw new AuthError("密码过于常见，请更换更安全的密码", 400);
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw new AuthError("密码必须同时包含字母和数字", 400);
  }
}
