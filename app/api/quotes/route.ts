import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import {
  assertCanAccessCustomer,
  buildOwnerFilter,
  getVisibleOwnerIds,
} from "@/lib/permissions";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import {
  loadQuoteItems,
  replaceQuoteItems,
  type QuoteItemInput,
} from "@/lib/quotes";
import { parsePageParams, resolvePagination } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const sp = request.nextUrl.searchParams;
    const scope = sp.get("scope") || "mine"; // mine | pending | opportunity
    const opportunityId = sp.get("opportunity_id");
    const owners = await getVisibleOwnerIds(user);
    const { paginate, page, pageSize } = parsePageParams(sp, { always: true });

    if (scope === "pending") {
      const whereSql = `q.company_id = $1
           AND q.status = 'pending_approval'
           AND (q.approver_id = $2 OR $3::boolean)`;
      const baseParams = [
        user.company_id,
        user.id,
        user.role === "company_admin" || Boolean(user.act_as_company_id),
      ];
      const fromSql = `FROM quotes q
         JOIN opportunities o ON o.id = q.opportunity_id
         JOIN customers c ON c.id = q.customer_id
         LEFT JOIN users u ON u.id = q.owner_id
         LEFT JOIN users a ON a.id = q.approver_id
         LEFT JOIN users s ON s.id = q.created_by
         WHERE ${whereSql}`;
      const selectSql = `SELECT q.*,
                o.title AS opportunity_title,
                TRIM(BOTH ' · ' FROM CONCAT_WS(' · ', NULLIF(c.company_name,''), NULLIF(c.name,''))) AS customer_name,
                u.name AS owner_name,
                a.name AS approver_name,
                COALESCE(s.name, u.name) AS submitter_name`;

      if (!paginate) {
        const result = await pool.query(
          `${selectSql} ${fromSql} ORDER BY q.submitted_at DESC NULLS LAST, q.id DESC LIMIT 200`,
          baseParams
        );
        return jsonOk(result.rows);
      }

      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total ${fromSql}`,
        baseParams
      );
      const total = countRes.rows[0]?.total ?? 0;
      const { meta, offset, limit } = resolvePagination(total, page, pageSize);
      const listParams = [...baseParams, limit, offset];
      const result = await pool.query(
        `${selectSql} ${fromSql}
         ORDER BY q.submitted_at DESC NULLS LAST, q.id DESC
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      );
      return jsonOk(result.rows, 200, meta);
    }

    if (scope === "opportunity" && opportunityId) {
      const opp = await pool.query(
        `SELECT id, customer_id, owner_id FROM opportunities WHERE id = $1 AND company_id = $2`,
        [Number(opportunityId), user.company_id]
      );
      if (!opp.rows[0]) return jsonError("商机不存在", 404);
      await assertCanAccessCustomer(user, Number(opp.rows[0].customer_id));

      const result = await pool.query(
        `SELECT q.*,
                o.title AS opportunity_title,
                u.name AS owner_name,
                a.name AS approver_name
         FROM quotes q
         JOIN opportunities o ON o.id = q.opportunity_id
         LEFT JOIN users u ON u.id = q.owner_id
         LEFT JOIN users a ON a.id = q.approver_id
         WHERE q.opportunity_id = $1 AND q.company_id = $2
         ORDER BY q.updated_at DESC NULLS LAST, q.id DESC`,
        [Number(opportunityId), user.company_id]
      );
      return jsonOk(result.rows);
    }

    const filter = buildOwnerFilter(owners, user.company_id, "q", {
      includePoolStatus: false,
    });
    const status = String(sp.get("status") || "").trim();
    const customerQ = String(sp.get("customer_q") || "").trim();
    const opportunityIdFilter = Number(sp.get("opportunity_id") || 0);
    const opportunityQ = String(sp.get("opportunity_q") || "").trim();

    const whereParts = [filter.sql];
    const params = [...filter.params];

    if (status) {
      params.push(status);
      whereParts.push(`q.status = $${params.length}`);
    }
    if (customerQ) {
      params.push(`%${customerQ}%`);
      whereParts.push(
        `(c.name ILIKE $${params.length} OR c.company_name ILIKE $${params.length})`
      );
    }
    if (opportunityIdFilter > 0) {
      params.push(opportunityIdFilter);
      whereParts.push(`q.opportunity_id = $${params.length}`);
    } else if (opportunityQ) {
      params.push(`%${opportunityQ}%`);
      whereParts.push(`o.title ILIKE $${params.length}`);
    }

    const fromSql = `FROM quotes q
       JOIN opportunities o ON o.id = q.opportunity_id
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN users u ON u.id = q.owner_id
       LEFT JOIN users a ON a.id = q.approver_id
       WHERE ${whereParts.join(" AND ")}`;
    const selectSql = `SELECT q.*,
              o.title AS opportunity_title,
              TRIM(BOTH ' · ' FROM CONCAT_WS(' · ', NULLIF(c.company_name,''), NULLIF(c.name,''))) AS customer_name,
              u.name AS owner_name,
              a.name AS approver_name,
              COALESCE(
                (SELECT name FROM users WHERE id = q.created_by),
                u.name
              ) AS submitter_name`;

    if (!paginate) {
      const result = await pool.query(
        `${selectSql} ${fromSql} ORDER BY q.updated_at DESC LIMIT 200`,
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
       ORDER BY q.updated_at DESC
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
    const opportunityId = Number(body.opportunity_id);
    if (!opportunityId) return jsonError("请选择商机");

    const opp = await pool.query(
      `SELECT id, customer_id, owner_id, title FROM opportunities
       WHERE id = $1 AND company_id = $2`,
      [opportunityId, user.company_id]
    );
    if (!opp.rows[0]) return jsonError("商机不存在", 404);
    await assertCanAccessCustomer(user, Number(opp.rows[0].customer_id));

    const items = (Array.isArray(body.items) ? body.items : []) as QuoteItemInput[];
    const title =
      String(body.title || "").trim() || `${opp.rows[0].title} 报价`;

    const verRes = await pool.query(
      `SELECT COALESCE(MAX(version), 0)::int AS v FROM quotes WHERE opportunity_id = $1`,
      [opportunityId]
    );
    const version = (verRes.rows[0]?.v || 0) + 1;

    const inserted = await pool.query(
      `INSERT INTO quotes
        (company_id, opportunity_id, customer_id, owner_id, version, status, title,
         valid_until, note, parent_quote_id, created_by)
       VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        user.company_id,
        opportunityId,
        opp.rows[0].customer_id,
        opp.rows[0].owner_id,
        version,
        title,
        body.valid_until || null,
        String(body.note || "").trim() || null,
        body.parent_quote_id ? Number(body.parent_quote_id) : null,
        user.id,
      ]
    );
    const quote = inserted.rows[0];

    if (items.length) {
      await replaceQuoteItems(quote.id, items);
    } else {
      await replaceQuoteItems(quote.id, [
        { name: "服务/产品", qty: 1, unit_price: 0, discount_pct: 0 },
      ]);
    }

    const fresh = await pool.query(`SELECT * FROM quotes WHERE id = $1`, [quote.id]);
    const quoteItems = await loadQuoteItems(quote.id);

    await writeAuditLog({
      user,
      action: "quote.create",
      targetType: "quote",
      targetId: quote.id,
      summary: `创建报价 V${version}（商机 ${opp.rows[0].title}）`,
    });

    return jsonOk({ ...fresh.rows[0], items: quoteItems }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
