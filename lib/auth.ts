import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import type { SessionUser, UserRole } from "@/types";

const DEV_COOKIE = "crm_session";
const PROD_COOKIE = "__Host-crm_session";
const IDLE_HOURS = 48;
const ABSOLUTE_DAYS = 15;

function cookieName() { return process.env.NODE_ENV === "production" ? PROD_COOKIE : DEV_COOKIE; }
function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function toId(value: unknown): number | null { const n = Number(value); return value == null || !Number.isFinite(n) ? null : n; }

function rowToUser(row: Record<string, unknown>): SessionUser {
  const actAs = toId(row.act_as_company_id);
  return {
    id: Number(row.id), company_id: actAs ?? toId(row.company_id), manager_id: toId(row.manager_id),
    role: row.role as UserRole, name: String(row.name), email: row.email == null ? null : String(row.email),
    phone: row.phone == null ? null : String(row.phone), act_as_company_id: actAs,
    act_as_company_name: row.act_as_company_name == null ? null : String(row.act_as_company_name),
    must_change_password: Boolean(row.must_change_password),
    session_prefix: row.session_prefix == null ? null : String(row.session_prefix),
  };
}

async function readCookieToken() {
  const jar = await cookies();
  return jar.get(cookieName())?.value || jar.get(DEV_COOKIE)?.value || "";
}

export async function hashPassword(password: string) { return bcrypt.hash(password, 12); }
export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash); }

export async function setSessionCookie(user: SessionUser, meta?: { ip?: string | null; userAgent?: string | null }) {
  const jar = await cookies();
  const previous = await readCookieToken();
  if (previous) await pool.query(`DELETE FROM auth_sessions WHERE token_hash=$1`, [tokenHash(previous)]).catch(() => null);
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO auth_sessions(token_hash,user_id,act_as_company_id,expires_at,ip,user_agent)
     VALUES($1,$2,$3,CURRENT_TIMESTAMP + ($4 * INTERVAL '1 day'),$5,$6)`,
    [tokenHash(token), user.id, user.act_as_company_id ?? null, ABSOLUTE_DAYS, meta?.ip?.slice(0,100) || null, meta?.userAgent?.slice(0,500) || null]
  );
  jar.set(cookieName(), token, { httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV === "production", path:"/", maxAge:ABSOLUTE_DAYS*86400 });
  if (cookieName() !== DEV_COOKIE) jar.delete(DEV_COOKIE);
}

export async function clearSessionCookie() {
  const jar = await cookies();
  for (const name of [PROD_COOKIE, DEV_COOKIE]) {
    const token = jar.get(name)?.value;
    if (token) await pool.query(`DELETE FROM auth_sessions WHERE token_hash=$1`, [tokenHash(token)]).catch(() => null);
    jar.delete(name);
  }
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = await readCookieToken();
  if (!token) return null;
  const result = await pool.query(
    `SELECT u.id,u.company_id,u.manager_id,u.role,u.name,u.email,u.phone,u.must_change_password,s.act_as_company_id,c.name act_as_company_name,
            substring(s.token_hash from 1 for 12) AS session_prefix,
            s.last_seen_at,s.expires_at
     FROM auth_sessions s JOIN users u ON u.id=s.user_id
     LEFT JOIN companies c ON c.id=s.act_as_company_id
     WHERE s.token_hash=$1 AND u.status='active' AND s.expires_at>CURRENT_TIMESTAMP
       AND s.last_seen_at>CURRENT_TIMESTAMP - ($2 * INTERVAL '1 hour') LIMIT 1`,
    [tokenHash(token), IDLE_HOURS]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5*60*1000) {
    void pool.query(`UPDATE auth_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=$1`, [tokenHash(token)]).catch(() => null);
  }
  return rowToUser(row);
});

export async function requireSession(options?: { allowPasswordChange?: boolean }) { const user=await getSessionUser(); if(!user) throw new AuthError("未登录",401); if(user.must_change_password && !options?.allowPasswordChange) throw new AuthError("首次登录必须先修改密码",403); return user; }
export function isActingAsCompany(user: SessionUser) { return user.role === "super_admin" && toId(user.act_as_company_id) != null; }
export function withCompanyContext(user: SessionUser) { return user; }

export async function enterCompanyView(companyId:number, companyName:string) {
  const user=await requireSession(); if(user.role!=="super_admin") throw new AuthError("仅超级管理员可进入公司业务视图",403);
  const next={...user,company_id:companyId,act_as_company_id:companyId,act_as_company_name:companyName}; await setSessionCookie(next); return next;
}
export async function exitCompanyView() {
  const user=await requireSession(); if(user.role!=="super_admin") throw new AuthError("当前不在公司业务视图",403);
  const next={...user,company_id:null,act_as_company_id:null,act_as_company_name:null}; await setSessionCookie(next); return next;
}

export class AuthError extends Error { status:number; constructor(message:string,status=403){super(message);this.status=status;} }

export async function loginWithAccountPassword(account:string,password:string,meta?:{ip?:string;userAgent?:string}) {
  const raw=account.trim(); if(!raw) throw new AuthError("请输入邮箱或手机号",400);
  const result=await pool.query(`SELECT id,company_id,manager_id,role,name,email,phone,password_hash,status,must_change_password FROM users WHERE lower(email)=lower($1) OR phone=$1 OR phone=regexp_replace($1,'\\s+','','g') LIMIT 1`,[raw]);
  const row=result.rows[0];
  if(!row || row.status!=="active" || !(await verifyPassword(password,String(row.password_hash||"")))) {
    if(row?.id) await pool.query(`UPDATE users SET failed_login_at=CURRENT_TIMESTAMP WHERE id=$1`,[row.id]).catch(()=>null);
    throw new AuthError("账号或密码错误",401);
  }
  const session=rowToUser(row); await setSessionCookie(session,meta);
  void pool.query(`UPDATE users SET last_login_at=CURRENT_TIMESTAMP,failed_login_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[row.id]).catch(()=>null);
  return session;
}
export async function loginWithEmailPassword(email:string,password:string){return loginWithAccountPassword(email,password);}
export async function loadUserById(id:number){const r=await pool.query(`SELECT id,company_id,manager_id,role,name,email,phone,status,must_change_password FROM users WHERE id=$1 AND status='active' LIMIT 1`,[id]);return r.rows[0]?rowToUser(r.rows[0]):null;}

export async function revokeUserSessions(userId:number,exceptTokenHash?:string){await pool.query(`DELETE FROM auth_sessions WHERE user_id=$1${exceptTokenHash?" AND token_hash<>$2":""}`,exceptTokenHash?[userId,exceptTokenHash]:[userId]);}
