import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { normalizePhone } from "@/lib/utils";
import { isCustomerStatus } from "@/types";
import { parsePageParams } from "@/lib/pagination";
import {
  CustomersListError,
  listCustomers,
} from "@/lib/customers-list";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    const sp = request.nextUrl.searchParams;
    const { paginate, page, pageSize } = parsePageParams(sp);

    const { rows, meta } = await listCustomers(user, {
      q: sp.get("q") || "",
      owner_q: sp.get("owner_q") || "",
      from: sp.get("from") || "",
      to: sp.get("to") || "",
      status: sp.get("status") || "",
      owner_id: sp.get("owner_id"),
      paginate,
      page,
      pageSize,
    });

    return paginate ? jsonOk(rows, 200, meta) : jsonOk(rows);
  } catch (err) {
    if (err instanceof CustomersListError) {
      return jsonError(err.message, err.status);
    }
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
