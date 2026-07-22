import pool from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { crmRole } from "@/lib/permissions";
import type { SessionUser } from "@/types";

export type ReportPeriodType = "month" | "quarter";

export function reportPeriod(type: string, key: string) {
  if (type === "month" && /^\d{4}-(0[1-9]|1[0-2])$/.test(key)) {
    const [year, month] = key.split("-").map(Number);
    return { type: "month" as const, key, from: `${key}-01`, to: month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`, label: `${year}年${month}月` };
  }
  const match = key.match(/^(\d{4})-Q([1-4])$/);
  if (type === "quarter" && match) {
    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 3;
    return { type: "quarter" as const, key, from: `${year}-${String(startMonth).padStart(2, "0")}-01`, to: endMonth > 12 ? `${year + 1}-01-01` : `${year}-${String(endMonth).padStart(2, "0")}-01`, label: `${year}年第${quarter}季度` };
  }
  throw new AuthError("报表周期无效", 400);
}

export async function resolveReportScope(user: SessionUser, requestedOwnerId: number | null) {
  if (!user.company_id) throw new AuthError("缺少公司信息", 400);
  if (crmRole(user) === "sales") return { ownerId: Number(user.id), scope: "self" as const };
  if (requestedOwnerId == null) return { ownerId: null, scope: "company" as const };
  const result = await pool.query(`SELECT id FROM users WHERE id=$1 AND company_id=$2 AND status='active' AND role IN ('sales','sales_manager')`, [requestedOwnerId, user.company_id]);
  if (!result.rows[0]) throw new AuthError("所选销售人员无效", 400);
  return { ownerId: requestedOwnerId, scope: "owner" as const };
}

export async function getReportSnapshot(companyId: number, ownerId: number | null, from: string, to: string) {
  const owner = ownerId == null ? "" : " AND owner_id=$4";
  const customerOwner = ownerId == null ? "" : " AND c.owner_id=$4";
  const params = ownerId == null ? [companyId, from, to] : [companyId, from, to, ownerId];
  const [company, people, summary, stages, sales, customers, opportunities, followUps, quotes, painPoints, competitors] = await Promise.all([
    pool.query(`SELECT name FROM companies WHERE id=$1`, [companyId]),
    pool.query(`SELECT id,name,role FROM users WHERE company_id=$1 AND status='active' AND role IN ('sales','sales_manager') ORDER BY name`, [companyId]),
    pool.query(`SELECT
      (SELECT COUNT(*) FROM customers WHERE company_id=$1 AND created_at >= $2::date AND created_at < $3::date${owner})::int AS new_customers,
      (SELECT COUNT(*) FROM follow_ups WHERE company_id=$1 AND followed_at >= $2::date AND followed_at < $3::date${owner})::int AS follow_ups,
      (SELECT COUNT(*) FROM opportunities WHERE company_id=$1 AND created_at >= $2::date AND created_at < $3::date${owner})::int AS new_opportunities,
      (SELECT COALESCE(SUM(amount),0) FROM opportunities WHERE company_id=$1 AND created_at >= $2::date AND created_at < $3::date${owner})::numeric AS opportunity_amount,
      (SELECT COUNT(*) FROM opportunities WHERE company_id=$1 AND stage='won' AND updated_at >= $2::date AND updated_at < $3::date${owner})::int AS won_count,
      (SELECT COALESCE(SUM(amount),0) FROM opportunities WHERE company_id=$1 AND stage='won' AND updated_at >= $2::date AND updated_at < $3::date${owner})::numeric AS won_amount,
      (SELECT COUNT(*) FROM (
        SELECT DISTINCT ON (opportunity_id) id
        FROM quotes
        WHERE company_id=$1 AND created_at >= $2::date AND created_at < $3::date
          AND status IN ('pending_approval','approved','confirmed')${owner}
        ORDER BY opportunity_id, version DESC, updated_at DESC, id DESC
      ) latest_quotes)::int AS quotes,
      (SELECT COALESCE(SUM(total),0) FROM (
        SELECT DISTINCT ON (opportunity_id) total
        FROM quotes
        WHERE company_id=$1 AND created_at >= $2::date AND created_at < $3::date
          AND status IN ('pending_approval','approved','confirmed')${owner}
        ORDER BY opportunity_id, version DESC, updated_at DESC, id DESC
      ) latest_quotes)::numeric AS quote_amount`, params),
    pool.query(`SELECT stage,COUNT(*)::int count,COALESCE(SUM(amount),0)::numeric amount FROM opportunities WHERE company_id=$1${ownerId == null ? "" : " AND owner_id=$2"} GROUP BY stage ORDER BY count DESC`, ownerId == null ? [companyId] : [companyId, ownerId]),
    pool.query(`SELECT u.name,
      (SELECT COUNT(*)::int FROM customers c WHERE c.company_id=$1 AND c.owner_id=u.id AND c.created_at >= $2::date AND c.created_at < $3::date) new_customers,
      (SELECT COUNT(*)::int FROM follow_ups f WHERE f.company_id=$1 AND f.owner_id=u.id AND f.followed_at >= $2::date AND f.followed_at < $3::date) follow_ups,
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.company_id=$1 AND o.owner_id=u.id AND o.created_at >= $2::date AND o.created_at < $3::date) opportunities,
      (SELECT COALESCE(SUM(o.amount),0)::numeric FROM opportunities o WHERE o.company_id=$1 AND o.owner_id=u.id AND o.created_at >= $2::date AND o.created_at < $3::date) opportunity_amount
      FROM users u WHERE u.company_id=$1 AND u.status='active' AND u.role IN ('sales','sales_manager')${ownerId == null ? "" : " AND u.id=$4"} ORDER BY opportunity_amount DESC`, params),
    pool.query(`SELECT c.company_name,c.name,c.industry,c.source,c.status,u.name owner_name,c.created_at FROM customers c LEFT JOIN users u ON u.id=c.owner_id WHERE c.company_id=$1 AND c.created_at >= $2::date AND c.created_at < $3::date${customerOwner} ORDER BY c.created_at DESC LIMIT 5000`, params),
    pool.query(`SELECT o.title,COALESCE(c.company_name,c.name) customer_name,u.name owner_name,o.stage,o.amount,o.expected_close_date,o.created_at,o.updated_at FROM opportunities o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN users u ON u.id=o.owner_id WHERE o.company_id=$1 AND o.created_at >= $2::date AND o.created_at < $3::date${ownerId == null ? "" : " AND o.owner_id=$4"} ORDER BY o.created_at DESC LIMIT 5000`, params),
    pool.query(`SELECT COALESCE(c.company_name,c.name) customer_name,u.name owner_name,f.type,f.content,f.followed_at FROM follow_ups f LEFT JOIN customers c ON c.id=f.customer_id LEFT JOIN users u ON u.id=f.owner_id WHERE f.company_id=$1 AND f.followed_at >= $2::date AND f.followed_at < $3::date${ownerId == null ? "" : " AND f.owner_id=$4"} ORDER BY f.followed_at DESC LIMIT 5000`, params),
    pool.query(`WITH latest_quotes AS (
      SELECT DISTINCT ON (q.opportunity_id) q.*
      FROM quotes q
      WHERE q.company_id=$1 AND q.created_at >= $2::date AND q.created_at < $3::date
        AND q.status IN ('pending_approval','approved','confirmed')${ownerId == null ? "" : " AND q.owner_id=$4"}
      ORDER BY q.opportunity_id, q.version DESC, q.updated_at DESC, q.id DESC
    )
    SELECT q.title,COALESCE(c.company_name,c.name) customer_name,u.name owner_name,q.status,q.total,q.created_at
    FROM latest_quotes q
    LEFT JOIN customers c ON c.id=q.customer_id
    LEFT JOIN users u ON u.id=q.owner_id
    ORDER BY q.created_at DESC LIMIT 5000`, params),
    pool.query(`SELECT p.item->>'category' category,COUNT(*)::int count FROM ai_insights i JOIN customers c ON c.id=i.customer_id CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.result_json->'pain_points','[]'::jsonb)) p(item) WHERE i.company_id=$1 AND i.created_at >= $2::date AND i.created_at < $3::date${customerOwner} GROUP BY 1 ORDER BY count DESC LIMIT 30`, params),
    pool.query(`SELECT cm.name,COUNT(*)::int count FROM competitor_mentions cm LEFT JOIN customers c ON c.id=cm.customer_id WHERE cm.company_id=$1 AND cm.created_at >= $2::date AND cm.created_at < $3::date${customerOwner} GROUP BY cm.name ORDER BY count DESC LIMIT 30`, params),
  ]);
  return { companyName: company.rows[0]?.name || "", people: people.rows, summary: summary.rows[0], stages: stages.rows, sales: sales.rows, customers: customers.rows, opportunities: opportunities.rows, followUps: followUps.rows, quotes: quotes.rows, painPoints: painPoints.rows, competitors: competitors.rows };
}

export async function ensureReportExportsTable() {
  // file_path 仅兼容旧结构；新记录不落盘，历史下载按 period/owner 现算
  await pool.query(`CREATE TABLE IF NOT EXISTS report_exports (id BIGSERIAL PRIMARY KEY,company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,created_by BIGINT NOT NULL REFERENCES users(id),owner_id BIGINT REFERENCES users(id),period_type VARCHAR(16) NOT NULL,period_key VARCHAR(16) NOT NULL,scope VARCHAR(16) NOT NULL,file_name VARCHAR(300) NOT NULL,file_path TEXT NOT NULL DEFAULT '',file_size BIGINT NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_report_exports_company_created ON report_exports(company_id,created_at DESC)`);
}
