import { cache } from "react";
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

function toId(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toSessionUser(row: {
  id: number | string;
  company_id: number | string | null;
  manager_id: number | string | null;
  role: UserRole;
  name: string;
  email: string | null;
  phone?: string | null;
}): SessionUser {
  return {
    id: Number(row.id),
    company_id: toId(row.company_id),
    manager_id: toId(row.manager_id),
    role: row.role,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
  };
}

/** 是否处于「查看某公司业务」模式 */
export function isActingAsCompany(user: SessionUser) {
  return user.role === "super_admin" && toId(user.act_as_company_id) != null;
}

/** 将超管公司视图的 company_id 落到会话上，供业务 API 使用 */
export function withCompanyContext(user: SessionUser): SessionUser {
  const actAs = toId(user.act_as_company_id);
  if (user.role === "super_admin" && actAs != null) {
    return {
      ...user,
      id: Number(user.id),
      company_id: actAs,
      manager_id: toId(user.manager_id),
      act_as_company_id: actAs,
    };
  }
  return {
    ...user,
    id: Number(user.id),
    company_id: toId(user.company_id),
    manager_id: toId(user.manager_id),
    act_as_company_id: toId(user.act_as_company_id ?? null),
  };
}

/** 同一次 RSC 请求内去重，避免 layout + page 重复读 cookie */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE_NAME)?.value);
});

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthError("未登录", 401);
  }
  return withCompanyContext(user);
}

/** 进入公司业务视图（仅超级管理员） */
export async function enterCompanyView(companyId: number, companyName: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") {
    throw new AuthError("仅超级管理员可进入公司业务视图", 403);
  }
  const cid = Number(companyId);
  const next: SessionUser = {
    ...user,
    act_as_company_id: cid,
    act_as_company_name: companyName,
    company_id: cid,
  };
  await setSessionCookie(next);
  return next;
}

/** 退出公司业务视图，回到平台超管 */
export async function exitCompanyView() {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") {
    throw new AuthError("当前不在公司业务视图", 403);
  }
  const next: SessionUser = {
    ...user,
    act_as_company_id: null,
    act_as_company_name: null,
    company_id: null,
  };
  await setSessionCookie(next);
  return next;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

/** 支持邮箱或手机号 + 密码登录 */
export async function loginWithAccountPassword(account: string, password: string) {
  const raw = account.trim();
  if (!raw) throw new AuthError("请输入邮箱或手机号", 400);

  const result = await pool.query(
    `SELECT id, company_id, manager_id, role, name, email, phone, password_hash, status
     FROM users
     WHERE lower(email) = lower($1)
        OR phone = $1
        OR phone = regexp_replace($1, '\\s+', '', 'g')
     LIMIT 1`,
    [raw]
  );
  const row = result.rows[0];
  if (!row || row.status !== "active") {
    throw new AuthError("账号或密码错误", 401);
  }
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    throw new AuthError("账号或密码错误", 401);
  }
  void pool
    .query(
      `UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [row.id]
    )
    .catch(() => null);
  const session = toSessionUser(row);
  await setSessionCookie(session);
  return session;
}

/** @deprecated 使用 loginWithAccountPassword */
export async function loginWithEmailPassword(email: string, password: string) {
  return loginWithAccountPassword(email, password);
}

export async function loadUserById(id: number): Promise<SessionUser | null> {
  const result = await pool.query(
    `SELECT id, company_id, manager_id, role, name, email, phone, status
     FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  const row = result.rows[0];
  if (!row || row.status !== "active") return null;
  return toSessionUser(row);
}
