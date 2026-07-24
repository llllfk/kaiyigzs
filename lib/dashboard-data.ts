import { unstable_cache } from "next/cache";
import pool from "@/lib/db";

const REVALIDATE_SEC = 30;

export type AdminDashboardCore = {
  recycleDays: number;
  privateN: number;
  poolN: number;
  teamN: number;
  newCustN: number;
  newLeadN: number;
  wonN: number;
  wonAmount: number;
  overdueN: number;
  staleN: number;
  stageMap: Record<string, number>;
};

export type AdminTeamRow = {
  id: number;
  name: string;
  role: string;
  customers: number;
  open_opps: number;
  open_tasks: number;
};

export type AdminAuditRow = {
  action: string;
  summary: string | null;
  created_at: string;
};

export type SalesDashboardCore = {
  customerN: number;
  monthLeadN: number;
  wonAmount: number;
  openTaskN: number;
  stageMap: Record<string, number>;
};

/** 管理员关键：单次 CTE（客户/团队/商机 KPI/逾期/超期未跟进/漏斗） */
async function loadAdminDashboardCore(companyId: number): Promise<AdminDashboardCore> {
  const { rows } = await pool.query(
    `WITH co AS (
       SELECT GREATEST(1, LEAST(365, COALESCE(
         NULLIF((config->>'pool_recycle_days')::int, 0),
         7
       ))) AS recycle_days
       FROM companies WHERE id = $1
     ),
     cust AS (
       SELECT
         COUNT(*) FILTER (WHERE COALESCE(pool_status, 'private') = 'private')::int AS private_n,
         COUNT(*) FILTER (WHERE pool_status = 'public')::int AS pool_n,
         COUNT(*) FILTER (
           WHERE COALESCE(pool_status, 'private') = 'private'
             AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)
         )::int AS new_cust_month
       FROM customers
       WHERE company_id = $1
     ),
     team AS (
       SELECT COUNT(*)::int AS team_n
       FROM users
       WHERE company_id = $1
         AND status = 'active'
         AND role IN ('sales_manager', 'sales')
     ),
     opp AS (
       SELECT
         COUNT(*) FILTER (
           WHERE created_at >= date_trunc('month', CURRENT_TIMESTAMP)
         )::int AS leads_month,
         COUNT(*) FILTER (
           WHERE stage = 'won'
             AND updated_at >= date_trunc('month', CURRENT_TIMESTAMP)
         )::int AS won_month,
         COALESCE(
           SUM(amount) FILTER (
             WHERE stage = 'won'
               AND updated_at >= date_trunc('month', CURRENT_TIMESTAMP)
           ),
           0
         )::float AS won_amount
       FROM opportunities
       WHERE company_id = $1
     ),
     stages AS (
       SELECT COALESCE(jsonb_object_agg(stage, c), '{}'::jsonb) AS by_stage
       FROM (
         SELECT stage, COUNT(*)::int AS c
         FROM opportunities
         WHERE company_id = $1
         GROUP BY stage
       ) s
     ),
     overdue AS (
       SELECT COUNT(*)::int AS overdue_n
       FROM tasks
       WHERE company_id = $1
         AND status != 'done'
         AND due_at IS NOT NULL
         AND due_at::date < CURRENT_DATE
     ),
     last_follow AS (
       SELECT customer_id, MAX(followed_at) AS max_at
       FROM follow_ups
       WHERE company_id = $1
       GROUP BY customer_id
     ),
     stale AS (
       SELECT COUNT(*)::int AS stale_n
       FROM customers c
       CROSS JOIN co
       LEFT JOIN last_follow lf ON lf.customer_id = c.id
       WHERE c.company_id = $1
         AND COALESCE(c.pool_status, 'private') = 'private'
         AND c.status = 'active'
         AND COALESCE(lf.max_at, c.claimed_at, c.created_at)
             < CURRENT_TIMESTAMP - (co.recycle_days || ' days')::interval
     )
     SELECT
       co.recycle_days,
       cust.private_n,
       cust.pool_n,
       cust.new_cust_month,
       team.team_n,
       opp.leads_month,
       opp.won_month,
       opp.won_amount,
       overdue.overdue_n,
       stale.stale_n,
       stages.by_stage
     FROM co, cust, team, opp, stages, overdue, stale`,
    [companyId]
  );

  const row = rows[0] || {};
  const byStage = (row.by_stage || {}) as Record<string, number>;
  const stageMap: Record<string, number> = {};
  for (const [k, v] of Object.entries(byStage)) {
    stageMap[k] = Number(v) || 0;
  }

  return {
    recycleDays: Number(row.recycle_days) || 7,
    privateN: Number(row.private_n) || 0,
    poolN: Number(row.pool_n) || 0,
    teamN: Number(row.team_n) || 0,
    newCustN: Number(row.new_cust_month) || 0,
    newLeadN: Number(row.leads_month) || 0,
    wonN: Number(row.won_month) || 0,
    wonAmount: Number(row.won_amount) || 0,
    overdueN: Number(row.overdue_n) || 0,
    staleN: Number(row.stale_n) || 0,
    stageMap,
  };
}

