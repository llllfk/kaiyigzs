import { NextRequest } from "next/server";
import pool from "@/lib/db";
import {
  requireSession,
  AuthError,
  isActingAsCompany,
  hashPassword,
  revokeUserSessions,
} from "@/lib/auth";
import { crmRole } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { normalizePhone, normalizeEmail, isValidUserPhone } from "@/lib/utils";
import { assertStrongPassword } from "@/lib/security";

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
      return jsonError("用户参数无效");
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
      assertStrongPassword(password);
      push("password_hash", await hashPassword(password));
      changed.push("密码");
    }

    if (body.role !== undefined) {
      const nextRole = String(body.role || "").trim();
      if (nextRole !== "sales" && nextRole !== "sales_manager") {
        return jsonError("角色无效，仅可设为销售经理或销售");
      }
      if (crmRole(actor) !== "company_admin") {
        throw new AuthError("仅公司管理员可修改角色", 403);
      }
      if (nextRole !== target.role) {
        push("role", nextRole);
        // 升为经理时清除上下级；降为销售时由下方 manager_id 指定所属经理
        if (nextRole === "sales_manager") {
          push("manager_id", null);
        }
        changed.push(
          nextRole === "sales_manager" ? "角色→销售经理" : "角色→销售"
        );
      }
    }

    const roleAfterUpdate =
      body.role !== undefined &&
      (body.role === "sales" || body.role === "sales_manager")
        ? String(body.role)
        : String(target.role);

    if (body.manager_id !== undefined) {
      if (crmRole(actor) !== "company_admin") {
        throw new AuthError("仅公司管理员可修改所属销售经理", 403);
      }
      if (roleAfterUpdate !== "sales") {
        if (body.manager_id != null && body.manager_id !== "") {
          return jsonError("仅销售账号可设置所属销售经理");
        }
      } else {
        const rawManagerId = Number(body.manager_id);
        if (!Number.isFinite(rawManagerId) || rawManagerId <= 0) {
          return jsonError("请选择所属销售经理");
        }
        if (rawManagerId === userId) {
          return jsonError("不能将自己设为所属销售经理");
        }
        const mgr = await pool.query(
          `SELECT id, name FROM users
           WHERE id = $1 AND company_id = $2 AND status = 'active' AND role = 'sales_manager'
           LIMIT 1`,
          [rawManagerId, target.company_id]
        );
        if (!mgr.rows[0]) {
          return jsonError("所属销售经理无效或不属于本公司");
        }
        const prevManagerId =
          target.manager_id == null ? null : Number(target.manager_id);
        if (prevManagerId !== rawManagerId) {
          push("manager_id", rawManagerId);
          changed.push(`所属经理→${mgr.rows[0].name || rawManagerId}`);
        } else if (
          String(target.role) !== "sales" &&
          roleAfterUpdate === "sales"
        ) {
          // 经理降为销售时即使选同一经理 ID，也需写入（原先经理账号 manager_id 多为空）
          push("manager_id", rawManagerId);
          changed.push(`所属经理→${mgr.rows[0].name || rawManagerId}`);
        }
      }
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

    // 经理降为销售：解除其名下销售的经理归属
    if (
      target.role === "sales_manager" &&
      updated.rows[0]?.role === "sales"
    ) {
      await pool.query(
        `UPDATE users SET manager_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE manager_id = $1 AND company_id = $2`,
        [userId, target.company_id]
      );
    }

    await writeAuditLog({
      user: actor,
      action: "user.update",
      targetType: "user",
      targetId: userId,
      summary: `更新账号 ${updated.rows[0].phone || updated.rows[0].email || updated.rows[0].name}（${changed.join("、")}）`,
    });

    await revokeUserSessions(Number(id));
    return jsonOk(updated.rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}
