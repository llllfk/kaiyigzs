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
import { assertCanAccessCustomer } from "@/lib/permissions";
import { parsePageParams, resolvePagination } from "@/lib/pagination";
import { parseOwnerIdParam } from "@/lib/utils";
import { STAGE_LABELS } from "@/types";
import { recordOpportunityStageChange } from "@/lib/opportunity-stage-history";

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
    const sp = request.nextUrl.searchParams;
    const { paginate, page, pageSize } = parsePageParams(sp);
    const q = sp.get("q")?.trim() || "";
    const stages = parseStagesParam(sp);
    const openOnly = sp.get("open") === "1";
    const ownerQ = canSearchCustomersByOwner(user)
      ? sp.get("owner_q")?.trim() || ""
      : "";
    const from = sp.get("from")?.trim() || "";
    const to = sp.get("to")?.trim() || "";
    const dateField =
      sp.get("dateField") === "updated_at" ? "updated_at" : "created_at";
    const owners = await getVisibleOwnerIds(user);
    const filter = buildOwnerFilter(owners, user.company_id, "o", {
      includePoolStatus: false,
    });
    const scopedOwnerId = narrowOwnerId(owners, parseOwnerIdParam(sp.get("owner_id")));

    const params = [...filter.params];
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
        OR u.name ILIKE $${params.length}
      )`;
    }
    if (from) {
      params.push(from);
      where += ` AND o.${dateField} >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      where += ` AND o.${dateField} < ($${params.length}::date + INTERVAL '1 day')`;
    }

    const fromSql = `FROM opportunities o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = o.owner_id
       ${where}`;
    const selectSql = `SELECT o.*,
         TRIM(BOTH ' · ' FROM CONCAT_WS(' · ', NULLIF(c.company_name,''), NULLIF(c.name,''))) AS customer_name,
         c.public_id AS customer_public_id,
         u.name AS owner_name`;

    if (!paginate) {
      const result = await pool.query(
        `${selectSql} ${fromSql} ORDER BY o.created_at DESC LIMIT 200`,
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
      `${selectSql} ${fromSql}
       ORDER BY o.created_at DESC
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
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const body = await request.json();
    const customerId = Number(body.customer_id);
    const title = String(body.title || "").trim();
    if (!customerId || !title) return jsonError("客户与商机标题必填");

    await assertCanAccessCustomer(user, customerId);

    const result = await pool.query(
      `INSERT INTO opportunities
        (company_id, customer_id, owner_id, title, stage, amount, expected_close_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        user.company_id,
        customerId,
        body.owner_id ? Number(body.owner_id) : user.id,
        title,
        body.stage || "lead",
        body.amount != null ? Number(body.amount) : null,
        body.expected_close_date || null,
      ]
    );

    await writeAuditLog({
      user,
      action: "opportunity.create",
      targetType: "opportunity",
      targetId: result.rows[0].id,
      summary: `创建商机 ${title}`,
    });

    const initialStage = String(body.stage || "lead");
    await recordOpportunityStageChange({
      user,
      companyId: user.company_id,
      opportunityId: Number(result.rows[0].id),
      fromStage: null,
      toStage: initialStage,
      reason: "创建商机",
      source: "create",
    });

    return jsonOk(result.rows[0], 201);
  } catch (err) {
    return handleApiError(err);
  }
}
