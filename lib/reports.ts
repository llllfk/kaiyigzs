import pool from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { crmRole, getVisibleOwnerIds } from "@/lib/permissions";
import type { SessionUser } from "@/types";

export type ReportPeriodType = "month" | "quarter";
const REPORT_START_DATE = "2026-07-01";

export type ReportPeriod = {
  type: ReportPeriodType;
  key: string;
  from: string;
  to: string;
  label: string;
};

export function reportPeriod(type: string, key: string): ReportPeriod {
  if (type === "month" && /^\d{4}-(0[1-9]|1[0-2])$/.test(key)) {
    const [year, month] = key.split("-").map(Number);
    const from = `${key}-01`;
    if (from < REPORT_START_DATE) throw new AuthError("统计周期最早为2026年7月", 400);
    return { type: "month" as const, key, from, to: month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`, label: `${year}年${month}月` };
  }
  const match = key.match(/^(\d{4})-Q([1-4])$/);
  if (type === "quarter" && match) {
    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const startMonth = (quarter - 1) * 3 + 1;
    const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    if (from < REPORT_START_DATE) throw new AuthError("统计周期最早为2026年第3季度", 400);
    const endMonth = startMonth + 3;
    return { type: "quarter" as const, key, from, to: endMonth > 12 ? `${year + 1}-01-01` : `${year}-${String(endMonth).padStart(2, "0")}-01`, label: `${year}年第${quarter}季度` };
  }
  throw new AuthError("报表周期无效", 400);
}

/** 按 key 推断周期；多选时按各月并集统计（可不连续），连续则标签用起止月 */
export function reportPeriods(keys: string[]): ReportPeriod & {
  keys: string[];
  ranges: { from: string; to: string }[];
  contiguous: boolean;
} {
  const unique = [
    ...new Set(
      keys
        .map((k) => String(k || "").trim())
        .filter(Boolean)
    ),
  ];
  if (unique.length === 0) throw new AuthError("请选择统计周期", 400);

  const periods = unique.map((key) => {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return reportPeriod("month", key);
    if (/^\d{4}-Q[1-4]$/.test(key)) return reportPeriod("quarter", key);
    throw new AuthError("报表周期无效", 400);
  });
  periods.sort((a, b) => a.from.localeCompare(b.from));

  const monthPeriods = periods.filter((p) => p.type === "month");
  let contiguous = periods.length === 1;
  if (monthPeriods.length === periods.length && monthPeriods.length > 1) {
    const indexes = monthPeriods.map((p) => {
      const [y, m] = p.key.split("-").map(Number);
      return y * 12 + m;
    });
    contiguous = indexes.every((v, i) => i === 0 || v === indexes[i - 1] + 1);
  }

  const first = periods[0];
  const last = periods[periods.length - 1];
  let label = periods.map((p) => p.label).join("、");
  if (contiguous && monthPeriods.length === periods.length && periods.length > 1) {
    const [y1, m1] = first.key.split("-").map(Number);
    const [y2, m2] = last.key.split("-").map(Number);
    label =
      y1 === y2
        ? `${y1}年${m1}月–${m2}月`
        : `${y1}年${m1}月–${y2}年${m2}月`;
  }

  return {
    type: first.type,
    key: periods.map((p) => p.key).join(","),
    keys: periods.map((p) => p.key),
    ranges: periods.map((p) => ({ from: p.from, to: p.to })),
    contiguous,
    from: first.from,
    to: last.to,
    label,
  };
}

/** col 落在任意所选半开区间 [from, to) 内 */
function inAnyRangeSql(col: string, fromParam: number, toParam: number) {
  return `EXISTS (
    SELECT 1 FROM unnest($${fromParam}::date[], $${toParam}::date[]) AS r(a, b)
    WHERE ${col} >= r.a AND ${col} < r.b
  )`;
}

export async function resolveReportScope(
  user: SessionUser,
  requestedOwnerId: number | null
) {
  if (!user.company_id) throw new AuthError("缺少公司信息", 400);
  const visible = await getVisibleOwnerIds(user);
  const role = crmRole(user);

  if (visible === "all" || visible === "company") {
    if (requestedOwnerId == null) {
      return {
        ownerIds: null as number[] | null,
        scope: "company" as const,
        scopeLabel: "全公司",
      };
    }
    const result = await pool.query(
      `SELECT id, name FROM users
       WHERE id=$1 AND company_id=$2 AND status='active'
         AND role IN ('sales','sales_manager')`,
      [requestedOwnerId, user.company_id]
    );
    if (!result.rows[0]) throw new AuthError("所选销售人员无效", 400);
    return {
      ownerIds: [Number(requestedOwnerId)],
      scope: "owner" as const,
      scopeLabel: String(result.rows[0].name || "指定成员"),
    };
  }

  const allowed = (Array.isArray(visible) ? visible : [user.id]).map(Number);

  if (requestedOwnerId == null) {
    if (role === "sales") {
      return {
        ownerIds: [Number(user.id)],
        scope: "self" as const,
        scopeLabel: "本人",
      };
    }
    return {
      ownerIds: allowed,
      scope: "team" as const,
      scopeLabel: "本人及下属",
    };
  }

  if (!allowed.some((id) => id === Number(requestedOwnerId))) {
    throw new AuthError("无权查看该成员数据", 403);
  }
  const result = await pool.query(
    `SELECT id, name FROM users WHERE id=$1 AND company_id=$2 AND status='active'`,
    [requestedOwnerId, user.company_id]
  );
  return {
    ownerIds: [Number(requestedOwnerId)],
    scope: role === "sales" ? ("self" as const) : ("owner" as const),
    scopeLabel: String(result.rows[0]?.name || "指定成员"),
  };
}

export type ReportSalesRow = {
  id: number;
  name: string;
  role: string;
  customers: number;
  open_opps: number;
  open_tasks: number;
  new_customers: number;
  follow_ups: number;
  opportunities: number;
  opportunity_amount: number;
  won_count: number;
  won_amount: number;
};

function num(v: unknown) {
  return Number(v) || 0;
}

/** 成员人效 + 当前存量；ownerIds=null 全公司，否则仅这些成员 */
export async function getReportSalesRows(
  companyId: number,
  ownerIds: number[] | null,
  ranges: { from: string; to: string }[]
): Promise<ReportSalesRow[]> {
  if (!ranges.length) throw new AuthError("请选择统计周期", 400);
  const fromDates = ranges.map((r) => r.from);
  const toDates = ranges.map((r) => r.to);
  const params: unknown[] =
    ownerIds == null
      ? [companyId, fromDates, toDates]
      : [companyId, fromDates, toDates, ownerIds];
  const inCreated = inAnyRangeSql("c.created_at", 2, 3);
  const inFollowed = inAnyRangeSql("f.followed_at", 2, 3);
  const inOppCreated = inAnyRangeSql("o.created_at", 2, 3);
  const inOppUpdated = inAnyRangeSql("o.updated_at", 2, 3);
  const ownerClause =
    ownerIds == null ? "" : " AND u.id = ANY($4::bigint[])";
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.role,
      COALESCE(stock_c.cnt, 0)::int AS customers,
      COALESCE(stock_o.cnt, 0)::int AS open_opps,
      COALESCE(stock_t.cnt, 0)::int AS open_tasks,
      (SELECT COUNT(*)::int FROM customers c WHERE c.company_id=$1 AND c.owner_id=u.id AND ${inCreated}) new_customers,
      (SELECT COUNT(*)::int FROM follow_ups f WHERE f.company_id=$1 AND f.owner_id=u.id AND ${inFollowed}) follow_ups,
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.company_id=$1 AND o.owner_id=u.id AND ${inOppCreated}) opportunities,
      (SELECT COALESCE(SUM(o.amount),0)::numeric FROM opportunities o WHERE o.company_id=$1 AND o.owner_id=u.id AND ${inOppCreated}) opportunity_amount,
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.company_id=$1 AND o.owner_id=u.id AND o.stage='won' AND ${inOppUpdated}) won_count,
      (SELECT COALESCE(SUM(o.amount),0)::numeric FROM opportunities o WHERE o.company_id=$1 AND o.owner_id=u.id AND o.stage='won' AND ${inOppUpdated}) won_amount
      FROM users u
      LEFT JOIN (
        SELECT owner_id, COUNT(*)::int AS cnt
        FROM customers
        WHERE company_id=$1 AND COALESCE(pool_status, 'private') = 'private'
        GROUP BY owner_id
      ) stock_c ON stock_c.owner_id = u.id
      LEFT JOIN (
        SELECT owner_id, COUNT(*)::int AS cnt
        FROM opportunities
        WHERE company_id=$1 AND stage NOT IN ('won', 'lost')
        GROUP BY owner_id
      ) stock_o ON stock_o.owner_id = u.id
      LEFT JOIN (
        SELECT owner_id, COUNT(*)::int AS cnt
        FROM tasks
        WHERE company_id=$1 AND status = 'pending'
        GROUP BY owner_id
      ) stock_t ON stock_t.owner_id = u.id
      WHERE u.company_id=$1 AND u.status='active' AND u.role IN ('sales','sales_manager')${ownerClause}
      ORDER BY opportunity_amount DESC`,
    params
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name || ""),
    role: String(r.role || ""),
    customers: num(r.customers),
    open_opps: num(r.open_opps),
    open_tasks: num(r.open_tasks),
    new_customers: num(r.new_customers),
    follow_ups: num(r.follow_ups),
    opportunities: num(r.opportunities),
    opportunity_amount: num(r.opportunity_amount),
    won_count: num(r.won_count),
    won_amount: num(r.won_amount),
  }));
}

