import { NextRequest } from "next/server";
import pool from "@/lib/db";
import {
  requireSession,
  AuthError,
  isActingAsCompany,
  hashPassword,
} from "@/lib/auth";
import { crmRole } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { normalizePhone, normalizeEmail, isValidUserPhone } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

async function loadTarget(id: number) {
  const res = await pool.query(
    `SELECT id, company_id, manager_id, role, name, email, phone, status
     FROM users WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

/** 公司管理员可管本公司经理/销售；不可改自己或管理员；销售经理不可编辑成员 */
function assertCanManageUser(
  actor: Awaited<ReturnType<typeof requireSession>>,
  target: {
    id: number;
    company_id: number | null;
    manager_id: number | null;
    role: string;
  }
) {
  if (Number(target.id) === Number(actor.id)) {
    throw new AuthError("不能在此修改自己的账号，请到个人设置", 403);
  }
  if (target.role === "super_admin" || target.role === "company_admin") {
    throw new AuthError("不能修改管理员账号", 403);
  }

  const role = crmRole(actor);
  const companyId = actor.company_id;
  if (!companyId || Number(target.company_id) !== Number(companyId)) {
    throw new AuthError("无权操作该账号", 403);
  }

  if (role === "company_admin") {
    if (target.role !== "sales_manager" && target.role !== "sales") {
      throw new AuthError("无权操作该账号", 403);
    }
    return;
  }

  throw new AuthError("仅公司管理员可编辑团队成员", 403);
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireSession();
    const { id } = await params;
    const userId = Number(id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return jsonError("无效的用户 ID");
    }

    if (actor.role === "super_admin" && !isActingAsCompany(actor)) {
      return jsonError("请先进入公司视图后再操作成员", 403);
    }

    const target = await loadTarget(userId);
    if (!target) return jsonError("未找到账号", 404);
    assertCanManageUser(actor, target);

    const body = await request.json().catch(() => ({}));
    const updates: string[] = [];
    const vals: unknown[] = [];
    const push = (col: string, value: unknown) => {
      vals.push(value);
      updates.push(`${col} = $${vals.length}`);
    };
    const changed: string[] = [];

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) return jsonError("姓名必填");
      if (name !== target.name) {
        push("name", name);
        changed.push("姓名");
      }
    }

    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);
      if (email !== (target.email == null ? null : String(target.email).toLowerCase())) {
        if (email) {
          const dup = await pool.query(
            `SELECT id FROM users WHERE lower(email) = $1 AND id <> $2 LIMIT 1`,
            [email, userId]
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
      if (!isValidUserPhone(phone)) return jsonError("手机号格式不正确");
      const dup = await pool.query(
        `SELECT id FROM users WHERE phone = $1 AND id <> $2 LIMIT 1`,
        [phone, userId]
      );
      if (dup.rows[0]) return jsonError("该手机号已被其他账号使用");
      const prev = target.phone == null ? null : String(target.phone);
      if (phone !== prev) {
        push("phone", phone);
        changed.push("手机号");
      }
    }

    if (body.status !== undefined) {
      const status = String(body.status || "").trim();
      if (status !== "active" && status !== "inactive") {
        return jsonError("状态无效，可选：启用 / 停用");
      }
      if (status !== target.status) {
        push("status", status);
        changed.push(status === "active" ? "启用" : "停用");
      }
    }

    if (body.password !== undefined && body.password !== null && body.password !== "") {
      const password = String(body.password);
      if (password.length < 6) return jsonError("密码至少 6 位");
      push("password_hash", await hashPassword(password));
      changed.push("密码");
    }

    if (updates.length === 0) {
      return jsonOk({
        id: target.id,
        company_id: target.company_id,
        manager_id: target.manager_id,
        role: target.role,
        name: target.name,
        email: target.email,
        phone: target.phone,
        status: target.status,
      });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    vals.push(userId);
    const updated = await pool.query(
      `UPDATE users SET ${updates.join(", ")}
       WHERE id = $${vals.length}
       RETURNING id, company_id, manager_id, role, name, email, phone, status, created_at`,
      vals
    );

    await writeAuditLog({
      user: actor,
      action: "user.update",
      targetType: "user",
      targetId: userId,
      summary: `更新账号 ${updated.rows[0].phone || updated.rows[0].email || updated.rows[0].name}（${changed.join("、")}）`,
    });

    return jsonOk(updated.rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}
