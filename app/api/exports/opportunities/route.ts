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
import { STAGE_LABELS } from "@/types";
import {
  EXPORT_ROW_LIMIT,
  csvFileResponse,
  exportStamp,
  formatCsvDateTime,
  rowsToCsv,
} from "@/lib/csv";

function formatCsvDateOnly(value?: string | Date | null): string {
  if (!value) return "";
  if (typeof value === "string") {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const VALID_STAGES = new Set(Object.keys(STAGE_LABELS));

function parseStagesParam(sp: URLSearchParams): string[] {
  const multi = sp.get("stages")?.trim() || "";
  if (multi) {
    return [
      ...new Set(
        multi
          .split(",")
          .map((s) => s.trim())
          .filter((s) => VALID_STAGES.has(s))
      ),
    ];
  }
  const single = sp.get("stage")?.trim() || "";
  if (single && VALID_STAGES.has(single)) return [single];
  return [];
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id && user.role !== "super_admin") {
      return jsonError("缺少公司信息", 400);
    }

    const sp = request.nextUrl.searchParams;
    const q = sp.get("q")?.trim() || "";
    const stages = parseStagesParam(sp);
    const openOnly = sp.get("open") === "1";
    const ownerQ = canSearchCustomersByOwner(user)
      ? sp.get("owner_q")?.trim() || ""
      : "";
    const from = sp.get("from")?.trim() || "";
    const to = sp.get("to")?.trim() || "";

    const owners = await getVisibleOwnerIds(user);
    const filter = buildOwnerFilter(owners, user.company_id, "o", {
      includePoolStatus: false,
    });
    const scopedOwnerId = narrowOwnerId(owners, parseOwnerIdParam(sp.get("owner_id")));

    const params: unknown[] = [...filter.params];
    let where = `WHERE ${filter.sql}`;

    if (scopedOwnerId != null) {
      params.push(scopedOwnerId);
      where += ` AND o.owner_id = $${params.length}`;
    }
    if (stages.length === 1) {
      params.push(stages[0]);
      where += ` AND o.stage = $${params.length}`;
    } else if (stages.length > 1) {
      params.push(stages);
      where += ` AND o.stage = ANY($${params.length}::text[])`;
    } else if (openOnly) {
      where += ` AND o.stage NOT IN ('won','lost')`;
    }
    if (ownerQ) {
      params.push(`%${ownerQ}%`);
      where += ` AND u.name ILIKE $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (
        o.title ILIKE $${params.length}
        OR c.company_name ILIKE $${params.length}
        OR c.name ILIKE $${params.length}
      )`;
    }
    if (from) {
      params.push(from);
      where += ` AND o.created_at >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      where += ` AND o.created_at < ($${params.length}::date + INTERVAL '1 day')`;
    }

    params.push(EXPORT_ROW_LIMIT);
    const result = await pool.query(
      `SELECT o.title, o.stage, o.amount, o.expected_close_date, o.created_at, o.updated_at,
              TRIM(BOTH ' · ' FROM CONCAT_WS(' · ', NULLIF(c.company_name,''), NULLIF(c.name,''))) AS customer_name,
              u.name AS owner_name
       FROM opportunities o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = o.owner_id
       ${where}
       ORDER BY o.updated_at DESC
       LIMIT $${params.length}`,
      params
    );

    const headers = [
      "商机名称",
      "客户",
      "阶段",
      "金额",
      "Expected Close Date",
      "负责人",
      "创建时间",
      "更新时间",
    ];
    const rows = result.rows.map((r) => [
      r.title || "",
      r.customer_name || "",
      STAGE_LABELS[r.stage as keyof typeof STAGE_LABELS] || r.stage || "",
      r.amount != null ? Number(r.amount) : "",
      formatCsvDateOnly(r.expected_close_date),
      r.owner_name || "",
      formatCsvDateTime(r.created_at),
      formatCsvDateTime(r.updated_at),
    ]);

    return csvFileResponse(`商机导出-${exportStamp()}.csv`, rowsToCsv(headers, rows));
  } catch (err) {
    return handleApiError(err);
  }
}