/** 团队产能：JOIN + GROUP BY，无 per-member 相关子查询 */
async function loadAdminTeamRows(companyId: number): Promise<AdminTeamRow[]> {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.role,
            COALESCE(c.cnt, 0)::int AS customers,
            COALESCE(o.cnt, 0)::int AS open_opps,
            COALESCE(t.cnt, 0)::int AS open_tasks
     FROM users u
     LEFT JOIN (
       SELECT owner_id, COUNT(*)::int AS cnt
       FROM customers
       WHERE company_id = $1
         AND COALESCE(pool_status, 'private') = 'private'
       GROUP BY owner_id
     ) c ON c.owner_id = u.id
     LEFT JOIN (
       SELECT owner_id, COUNT(*)::int AS cnt
       FROM opportunities
       WHERE company_id = $1
         AND stage NOT IN ('won', 'lost')
       GROUP BY owner_id
     ) o ON o.owner_id = u.id
     LEFT JOIN (
       SELECT owner_id, COUNT(*)::int AS cnt
       FROM tasks
       WHERE company_id = $1
         AND status != 'done'
       GROUP BY owner_id
     ) t ON t.owner_id = u.id
     WHERE u.company_id = $1
       AND u.status = 'active'
       AND u.role IN ('sales_manager', 'sales')
     ORDER BY CASE u.role WHEN 'sales_manager' THEN 0 ELSE 1 END, u.name
     LIMIT 10`,
    [companyId]
  );
  return rows as AdminTeamRow[];
}

async function loadAdminAuditRows(companyId: number): Promise<AdminAuditRow[]> {
  const { rows } = await pool.query(
    `SELECT action, summary, created_at
     FROM audit_logs
     WHERE company_id = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [companyId]
  );
  return rows as AdminAuditRow[];
}

export function getAdminDashboardCore(companyId: number) {
  return unstable_cache(
    () => loadAdminDashboardCore(companyId),
    ["dashboard-admin-core", String(companyId)],
    { revalidate: REVALIDATE_SEC }
  )();
}

export function getAdminTeamRows(companyId: number) {
  return unstable_cache(
    () => loadAdminTeamRows(companyId),
    ["dashboard-admin-team", String(companyId)],
    { revalidate: REVALIDATE_SEC }
  )();
}

export function getAdminAuditRows(companyId: number) {
  return unstable_cache(
    () => loadAdminAuditRows(companyId),
    ["dashboard-admin-audit", String(companyId)],
    { revalidate: REVALIDATE_SEC }
  )();
}

/**
 * 销售关键：3 组并行
 * 1) 客户数  2) 漏斗+本月线索  3) 成交额+未完成待办
 */
export function getSalesDashboardCore(params: {
  companyId: number;
  ownerIds: number[];
  userId: number;
  isManager: boolean;
  customerFilterSql: string;
  customerFilterParams: unknown[];
  oppFilterSql: string;
  oppFilterParams: unknown[];
}): Promise<SalesDashboardCore> {
  const cacheKey = [
    "dashboard-sales-core-v4",
    String(params.companyId),
    params.isManager ? "mgr" : "sales",
    params.ownerIds.slice().sort((a, b) => a - b).join(","),
  ];

  return unstable_cache(
    async () => {
      const [custRes, oppRes, sideRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS c FROM customers c WHERE ${params.customerFilterSql}`,
          params.customerFilterParams
        ),
        pool.query(
          `WITH filtered AS (
             SELECT stage, created_at
             FROM opportunities o
             WHERE ${params.oppFilterSql}
           ),
           stages AS (
             SELECT COALESCE(jsonb_object_agg(stage, c), '{}'::jsonb) AS by_stage
             FROM (
               SELECT stage, COUNT(*)::int AS c FROM filtered GROUP BY stage
             ) s
           ),
           leads AS (
             SELECT COUNT(*)::int AS leads_month
             FROM filtered
             WHERE created_at >= date_trunc('month', CURRENT_TIMESTAMP)
           )
           SELECT stages.by_stage, leads.leads_month
           FROM stages, leads`,
          params.oppFilterParams
        ),
        params.isManager
          ? pool.query(
              `SELECT
                 (SELECT COALESCE(SUM(amount), 0)::float
                  FROM opportunities
                  WHERE company_id = $1 AND stage = 'won'
                    AND updated_at >= date_trunc('month', CURRENT_TIMESTAMP)
                 ) AS won_amount,
                 (SELECT COUNT(*)::int FROM tasks
                  WHERE owner_id = ANY($2::bigint[]) AND status != 'done'
                 ) AS open_tasks`,
              [params.companyId, params.ownerIds]
            )
          : pool.query(
              `SELECT
                 (SELECT COALESCE(SUM(amount), 0)::float
                  FROM opportunities
                  WHERE company_id = $1 AND owner_id = $2 AND stage = 'won'
                    AND updated_at >= date_trunc('month', CURRENT_TIMESTAMP)
                 ) AS won_amount,
                 (SELECT COUNT(*)::int FROM tasks
                  WHERE owner_id = ANY($3::bigint[]) AND status != 'done'
                 ) AS open_tasks`,
              [params.companyId, params.userId, params.ownerIds]
            ),
      ]);

      const byStage = (oppRes.rows[0]?.by_stage || {}) as Record<string, number>;
      const stageMap: Record<string, number> = {};
      for (const [k, v] of Object.entries(byStage)) {
        stageMap[k] = Number(v) || 0;
      }

      return {
        customerN: Number(custRes.rows[0]?.c) || 0,
        monthLeadN: Number(oppRes.rows[0]?.leads_month) || 0,
        wonAmount: Number(sideRes.rows[0]?.won_amount) || 0,
        openTaskN: Number(sideRes.rows[0]?.open_tasks) || 0,
        stageMap,
      };
    },
    cacheKey,
    { revalidate: REVALIDATE_SEC }
  )();
}
