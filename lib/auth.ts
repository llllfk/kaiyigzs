import { createHmac } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import type { SessionUser, UserRole } from "@/types";

const COOKIE_NAME = "crm_session";
const SESSION_DAYS = 7;

function getSecret() {
  return process.env.SESSION_SECRET || "dev-secret-change-me";
}

function encodeSession(user: SessionUser): string {
  const payload = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  const sig = createSig(payload);
  return `${payload}.${sig}`;
}

function createSig(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function decodeSession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (createSig(payload) !== sig) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function setSessionCookie(user: SessionUser) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, encodeSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE_NAME)?.value);
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthError("未登录", 401);
  }
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function loginWithEmailPassword(email: string, password: string) {
  const result = await pool.query(
    `SELECT id, company_id, manager_id, role, name, email, password_hash, status
     FROM users WHERE email = $1 LIMIT 1`,
    [email.toLowerCase().trim()]
  );
  const row = result.rows[0];
  if (!row || row.status !== "active") {
    throw new AuthError("账号或密码错误", 401);
  }
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    throw new AuthError("账号或密码错误", 401);
  }
  const session: SessionUser = {
    id: row.id,
    company_id: row.company_id,
    manager_id: row.manager_id,
    role: row.role as UserRole,
    name: row.name,
    email: row.email,
  };
  await setSessionCookie(session);
  return session;
}
