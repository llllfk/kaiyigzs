import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, hashPassword, AuthError, isActingAsCompany } from "@/lib/auth";
import {
  canCreateSales,
  canCreateSalesManager,
  crmRole,
} from "@/lib/permissions";
import { writeAuditLog, createNotification } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { normalizePhone, normalizeEmail, isValidUserPhone } from "@/lib/utils";
import { parsePageParams, resolvePagination } from "@/lib/pagination";
import type { UserRole } from "@/types";
import { assertStrongPassword } from "@/lib/security";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role === "super_admin" && !isActingAsCompany(user)) {
      const sp = request.nextUrl.searchParams;
      const companyId = sp.get("company_id");
      const q = sp.get("q")?.trim() || "";
      const status = sp.get("status")?.trim() || "";
      const { paginate, page, pageSize } = parsePageParams(sp);

      const params: unknown[] = [];
      let where = `WHERE 1=1`;

      if (companyId) {
        params.push(Number(companyId));
        where += ` AND u.company_id = $${params.length}`;
      }
      if (status) {
        params.push(status);
        where += ` AND u.status = $${params.length}`;
      }
      if (q) {
        params.push(`%${q}%`);
        where += ` AND (
          u.name ILIKE $${params.length}
          OR u.email ILIKE $${params.length}
          OR u.phone ILIKE $${params.length}
          OR c.name ILIKE $${params.length}
        )`;
      }

      const fromSql = `FROM users u
                 LEFT JOIN companies c ON c.id = u.company_id
                 LEFT JOIN users m ON m.id = u.manager_id
                 ${where}`;
      const orderSql = `ORDER BY
        CASE u.role
          WHEN 'company_admin' THEN 0
          WHEN 'sales_manager' THEN 1
          WHEN 'sales' THEN 2
          ELSE 3
        END,
        u.company_id NULLS FIRST,
        u.id DESC`;

      if (!paginate) {
        const result = await pool.query(
          `SELECT u.id, u.company_id, u.manager_id, u.role, u.name, u.email, u.phone,
                  u.status, u.created_at, u.last_login_at, c.name AS company_name,
                  m.name AS manager_name
           ${fromSql}
           ${orderSql}
           LIMIT 500`,
          params
        );
        return jsonOk(result.rows);
      }

      const countRes = await pool.query(`SELECT COUNT(*)::int AS total ${fromSql}`, params);
      const total = countRes.rows[0]?.total ?? 0;
      const { meta, offset, limit } = resolvePagination(total, page, pageSize);
      const listParams = [...params, limit, offset];

      const result = await pool.query(
        `SELECT u.id, u.company_id, u.manager_id, u.role, u.name, u.email, u.phone,
                u.status, u.created_at, u.last_login_at, c.name AS company_name,
                m.name AS manager_name
         ${fromSql}
         ${orderSql}
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      );
      return jsonOk(result.rows, 200, meta);
    }
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const sp = request.nextUrl.searchParams;
    const { paginate, page, pageSize } = parsePageParams(sp);

    const role = crmRole(user);
    if (role === "company_admin" || role === "sales_manager") {
      const params: unknown[] =
        role === "company_admin"
          ? [user.company_id]
          : [user.company_id, user.id];
      const whereSql =
        role === "company_admin"
          ? `WHERE u.company_id = $1`
          : `WHERE u.company_id = $1 AND (u.id = $2 OR u.manager_id = $2)`;
      const fromSql = `FROM users u
                 LEFT JOIN users m ON m.id = u.manager_id
                 ${whereSql}`;
      const selectSql = `SELECT u.id, u.company_id, u.manager_id, u.role, u.name, u.email, u.phone,
                u.status, u.created_at, u.last_login_at, m.name AS manager_name`;

      if (!paginate) {
        const result = await pool.query(
          `${selectSql}
           ${fromSql}
           ORDER BY u.id DESC`,
          params
        );
        return jsonOk(result.rows);
      }

      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total ${fromSql}`,
        params
      );
      const total = countRes.rows[0]?.total ?? 0;
      const { meta, offset, limit } = resolvePagination(total, page, pageSize);
      const listParams = [...params, limit, offset];
      const result = await pool.query(
        `${selectSql}
         ${fromSql}
         ORDER BY u.id DESC
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      );
      return jsonOk(result.rows, 200, meta);
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
    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    const password = String(body.password || "");

    if (!name || !phone || !role) return jsonError("姓名、手机号、角色必填");
    assertStrongPassword(password);
    if (!isValidUserPhone(phone)) return jsonError("手机号格式不正确", 400);

    if (role === "sales_manager" && !canCreateSalesManager(user)) {
      throw new AuthError("无权创建销售经理", 403);
    }
    if (role === "sales" && !canCreateSales(user)) {
      throw new AuthError("无权创建销售", 403);
    }
    if (role === "company_admin" || role === "super_admin") {
      throw new AuthError("请通过公司管理接口创建管理员", 403);
    }
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const phoneDup = await pool.query(`SELECT id FROM users WHERE phone = $1 LIMIT 1`, [phone]);
    if (phoneDup.rows[0]) return jsonError("该手机号已被其他账号使用", 400);
    if (email) {
      const emailDup = await pool.query(
        `SELECT id FROM users WHERE lower(email) = $1 LIMIT 1`,
        [email]
      );
      if (emailDup.rows[0]) return jsonError("该邮箱已被其他账号使用", 400);
    }

    let managerId: number | null = null;
    if (role === "sales") {
      if (user.role === "sales_manager") {
        managerId = user.id;
      } else {
        const rawManagerId = Number(body.manager_id);
        if (!Number.isFinite(rawManagerId) || rawManagerId <= 0) {
          return jsonError("创建销售须指定所属销售经理");
        }
        const mgr = await pool.query(
          `SELECT id FROM users
           WHERE id = $1 AND company_id = $2 AND status = 'active' AND role = 'sales_manager'
           LIMIT 1`,
          [rawManagerId, user.company_id]
        );
        if (!mgr.rows[0]) {
          return jsonError("所属销售经理无效或不属于本公司");
        }
        managerId = rawManagerId;
      }
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users
        (company_id, manager_id, role, name, email, phone, password_hash, status, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active',TRUE)
       RETURNING id, company_id, manager_id, role, name, email, phone, status, created_at`,
      [
        user.company_id,
        managerId,
        role,
        name,
        email,
        phone,
        passwordHash,
      ]
    );

    await writeAuditLog({
      user,
      action: "user.create",
      targetType: "user",
      targetId: result.rows[0].id,
      summary: `创建账号 ${phone}${email ? ` / ${email}` : ""} (${role})`,
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
