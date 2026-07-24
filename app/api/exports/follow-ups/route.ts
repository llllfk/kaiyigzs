import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import {
  buildOwnerFilter,
  canSearchCustomersByOwner,
  getVisibleOwnerIds,
} from "@/lib/permissions";
import { handleApiError, jsonError } from "@/lib/api";
import { FOLLOW_TYPE_LABELS } from "@/types";
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

    const owners = await getVisibleOwnerIds(user);
    // 跟进按客户归属可见范围导出（与客户列表一致）
    const filter = buildOwnerFilter(owners, user.company_id, "c");

    const params: unknown[] = [...filter.params];
    let where = filter.sql;

    if (q) {
      params.push(`%${q}%`);
      where += ` AND (
        f.content ILIKE $${params.length}
        OR c.name ILIKE $${params.length}
        OR c.company_name ILIKE $${params.length}
      )`;
    }
    if (ownerQ) {
      params.push(`%${ownerQ}%`);
      where += ` AND u.name ILIKE $${params.length}`;
    }
    if (from) {
      params.push(from);
      where += ` AND f.followed_at >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      where += ` AND f.followed_at < ($${params.length}::date + INTERVAL '1 day')`;
    }

    params.push(EXPORT_ROW_LIMIT);
    const result = await pool.query(
      `SELECT f.type, f.content, f.followed_at, f.created_at,
              c.company_name, c.name AS customer_contact,
              u.name AS owner_name,
              o.title AS opportunity_title
       FROM follow_ups f
       JOIN customers c ON c.id = f.customer_id
       LEFT JOIN users u ON u.id = f.owner_id
       LEFT JOIN opportunities o ON o.id = f.opportunity_id
       WHERE ${where}
       ORDER BY f.followed_at DESC
       LIMIT $${params.length}`,
      params
    );

    const headers = [
      "跟进时间",
      "客户公司",
      "客户名",
      "方式",
      "内容",
      "关联商机",
      "跟进人",
      "创建时间",
    ];
    const rows = result.rows.map((r) => [
      formatCsvDateTime(r.followed_at),
      r.company_name || "",
      r.customer_contact || "",
      FOLLOW_TYPE_LABELS[r.type] || r.type || "",
      r.content || "",
      r.opportunity_title || "",
      r.owner_name || "",
      formatCsvDateTime(r.created_at),
    ]);

    return csvFileResponse(`跟进导出-${exportStamp()}.csv`, rowsToCsv(headers, rows));
  } catch (err) {
    return handleApiError(err);
  }
}