export async function getReportSnapshot(
  companyId: number,
  ownerIds: number[] | null,
  ranges: { from: string; to: string }[]
) {
  if (!ranges.length) throw new AuthError("请选择统计周期", 400);
  const fromDates = ranges.map((r) => r.from);
  const toDates = ranges.map((r) => r.to);
  const owner =
    ownerIds == null ? "" : " AND owner_id = ANY($4::bigint[])";
  const customerOwner =
    ownerIds == null ? "" : " AND c.owner_id = ANY($4::bigint[])";
  const oOwner =
    ownerIds == null ? "" : " AND o.owner_id = ANY($4::bigint[])";
  const fOwner =
    ownerIds == null ? "" : " AND f.owner_id = ANY($4::bigint[])";
  const qOwner =
    ownerIds == null ? "" : " AND q.owner_id = ANY($4::bigint[])";
  const params: unknown[] =
    ownerIds == null
      ? [companyId, fromDates, toDates]
      : [companyId, fromDates, toDates, ownerIds];
  const peopleParams =
    ownerIds == null ? [companyId] : [companyId, ownerIds];
  const peopleSql =
    ownerIds == null
      ? `SELECT id,name,role FROM users WHERE company_id=$1 AND status='active' AND role IN ('sales','sales_manager') ORDER BY name`
      : `SELECT id,name,role FROM users WHERE company_id=$1 AND status='active' AND role IN ('sales','sales_manager') AND id = ANY($2::bigint[]) ORDER BY name`;
  const stagesParams =
    ownerIds == null ? [companyId] : [companyId, ownerIds];
  const stagesSql =
    ownerIds == null
      ? `SELECT stage,COUNT(*)::int count,COALESCE(SUM(amount),0)::numeric amount FROM opportunities WHERE company_id=$1 GROUP BY stage ORDER BY count DESC`
      : `SELECT stage,COUNT(*)::int count,COALESCE(SUM(amount),0)::numeric amount FROM opportunities WHERE company_id=$1 AND owner_id = ANY($2::bigint[]) GROUP BY stage ORDER BY count DESC`;

  const inCreated = inAnyRangeSql("created_at", 2, 3);
  const inFollowed = inAnyRangeSql("followed_at", 2, 3);
  const inCCreated = inAnyRangeSql("c.created_at", 2, 3);
  const inOCreated = inAnyRangeSql("o.created_at", 2, 3);
  const inFFollowed = inAnyRangeSql("f.followed_at", 2, 3);
  const inQCreated = inAnyRangeSql("q.created_at", 2, 3);
  const inICreated = inAnyRangeSql("i.created_at", 2, 3);
  const inCmCreated = inAnyRangeSql("cm.created_at", 2, 3);
  const inUpdated = inAnyRangeSql("updated_at", 2, 3);

  const [company, people, summary, stages, sales, customers, opportunities, followUps, quotes, painPoints, competitors] = await Promise.all([
    pool.query(`SELECT name FROM companies WHERE id=$1`, [companyId]),
    pool.query(peopleSql, peopleParams),
    pool.query(`SELECT
      (SELECT COUNT(*) FROM customers WHERE company_id=$1 AND ${inCreated}${owner})::int AS new_customers,
      (SELECT COUNT(*) FROM follow_ups WHERE company_id=$1 AND ${inFollowed}${owner})::int AS follow_ups,
      (SELECT COUNT(*) FROM opportunities WHERE company_id=$1 AND ${inCreated}${owner})::int AS new_opportunities,
      (SELECT COALESCE(SUM(amount),0) FROM opportunities WHERE company_id=$1 AND ${inCreated}${owner})::numeric AS opportunity_amount,
      (SELECT COUNT(*) FROM opportunities WHERE company_id=$1 AND stage='won' AND ${inUpdated}${owner})::int AS won_count,
      (SELECT COALESCE(SUM(amount),0) FROM opportunities WHERE company_id=$1 AND stage='won' AND ${inUpdated}${owner})::numeric AS won_amount,
      (SELECT COUNT(*) FROM (
        SELECT DISTINCT ON (opportunity_id) id
        FROM quotes
        WHERE company_id=$1 AND ${inCreated}
          AND status IN ('pending_approval','approved','confirmed')${owner}
        ORDER BY opportunity_id, version DESC, updated_at DESC, id DESC
      ) latest_quotes)::int AS quotes,
      (SELECT COALESCE(SUM(total),0) FROM (
        SELECT DISTINCT ON (opportunity_id) total
        FROM quotes
        WHERE company_id=$1 AND ${inCreated}
          AND status IN ('pending_approval','approved','confirmed')${owner}
        ORDER BY opportunity_id, version DESC, updated_at DESC, id DESC
      ) latest_quotes)::numeric AS quote_amount`, params),
    pool.query(stagesSql, stagesParams),
    getReportSalesRows(companyId, ownerIds, ranges),
    pool.query(`SELECT c.company_name,c.name,c.industry,c.source,c.status,u.name owner_name,c.created_at FROM customers c LEFT JOIN users u ON u.id=c.owner_id WHERE c.company_id=$1 AND ${inCCreated}${customerOwner} ORDER BY c.created_at DESC LIMIT 5000`, params),
    pool.query(`SELECT o.title,COALESCE(c.company_name,c.name) customer_name,u.name owner_name,o.stage,o.amount,o.expected_close_date,o.created_at,o.updated_at FROM opportunities o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN users u ON u.id=o.owner_id WHERE o.company_id=$1 AND ${inOCreated}${oOwner} ORDER BY o.created_at DESC LIMIT 5000`, params),
    pool.query(`SELECT COALESCE(c.company_name,c.name) customer_name,u.name owner_name,f.type,f.content,f.followed_at FROM follow_ups f LEFT JOIN customers c ON c.id=f.customer_id LEFT JOIN users u ON u.id=f.owner_id WHERE f.company_id=$1 AND ${inFFollowed}${fOwner} ORDER BY f.followed_at DESC LIMIT 5000`, params),
    pool.query(`WITH latest_quotes AS (
      SELECT DISTINCT ON (q.opportunity_id) q.*
      FROM quotes q
      WHERE q.company_id=$1 AND ${inQCreated}
        AND q.status IN ('pending_approval','approved','confirmed')${qOwner}
      ORDER BY q.opportunity_id, q.version DESC, q.updated_at DESC, q.id DESC
    )
    SELECT q.title,COALESCE(c.company_name,c.name) customer_name,u.name owner_name,q.status,q.total,q.created_at
    FROM latest_quotes q
    LEFT JOIN customers c ON c.id=q.customer_id
    LEFT JOIN users u ON u.id=q.owner_id
    ORDER BY q.created_at DESC LIMIT 5000`, params),
    pool.query(`SELECT p.item->>'category' category,COUNT(*)::int count FROM ai_insights i JOIN customers c ON c.id=i.customer_id CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.result_json->'pain_points','[]'::jsonb)) p(item) WHERE i.company_id=$1 AND ${inICreated}${customerOwner} GROUP BY 1 ORDER BY count DESC LIMIT 30`, params),
    pool.query(`SELECT cm.name,COUNT(*)::int count FROM competitor_mentions cm LEFT JOIN customers c ON c.id=cm.customer_id WHERE cm.company_id=$1 AND ${inCmCreated}${customerOwner} GROUP BY cm.name ORDER BY count DESC LIMIT 30`, params),
  ]);
  return { companyName: company.rows[0]?.name || "", people: people.rows, summary: summary.rows[0], stages: stages.rows, sales, customers: customers.rows, opportunities: opportunities.rows, followUps: followUps.rows, quotes: quotes.rows, painPoints: painPoints.rows, competitors: competitors.rows };
}
