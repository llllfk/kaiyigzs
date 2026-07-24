import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import {
  buildOwnerFilter,
  canSearchCustomersByOwner,
  getVisibleOwnerIds,
  narrowOwnerId,
} from "@/lib/permissions";
import { handleApiError, jsonError } from "@/lib/api";
import { parseOwnerIdParam } from "@/lib/utils";
import {
  CUSTOMER_STATUS_LABELS,
  isCustomerStatus,
  type CustomerStatus,
} from "@/types";
import {
  EXPORT_ROW_LIMIT,
  csvFileResponse,
  exportStamp,
  formatCsvDateTime,
  rowsToCsv,
} from "@/lib/csv";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id && user.role !== "super_admin") {
      return jsonError("缺少公司信息", 400);
    }

    const sp = request.nextUrl.searchParams;
    const q = sp.get("q")?.trim() || "";
    const ownerQ = canSearchCustomersByOwner(user)
      ? sp.get("owner_q")?.trim() || ""
      : "";
    const from = sp.get("from")?.trim() || "";
    const to = sp.get("to")?.trim() || "";
    const statusParam = sp.get("status")?.trim() || "";

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
        return jsonError("客户状态无效");
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

    params.push(EXPORT_ROW_LIMIT);
    const result = await pool.query(
      `SELECT c.company_name, c.name, c.phone, c.industry, c.source, c.status,
              COALESCE(c.pool_status, 'private') AS pool_status,
              u.name AS owner_name, c.created_at, c.updated_at,
              (SELECT MAX(f.followed_at) FROM follow_ups f WHERE f.customer_id = c.id) AS last_follow_at
       FROM customers c
       LEFT JOIN users u ON u.id = c.owner_id
       WHERE ${where}
       ORDER BY c.updated_at DESC
       LIMIT $${params.length}`,
      params
    );

    const headers = [
      "客户公司",
      "客户名",
      "手机号",
      "行业",
      "来源",
      "状态",
      "归属",
      "负责人",
      "上次跟进",
      "创建时间",
      "更新时间",
    ];
    const rows = result.rows.map((r) => [
      r.company_name || "",
      r.name || "",
      r.phone || "",
      r.industry || "",
      r.source || "",
      CUSTOMER_STATUS_LABELS[r.status as CustomerStatus] || r.status || "",
      r.pool_status === "public" ? "公海" : "私海",
      r.owner_name || "",
      formatCsvDateTime(r.last_follow_at),
      formatCsvDateTime(r.created_at),
      formatCsvDateTime(r.updated_at),
    ]);

    return csvFileResponse(`客户导出-${exportStamp()}.csv`, rowsToCsv(headers, rows));
  } catch (err) {
    return handleApiError(err);
  }
}
