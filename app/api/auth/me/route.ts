import { NextRequest } from "next/server";
import pool from "@/lib/db";
import {
  AuthError,
  getSessionUser,
  loadUserById,
  requireSession,
  setSessionCookie,
  hashPassword,
  verifyPassword,
  revokeUserSessions,
} from "@/lib/auth";
import { assertStrongPassword } from "@/lib/security";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { normalizePhone, normalizeEmail, isValidUserPhone } from "@/lib/utils";
import { writeAuditLog } from "@/lib/audit";
import {
  notificationTypesForUser,
  normalizeNotificationPrefs,
} from "@/lib/notification-prefs";
import { normalizeUiPrefs } from "@/lib/ui-prefs";
import { ensureUiPrefsColumn } from "@/lib/ui-prefs.server";
import type { SessionUser } from "@/types";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return jsonError("未登录", 401);
  const user = await loadUserById(session.id);
  if (!user) return jsonError("未登录", 401);

  await ensureUiPrefsColumn();
  const prefRes = await pool.query(
    `SELECT notification_prefs, ui_prefs FROM users WHERE id = $1`,
    [session.id]
  );
  const notification_prefs = prefRes.rows[0]?.notification_prefs || {};
  const ui_prefs = normalizeUiPrefs(prefRes.rows[0]?.ui_prefs);

  return jsonOk({
    ...user,
    company_id: session.act_as_company_id || user.company_id,
    act_as_company_id: session.act_as_company_id ?? null,
    act_as_company_name: session.act_as_company_name ?? null,
    notification_prefs,
    ui_prefs,
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession({ allowPasswordChange: true });
    const body = await request.json().catch(() => ({}));
    await ensureUiPrefsColumn();

    const current = await pool.query(
      `SELECT id, company_id, manager_id, role, name, email, phone, status, password_hash,
              notification_prefs, ui_prefs, must_change_password
       FROM users WHERE id = $1`,
      [session.id]
    );
    const row0 = current.rows[0];
    if (!row0) throw new AuthError("用户不存在", 404);

    const updates: string[] = [];
    const vals: unknown[] = [];
    const push = (col: string, value: unknown) => {
      vals.push(value);
      updates.push(`${col} = $${vals.length}`);
    };
    const changed: string[] = [];

    const onlyPrefsUpdate =
      body.ui_prefs !== undefined || body.notification_prefs !== undefined;
    const profileFieldsTouched =
      body.name !== undefined ||
      body.email !== undefined ||
      body.phone !== undefined ||
      (body.password !== undefined &&
        body.password !== null &&
        body.password !== "");

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) return jsonError("姓名必填");
      if (name !== row0.name) {
        push("name", name);
        changed.push("姓名");
      }
    }

    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);
      if (email !== (row0.email == null ? null : String(row0.email).toLowerCase())) {
        if (email) {
          const dup = await pool.query(
            `SELECT id FROM users WHERE lower(email) = $1 AND id <> $2 LIMIT 1`,
            [email, session.id]
          );
          if (dup.rows[0]) return jsonError("该邮箱已被其他账号使用");
        }
        push("email", email);
        changed.push("邮箱");
      }
    }

    if (body.phone !== undefined) {
      const phone = normalizePhone(body.phone);
      if (!phone) return jsonError("手机号必填");
      if (!isValidUserPhone(phone)) {
        return jsonError("手机号格式不正确", 400);
      }
      const dup = await pool.query(
        `SELECT id FROM users WHERE phone = $1 AND id <> $2 LIMIT 1`,
        [phone, session.id]
      );
      if (dup.rows[0]) return jsonError("该手机号已被其他账号使用", 400);
      const prev = row0.phone == null ? null : String(row0.phone);
      if (phone !== prev) {
        push("phone", phone);
        changed.push("手机号");
      }
    }

    const newPassword =
      body.password !== undefined && body.password !== null && body.password !== ""
        ? String(body.password)
        : "";
    if (newPassword) {
      assertStrongPassword(newPassword);
      const currentPassword = String(body.current_password || "");
      if (!currentPassword) return jsonError("修改密码请填写当前密码");
      const ok = await verifyPassword(currentPassword, String(row0.password_hash || ""));
      if (!ok) return jsonError("当前密码不正确", 400);
      push("password_hash", await hashPassword(newPassword));
      push("password_changed_at", new Date());
      push("must_change_password", false);
      changed.push("密码");
    }

    // 仅保存界面/通知偏好时，不强制先改密码
    if (
      row0.must_change_password &&
      !newPassword &&
      (profileFieldsTouched || !onlyPrefsUpdate)
    ) {
      return jsonError("首次登录必须先修改密码", 403);
    }

    if (body.notification_prefs !== undefined) {
      const sessionForRole: SessionUser = {
        id: row0.id,
        company_id: session.act_as_company_id ?? row0.company_id,
        manager_id: row0.manager_id,
        role: row0.role,
        name: row0.name,
        email: row0.email,
        phone: row0.phone,
        act_as_company_id: session.act_as_company_id ?? null,
        act_as_company_name: session.act_as_company_name ?? null,
      };
      const allowed = notificationTypesForUser(sessionForRole);
      const nextPrefs = normalizeNotificationPrefs(body.notification_prefs, allowed);
      push("notification_prefs", nextPrefs);
      changed.push("通知偏好");
    }

    if (body.ui_prefs !== undefined) {
      const nextUi = normalizeUiPrefs(body.ui_prefs);
      push("ui_prefs", nextUi);
      changed.push("界面偏好");
    }

    let row = row0;
    if (updates.length) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      vals.push(session.id);
      const result = await pool.query(
        `UPDATE users SET ${updates.join(", ")}
         WHERE id = $${vals.length}
         RETURNING id, company_id, manager_id, role, name, email, phone, status,
                   notification_prefs, ui_prefs, must_change_password`,
        vals
      );
      row = result.rows[0];
    }

    const user = {
      id: row.id,
      company_id: session.act_as_company_id ?? row.company_id,
      manager_id: row.manager_id,
      role: row.role,
      name: row.name,
      email: row.email,
      phone: row.phone,
      act_as_company_id: session.act_as_company_id ?? null,
      act_as_company_name: session.act_as_company_name ?? null,
    };
    if (newPassword) await revokeUserSessions(Number(user.id));
    await setSessionCookie(user);

    if (changed.length) {
      await writeAuditLog({
        user,
        action: "user.update_profile",
        targetType: "user",
        targetId: user.id,
        summary: `更新个人资料（${changed.join("、")}）`,
      });
    }

    return jsonOk({
      ...user,
      notification_prefs: row.notification_prefs || {},
      ui_prefs: normalizeUiPrefs(row.ui_prefs),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
