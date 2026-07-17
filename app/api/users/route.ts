import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, hashPassword, AuthError } from "@/lib/auth";
import {
  canCreateSales,
  canCreateSalesManager,
} from "@/lib/permissions";
import { writeAuditLog, createNotification } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import type { UserRole } from "@/types";

export async function GET() {
  try {
    const user = await requireSession();
    if (user.role === "super_admin") {
      const result = await pool.query(
        `SELECT id, company_id, manager_id, role, name, email, phone, status, created_at
         FROM users ORDER BY id DESC LIMIT 500`
      );
      return jsonOk(result.rows);
    }
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    if (user.role === "company_admin") {
      const result = await pool.query(
        `SELECT id, company_id, manager_id, role, name, email, phone, status, created_at
         FROM users WHERE company_id = $1 ORDER BY id DESC`,
        [user.company_id]
      );
      return jsonOk(result.rows);
    }

    if (user.role === "sales_manager") {
      const result = await pool.query(
        `SELECT id, company_id, manager_id, role, name, email, phone, status, created_at
         FROM users
         WHERE company_id = $1 AND (id = $2 OR manager_id = $2)
         ORDER BY id DESC`,
        [user.company_id, user.id]
      );
      return jsonOk(result.rows);
    }

    return jsonError("无权查看团队", 403);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    const body = await request.json();
    const role = body.role as UserRole;
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "Sales123!");

    if (!name || !email || !role) return jsonError("姓名、邮箱、角色必填");

    if (role === "sales_manager" && !canCreateSalesManager(user.role)) {
      throw new AuthError("无权创建销售经理", 403);
    }
    if (role === "sales" && !canCreateSales(user.role)) {
      throw new AuthError("无权创建销售", 403);
    }
    if (role === "company_admin" || role === "super_admin") {
      throw new AuthError("请通过公司管理接口创建管理员", 403);
    }
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const managerId =
      role === "sales"
        ? body.manager_id
          ? Number(body.manager_id)
          : user.role === "sales_manager"
            ? user.id
            : null
        : null;

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users
        (company_id, manager_id, role, name, email, phone, password_hash, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
       RETURNING id, company_id, manager_id, role, name, email, phone, status, created_at`,
      [
        user.company_id,
        managerId,
        role,
        name,
        email,
        body.phone || null,
        passwordHash,
      ]
    );

    await writeAuditLog({
      user,
      action: "user.create",
      targetType: "user",
      targetId: result.rows[0].id,
      summary: `创建账号 ${email} (${role})`,
    });

    await createNotification({
      companyId: user.company_id,
      userId: result.rows[0].id,
      type: "account",
      title: "账号已创建",
      body: `欢迎加入，初始密码请联系管理员确认。`,
      link: "/settings",
    });

    return jsonOk(result.rows[0], 201);
  } catch (err) {
    return handleApiError(err);
  }
}
