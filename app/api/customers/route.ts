import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import {
  buildOwnerFilter,
  canSearchCustomersByOwner,
  getVisibleOwnerIds,
  narrowOwnerId,
} from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { normalizePhone, parseOwnerIdParam } from "@/lib/utils";
import { isCustomerStatus } from "@/types";
import { parsePageParams, resolvePagination } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    const sp = request.nextUrl.searchParams;
    const q = sp.get("q")?.trim() || "";
    const ownerQ = canSearchCustomersByOwner(user)
      ? sp.get("owner_q")?.trim() || ""
      : "";
    const from = sp.get("from")?.trim() || "";
    const to = sp.get("to")?.trim() || "";
    const statusParam = sp.get("status")?.trim() || "";
    const { paginate, page, pageSize } = parsePageParams(sp);

    const owners = await getVisibleOwnerIds(user);
    const filter = buildOwnerFilter(owners, user.company_id, "c");
    const scopedOwnerId = narrowOwnerId(owners, parseOwnerIdParam(sp.get("owner_id")));

    const params: unknown[] = [...filter.params];
    let where = filter.sql;

    if (scopedOwnerId != null) {
      params.push(scopedOwnerId);
      where += ` AND c.owner_id = $${params.length}`;
    }

    if (q) {
      params.push(`%${q}%`);
      where += ` AND (
        c.name ILIKE $${params.length}
        OR c.company_name ILIKE $${params.length}
        OR c.industry ILIKE $${params.length}
        OR c.phone ILIKE $${params.length}
      )`;
    }

    if (ownerQ) {
      params.push(`%${ownerQ}%`);
      where += ` AND u.name ILIKE $${params.length}`;
    }

    if (statusParam) {
      if (!isCustomerStatus(statusParam)) {
        return jsonError("客户状态无效，可选：跟进中 / 暂停 / 无效");
      }
      params.push(statusParam);
      where += ` AND c.status = $${params.length}`;
    }

    if (from) {
      params.push(from);
      where += ` AND c.created_at >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      where += ` AND c.created_at < ($${params.length}::date + INTERVAL '1 day')`;
    }

    const fromSql = `FROM customers c
      LEFT JOIN users u ON u.id = c.owner_id
      WHERE ${where}`;

    const selectSql = `SELECT c.*, u.name AS owner_name,
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.customer_id = c.id) AS opportunity_count,
      (SELECT MAX(f.followed_at) FROM follow_ups f WHERE f.customer_id = c.id) AS last_follow_at`;

    if (!paginate) {
      const result = await pool.query(
        `${selectSql} ${fromSql} ORDER BY c.updated_at DESC LIMIT 200`,
        params
      );
      return jsonOk(result.rows);
    }

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total ${fromSql}`, params);
    const total = countRes.rows[0]?.total ?? 0;
    const { meta, offset, limit } = resolvePagination(total, page, pageSize);

    const listParams = [...params, limit, offset];
    const result = await pool.query(
      `${selectSql} ${fromSql}
       ORDER BY c.updated_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    return jsonOk(result.rows, 200, meta);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role === "super_admin" && !user.act_as_company_id) {
      return jsonError("超管请先进入公司业务视图后再操作", 403);
    }
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const body = await request.json();
    const companyName = String(body.company_name || "").trim();
    const name = String(body.name || "").trim();
    if (!companyName) return jsonError("客户公司必填");
    if (!name) return jsonError("客户名必填");
    const phone = normalizePhone(body.phone);
    const status = body.status || "active";
    if (!isCustomerStatus(status)) {
      return jsonError("客户状态无效，可选：跟进中 / 暂停 / 无效");
    }

    const ownerId = body.owner_id ? Number(body.owner_id) : user.id;
    const toPool = body.pool_status === "public";
    const result = await pool.query(
      `INSERT INTO customers
        (company_id, owner_id, company_name, name, phone, industry, scale, source, status, pool_status, claimed_at, tags, extra)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)
       RETURNING *`,
      [
        user.company_id,
        toPool ? null : ownerId,
        companyName,
        name,
        phone,
        body.industry || null,
        body.scale || null,
        body.source || null,
        status,
        toPool ? "public" : "private",
        toPool ? null : new Date().toISOString(),
        JSON.stringify(body.tags || []),
        JSON.stringify(body.extra || {}),
      ]
    );

    await writeAuditLog({
      user,
      action: "customer.create",
      targetType: "customer",
      targetId: result.rows[0].id,
      summary: `创建客户 ${companyName} / ${name}${phone ? `（${phone}）` : ""}`,
    });

    return jsonOk(result.rows[0], 201);
  } catch (err) {
    return handleApiError(err);
  }
}
