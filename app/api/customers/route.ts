import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { buildOwnerFilter, getVisibleOwnerIds } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    const owners = await getVisibleOwnerIds(user);
    const filter = buildOwnerFilter(owners, user.company_id, "c");

    const params: unknown[] = [...filter.params];
    let sql = `SELECT c.*, u.name AS owner_name
      FROM customers c
      LEFT JOIN users u ON u.id = c.owner_id
      WHERE ${filter.sql}`;

    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (c.name ILIKE $${params.length} OR c.industry ILIKE $${params.length})`;
    }
    sql += " ORDER BY c.updated_at DESC LIMIT 200";

    const result = await pool.query(sql, params);
    return jsonOk(result.rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role === "super_admin") {
      return jsonError("超管请在公司上下文中操作", 403);
    }
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return jsonError("客户名称必填");

    const ownerId = body.owner_id ? Number(body.owner_id) : user.id;
    const result = await pool.query(
      `INSERT INTO customers
        (company_id, owner_id, name, industry, scale, source, status, tags, extra)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
       RETURNING *`,
      [
        user.company_id,
        ownerId,
        name,
        body.industry || null,
        body.scale || null,
        body.source || null,
        body.status || "active",
        JSON.stringify(body.tags || []),
        JSON.stringify(body.extra || {}),
      ]
    );

    await writeAuditLog({
      user,
      action: "customer.create",
      targetType: "customer",
      targetId: result.rows[0].id,
      summary: `创建客户 ${name}`,
    });

    return jsonOk(result.rows[0], 201);
  } catch (err) {
    return handleApiError(err);
  }
}
