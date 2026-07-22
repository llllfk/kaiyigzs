import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { crmRole, getVisibleOwnerIds, buildOwnerFilter } from "@/lib/permissions";
import { formatDate, formatRelativeTime, taskDueUrgency } from "@/lib/utils";
import { auditActionLabel } from "@/lib/audit-labels";
import {
  getAdminAuditRows,
  getAdminDashboardCore,
  getAdminTeamRows,
  getSalesDashboardCore,
  type AdminDashboardCore,
  type AdminTeamRow,
} from "@/lib/dashboard-data";
import {
  STAGE_LABELS,
  MEDIA_KIND_LABELS,
  ROLE_LABELS,
  type OpportunityStage,
  type SessionUser,
  type UserRole,
} from "@/types";
import { AppLink } from "@/components/ui/AppLink";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StatusTag } from "@/components/ui/StatusTag";
import type { ListNavFilters } from "@/lib/nav-filters";
import { DashboardSkeleton, Skeleton } from "@/components/ui/Skeleton";

/** 本月 1 号～今天（本地日历日 YYYY-MM-DD） */
function monthRangeToToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const from = `${y}-${m}-01`;
  const to = `${y}-${m}-${d}`;
  return { from, to };
}

function formatCny(n: number) {
  return `¥${n.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

const STAGE_BAR: Record<OpportunityStage, string> = {
  lead: "bg-slate-400",
  contact: "bg-sky-500",
  proposal: "bg-amber-500",
  won: "bg-emerald-500",
  lost: "bg-rose-400",
};

export default async function DashboardPage() {
  const user = await requireSession().catch(() => null);
  if (!user) redirect("/login");
  if (user.role === "super_admin" && !user.act_as_company_id) redirect("/platform");

  // 会话很快返回；核心 KPI 放进 Suspense，避免整页卡在 SQL 上
  if (crmRole(user) === "company_admin") {
    return (
      <Suspense fallback={<DashboardSkeleton />}>
        <AdminDashboard user={user} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <SalesDashboard user={user} />
    </Suspense>
  );
}

/* ─── 公司管理员：管理盯盘台（非销售执行台） ─── */

async function AdminDashboard({ user }: { user: SessionUser }) {
  const companyId = user.company_id!;
  const core = await getAdminDashboardCore(companyId);
  const stageMax = Math.max(1, ...Object.values(core.stageMap).map(Number));
  const { from: monthFrom, to: monthTo } = monthRangeToToday();

  const riskItems = [
    {
      href: "/pool",
      label: "公海积压",
      value: core.poolN,
      hint: core.poolN > 0 ? "待分配或领取，避免长期无人跟进" : "公海暂无积压",
      tone: core.poolN > 0 ? "warn" : "ok",
    },
    {
      href: "/tasks",
      label: "逾期待办",
      value: core.overdueN,
      hint: core.overdueN > 0 ? "全公司已过截止日仍未完成的待办" : "暂无逾期",
      tone: core.overdueN > 0 ? "danger" : "ok",
      navFilters: { urgency: "overdue" },
    },
    {
      href: "/customers",
      label: `超 ${core.recycleDays} 天未跟进`,
      value: core.staleN,
      hint:
        core.staleN > 0
          ? "私海客户已达回收阈值，可催跟进或回收至公海"
          : "私海跟进节奏正常",
      tone: core.staleN > 0 ? "warn" : "ok",
    },
  ] as const;

  return (
    <div className="space-y-5">
      <AdminHero
        user={user}
        core={core}
        monthFrom={monthFrom}
        monthTo={monthTo}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminRiskSection items={riskItems} />
        <Suspense fallback={<DashboardPanelSkeleton title="团队产能" rows={5} />}>
          <AdminTeamSection companyId={companyId} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminFunnelSection stageMap={core.stageMap} stageMax={stageMax} />
        <Suspense fallback={<DashboardPanelSkeleton title="最近审计" rows={4} />}>
          <AdminAuditSection companyId={companyId} />
        </Suspense>
      </div>
    </div>
  );
}

function AdminHero({
  user,
  core,
  monthFrom,
  monthTo,
}: {
  user: SessionUser;
  core: AdminDashboardCore;
  monthFrom: string;
  monthTo: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[linear-gradient(135deg,#1e3a5f_0%,#274b7a_48%,#2563eb_100%)] px-5 py-5 text-white shadow-[var(--shadow)] md:px-6">
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10"
        aria-hidden
      />
      <div className="relative">
        <div>
          <div className="text-xs font-medium tracking-wide text-white/70">
            公司管理员 · {user.name}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">公司经营</h1>
          <p className="mt-1.5 max-w-lg text-sm text-white/75">
            盯团队产能、公海与风险；销售跟进请到客户 / 待办页。
          </p>
          <AppLink
            href="/insights"
            className="mt-2 inline-block text-xs text-white/65 underline-offset-2 hover:text-white hover:underline"
          >
            查看完整分析 →
          </AppLink>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-white/15 pt-4">
          <AdminMetric href="/customers" label="私海" value={core.privateN} />
          <AdminMetric href="/pool" label="公海" value={core.poolN} />
          <AdminMetric href="/team" label="业务成员" value={core.teamN} />
          <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 py-0 pl-2.5 pr-3 backdrop-blur-md">
            <span className="shrink-0 text-[11px] font-medium leading-none tracking-wide text-white/70">
              本月
            </span>
            <span className="h-8 w-px shrink-0 bg-white/20" aria-hidden />
            <div className="flex gap-x-8">
              <AdminMetric
                href="/customers"
                label="新增客户"
                value={core.newCustN}
                navFilters={{ createdFrom: monthFrom, createdTo: monthTo }}
              />
              <AdminMetric
                href="/opportunities"
                label="线索"
                value={core.newLeadN}
                navFilters={{ createdFrom: monthFrom, createdTo: monthTo }}
              />
              <AdminMetric
                href="/opportunities"
                label="成交"
                value={core.wonN}
                navFilters={{
                  stages: ["won"],
                  createdFrom: monthFrom,
                  createdTo: monthTo,
                  dateField: "updated_at",
                }}
              />
              <AdminMetric
                href="/opportunities"
                label="成交金额"
                value={formatCny(core.wonAmount)}
                navFilters={{
                  stages: ["won"],
                  createdFrom: monthFrom,
                  createdTo: monthTo,
                  dateField: "updated_at",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminRiskSection({
  items,
}: {
  items: readonly {
    href: string;
    label: string;
    value: number;
    hint: string;
    tone: string;
    navFilters?: ListNavFilters;
  }[];
}) {
  return (
    <section className="surface p-4 md:p-5">
      <h2 className="text-base font-semibold tracking-tight">风险与待处理</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        需管理员关注的积压与超时项，点进对应模块处理
      </p>
      <ul className="mt-4 divide-y divide-[var(--color-border)]">
        {items.map((item) => (
          <li key={item.label}>
            <AppLink
              href={item.href}
              navFilters={item.navFilters}
              className="-mx-1 flex items-center gap-4 rounded-lg px-1 py-3.5 transition hover:bg-slate-50/80"
            >
              <span
                className={`flex h-11 w-14 shrink-0 items-center justify-center rounded-lg text-lg font-bold tabular-nums ${
                  item.tone === "danger"
                    ? "bg-rose-50 text-rose-700"
                    : item.tone === "warn"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.value}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                  {item.hint}
                </span>
              </span>
            </AppLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AdminFunnelSection({
  stageMap,
  stageMax,
}: {
  stageMap: Record<string, number>;
  stageMax: number;
}) {
  return (
    <section className="surface p-4 md:p-5">
      <SectionHead title="全公司商机漏斗" href="/opportunities" linkText="全部商机" />
      <div className="mt-4 space-y-3">
        {(Object.keys(STAGE_LABELS) as OpportunityStage[]).map((stage) => {
          const value = stageMap[stage] || 0;
          const pct = Math.round((value / stageMax) * 100);
          return (
            <div key={stage}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{STAGE_LABELS[stage]}</span>
                <span className="tabular-nums text-[var(--color-muted)]">{value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${STAGE_BAR[stage]} transition-[width] duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

async function AdminTeamSection({ companyId }: { companyId: number }) {
  const rows = await getAdminTeamRows(companyId);
  return <AdminTeamTable rows={rows} />;
}

function AdminTeamTable({ rows }: { rows: AdminTeamRow[] }) {
  return (
    <section className="surface p-4 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">团队产能</h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">按业务成员汇总</p>
        </div>
        <AppLink
          href="/team"
          className="text-sm font-medium text-[var(--color-accent)] hover:underline"
        >
          团队管理
        </AppLink>
      </div>
      <div className="mt-3">
        <table className="w-full table-fixed text-sm">
          <thead className="text-left text-[var(--color-muted)]">
            <tr>
              <th className="w-[40%] pb-2 font-medium">成员</th>
              <th className="w-[20%] pb-2 text-right font-medium">私海</th>
              <th className="w-[20%] pb-2 text-right font-medium">推进中</th>
              <th className="w-[20%] pb-2 text-right font-medium">待办</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-[var(--color-muted)]">
                  暂无业务成员，请先到团队创建账号
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-border)]">
                <td className="py-2.5 pr-2">
                  <div className="truncate font-medium" title={r.name}>
                    {r.name}
                  </div>
                  <div className="truncate text-xs text-[var(--color-muted)]">
                    {ROLE_LABELS[r.role as UserRole] || r.role}
                  </div>
                </td>
                <td className="py-2.5 text-right">
                  <AppLink
                    href="/customers"
                    navFilters={{ ownerQ: r.name }}
                    className="tabular-nums text-[var(--color-accent)] hover:underline"
                  >
                    {r.customers}
                  </AppLink>
                </td>
                <td className="py-2.5 text-right">
                  <AppLink
                    href="/opportunities"
                    navFilters={{
                      ownerQ: r.name,
                      stages: ["lead", "contact", "proposal"],
                    }}
                    className="tabular-nums text-[var(--color-accent)] hover:underline"
                  >
                    {r.open_opps}
                  </AppLink>
                </td>
                <td className="py-2.5 text-right">
                  <AppLink
                    href="/tasks"
                    navFilters={{ ownerQ: r.name, status: "pending" }}
                    className="tabular-nums text-[var(--color-accent)] hover:underline"
                  >
                    {r.open_tasks}
                  </AppLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function AdminAuditSection({ companyId }: { companyId: number }) {
  const rows = await getAdminAuditRows(companyId);
  return (
    <section className="surface p-4 md:p-5">
      <SectionHead title="最近审计" href="/audit" linkText="全部审计" />
      <ul className="mt-3 space-y-2">
        {rows.length === 0 && (
          <li className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-[var(--color-muted)]">
            暂无审计记录
          </li>
        )}
        {rows.map((a, i) => (
          <li
            key={`${a.created_at}-${i}`}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                {auditActionLabel(a.action)}
              </span>
              <span>{formatRelativeTime(a.created_at)}</span>
            </div>
            <div className="mt-1 line-clamp-2 text-sm">{a.summary || "—"}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DashboardPanelSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <section className="surface p-4 md:p-5" aria-busy aria-label={`${title}加载中`}>
      <Skeleton className="h-5 w-24" />
      <Skeleton className="mt-2 h-3 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </section>
  );
}

function AdminMetric({
  href,
  label,
  value,
  navFilters,
}: {
  href: string;
  label: string;
  value: number | string;
  navFilters?: ListNavFilters;
}) {
  return (
    <AppLink href={href} navFilters={navFilters} className="group shrink-0">
      <div className="text-xs text-white/65 group-hover:text-white/85">{label}</div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-white">
        {value}
      </div>
    </AppLink>
  );
}

/* ─── 销售经理 / 销售：执行视角 ─── */

async function SalesDashboard({ user }: { user: SessionUser }) {
  const isManager = user.role === "sales_manager";
  const owners = await getVisibleOwnerIds(user);
  const filter = buildOwnerFilter(owners, user.company_id, "c");
  const oppFilter = buildOwnerFilter(owners, user.company_id, "o", {
    includePoolStatus: false,
  });

  const ownerIds = Array.isArray(owners) ? owners : [user.id];

  const core = await getSalesDashboardCore({
    companyId: user.company_id!,
    ownerIds,
    userId: user.id,
    isManager,
    customerFilterSql: filter.sql,
    customerFilterParams: filter.params,
    oppFilterSql: oppFilter.sql,
    oppFilterParams: oppFilter.params,
  });

  const stageMap = core.stageMap;
  const stageMax = Math.max(1, ...Object.values(stageMap).map(Number));
  const { from: monthFrom, to: monthTo } = monthRangeToToday();
  const monthLeadN = core.monthLeadN;
  const wonAmount = core.wonAmount;
  const openTaskN = core.openTaskN;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "上午好" : hour < 18 ? "下午好" : "晚上好";

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[linear-gradient(135deg,#1e3a5f_0%,#274b7a_48%,#2563eb_100%)] px-5 py-6 text-white shadow-[var(--shadow)] sm:px-7">
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 right-16 h-32 w-32 rounded-full bg-sky-300/20"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm text-white/70">
              {greet}，{user.name}
              {isManager ? " · 销售经理" : ""}
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {isManager ? "团队工作台" : "今天的工作台"}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/75">
              {isManager
                ? "跟进团队客户、商机与待办；深度分析请到分析页。"
                : "待办、商机与关键洞察一眼看清；深度分析请到分析页。"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AppLink
              href="/insights"
              className="hero-btn-solid inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm transition"
            >
              完整分析
            </AppLink>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          href="/customers"
          label={isManager ? "团队客户" : "我的客户"}
          value={core.customerN}
          tone="navy"
          icon="users"
        />
        <StatCard
          href="/opportunities"
          label="本月线索"
          value={monthLeadN}
          tone="slate"
          icon="spark"
          navFilters={{
            createdFrom: monthFrom,
            createdTo: monthTo,
          }}
        />
        <StatCard
          href="/opportunities"
          label="本月成交金额"
          value={formatCny(wonAmount)}
          tone="green"
          icon="won"
          navFilters={{
            stages: ["won"],
            createdFrom: monthFrom,
            createdTo: monthTo,
            dateField: "updated_at",
          }}
        />
        <StatCard
          href="/opportunities"
          label="报价中"
          value={stageMap.proposal || 0}
          tone="amber"
          icon="tag"
          navFilters={{ stages: ["proposal"] }}
        />
        <StatCard
          href="/tasks"
          label={isManager ? "团队待办" : "待办未完成"}
          value={openTaskN}
          tone="blue"
          icon="check"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="surface p-4 md:p-5">
          <SectionHead
            title={isManager ? "团队商机漏斗" : "商机漏斗"}
            href="/opportunities"
            linkText="全部商机"
          />
          <div className="mt-4 space-y-3">
            {(Object.keys(STAGE_LABELS) as OpportunityStage[]).map((stage) => {
              const value = stageMap[stage] || 0;
              const pct = Math.round((value / stageMax) * 100);
              return (
                <div key={stage}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{STAGE_LABELS[stage]}</span>
                    <span className="tabular-nums text-[var(--color-muted)]">{value}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${STAGE_BAR[stage]} transition-[width] duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <Suspense
          fallback={
            <DashboardPanelSkeleton
              title={isManager ? "团队待办" : "我的待办"}
              rows={5}
            />
          }
        >
          <SalesTasksPanel ownerIds={ownerIds} isManager={isManager} />
        </Suspense>
      </div>

      <Suspense fallback={<SalesSecondarySkeleton />}>
        <SalesSecondaryPanels
          isManager={isManager}
          customerFilterSql={filter.sql}
          customerFilterParams={filter.params}
          companyId={user.company_id!}
          ownerIds={ownerIds}
        />
      </Suspense>
    </div>
  );
}

async function SalesTasksPanel({
  ownerIds,
  isManager,
}: {
  ownerIds: number[];
  isManager: boolean;
}) {
  const tasksDue = await pool.query(
    `SELECT id, title, due_at, source, status, owner_id FROM tasks
     WHERE owner_id = ANY($1::bigint[]) AND status != 'done'
     ORDER BY due_at NULLS LAST LIMIT 8`,
    [ownerIds]
  );

  return (
    <section className="surface p-4 md:p-5">
      <SectionHead
        title={isManager ? "团队待办" : "我的待办"}
        href="/tasks"
        linkText="全部待办"
      />
      <ul className="mt-3 space-y-2">
        {tasksDue.rows.length === 0 && (
          <li className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-[var(--color-muted)]">
            暂无待办，状态不错
          </li>
        )}
        {tasksDue.rows.map(
          (t: {
            id: number;
            title: string;
            due_at: string | null;
            source: string;
            status: string;
          }) => {
            const due = dueMeta(t.due_at);
            const urgency = taskDueUrgency(t.due_at, t.status);
            return (
              <li key={t.id}>
                <AppLink
                  href="/tasks"
                  navFilters={
                    urgency === "overdue" || urgency === "urgent"
                      ? { urgency }
                      : undefined
                  }
                  className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 transition hover:border-sky-300 hover:bg-sky-50/40"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${due.dot}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted)]">
                      {t.source === "ai" && (
                        <span className="rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700 ring-1 ring-sky-200/80">
                          智能
                        </span>
                      )}
                      <span className={due.className}>{due.label}</span>
                      {t.status !== "done" && t.status !== "cancelled" ? (
                        <StatusTag kind="task_urgency" value={urgency} />
                      ) : null}
                    </div>
                  </div>
                </AppLink>
              </li>
            );
          }
        )}
      </ul>
    </section>
  );
}

function SalesSecondarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <DashboardPanelSkeleton title="洞察速览" rows={4} />
      <DashboardPanelSkeleton title="最近客户" rows={4} />
    </div>
  );
}

async function SalesSecondaryPanels({
  isManager,
  customerFilterSql,
  customerFilterParams,
  companyId,
  ownerIds,
}: {
  isManager: boolean;
  customerFilterSql: string;
  customerFilterParams: unknown[];
  companyId: number;
  ownerIds: number[];
}) {
  const insightFilter = {
    sql: `i.company_id = $1 AND (
      i.customer_id IS NULL OR EXISTS (
        SELECT 1 FROM customers c
        WHERE c.id = i.customer_id AND c.owner_id = ANY($2::bigint[])
      )
    )`,
    params: [companyId, ownerIds] as unknown[],
  };

  const competitorFilter = {
    sql: `m.company_id = $1 AND (
      m.customer_id IS NULL OR EXISTS (
        SELECT 1 FROM customers c
        WHERE c.id = m.customer_id AND c.owner_id = ANY($2::bigint[])
      )
    )`,
    params: [companyId, ownerIds] as unknown[],
  };

  const [recentCustomers, painPoints, competitorHits, recentInsights] =
    await Promise.all([
      pool.query(
        `SELECT id, company_name, name, industry, updated_at FROM customers c
         WHERE ${customerFilterSql}
         ORDER BY updated_at DESC LIMIT 6`,
        customerFilterParams
      ),
      pool.query(
        `SELECT jsonb_array_elements_text(COALESCE(c.profile_json->'pain_points','[]'::jsonb)) AS key,
                COUNT(*)::int AS value
         FROM customers c
         WHERE ${customerFilterSql}
         GROUP BY 1 ORDER BY value DESC LIMIT 6`,
        customerFilterParams
      ),
      pool.query(
        `SELECT COALESCE(comp.name, m.name) AS key, COUNT(*)::int AS value
         FROM competitor_mentions m
         LEFT JOIN competitors comp ON comp.id = m.competitor_id
         WHERE ${competitorFilter.sql}
         GROUP BY 1 ORDER BY value DESC LIMIT 5`,
        competitorFilter.params
      ),
      pool.query(
        `SELECT i.id, i.kind, i.summary, i.created_at, c.name AS customer_name, i.customer_id
         FROM ai_insights i
         LEFT JOIN customers c ON c.id = i.customer_id
         WHERE ${insightFilter.sql}
         ORDER BY i.created_at DESC LIMIT 3`,
        insightFilter.params
      ),
    ]);

  const competitorMax = Math.max(
    1,
    ...competitorHits.rows.map((r: { value: number }) => r.value)
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="surface overflow-hidden p-4 md:p-5">
        <SectionHead title="洞察速览" href="/insights" linkText="更多分析" />
        <div className="mt-4 space-y-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--color-muted)]">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-amber-100 text-amber-700">
                !
              </span>
              高频痛点
            </div>
            {painPoints.rows.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">暂无，解析沟通后可见</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {painPoints.rows.map((r: { key: string; value: number }) => (
                  <span
                    key={r.key}
                    className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200/70"
                  >
                    {r.key}
                    <span className="ml-1 text-amber-700/70">{r.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--color-muted)]">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-violet-100 text-violet-700">
                ※
              </span>
              热门竞品
            </div>
            {competitorHits.rows.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">暂无竞品提及</p>
            ) : (
              <div className="space-y-2">
                {competitorHits.rows.map((r: { key: string; value: number }) => (
                  <div key={r.key} className="flex items-center gap-2 text-sm">
                    <span className="w-24 truncate font-medium">{r.key}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-violet-400"
                        style={{
                          width: `${Math.round((r.value / competitorMax) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-6 text-right tabular-nums text-[var(--color-muted)]">
                      {r.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-[var(--color-muted)]">
              最近洞察
            </div>
            {recentInsights.rows.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">上传沟通记录后可见</p>
            ) : (
              <ul className="space-y-2">
                {recentInsights.rows.map(
                  (ins: {
                    id: number;
                    kind: string;
                    summary: string | null;
                    customer_name?: string;
                    customer_id?: number;
                    created_at: string;
                  }) => (
                    <li
                      key={ins.id}
                      className="rounded-lg border border-[var(--color-border)] px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
                        <span>{labelOfMedia(ins.kind)}</span>
                        <span>·</span>
                        <span>{formatRelativeTime(ins.created_at)}</span>
                        {ins.customer_id ? (
                          <>
                            <span>·</span>
                            <AppLink
                              href={`/customers/${ins.customer_id}`}
                              className="text-[var(--color-accent)] hover:underline"
                            >
                              {ins.customer_name || "客户"}
                            </AppLink>
                          </>
                        ) : null}
                      </div>
                      <div className="mt-1 line-clamp-2 text-sm">
                        {ins.summary || "无摘要"}
                      </div>
                    </li>
                  )
                )}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="surface p-4 md:p-5">
        <SectionHead
          title={isManager ? "团队最近客户" : "最近客户"}
          href="/customers"
          linkText="全部客户"
        />
        <ul className="mt-3 space-y-2">
          {recentCustomers.rows.length === 0 && (
            <li className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-[var(--color-muted)]">
              暂无客户
            </li>
          )}
          {recentCustomers.rows.map(
            (c: {
              id: number;
              company_name: string | null;
              name: string;
              industry: string | null;
              updated_at: string;
            }) => (
              <li key={c.id}>
                <AppLink
                  href={`/customers/${c.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2.5 transition hover:border-sky-300 hover:bg-sky-50/40"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {c.company_name || c.name}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                      {[c.name, c.industry].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--color-muted)]">
                    {formatDate(c.updated_at)}
                  </span>
                </AppLink>
              </li>
            )
          )}
        </ul>
      </section>
    </div>
  );
}

function labelOfMedia(kind: string) {
  return (
    MEDIA_KIND_LABELS[kind as keyof typeof MEDIA_KIND_LABELS] || kind || "洞察"
  );
}

/* ─── 共用 UI ─── */

function SectionHead({
  title,
  href,
  linkText,
}: {
  title: string;
  href: string;
  linkText: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <AppLink
        href={href}
        className="text-sm font-medium text-[var(--color-accent)] hover:underline"
      >
        {linkText}
      </AppLink>
    </div>
  );
}

type StatTone = "navy" | "slate" | "amber" | "blue" | "green";
type StatIconName = "users" | "spark" | "tag" | "check" | "pool" | "team" | "won";

function StatCard({
  label,
  value,
  href,
  tone,
  icon,
  navFilters,
}: {
  label: string;
  value: number | string;
  href: string;
  tone: StatTone;
  icon: StatIconName;
  navFilters?: ListNavFilters;
}) {
  const tones = {
    navy: {
      wrap: "from-[#eff4fb] to-white border-[#d7e0ea]",
      icon: "bg-[#1e3a5f] text-white",
    },
    slate: {
      wrap: "from-slate-50 to-white border-slate-200",
      icon: "bg-slate-600 text-white",
    },
    amber: {
      wrap: "from-amber-50 to-white border-amber-200/80",
      icon: "bg-amber-500 text-white",
    },
    blue: {
      wrap: "from-sky-50 to-white border-sky-200/80",
      icon: "bg-[var(--color-accent)] text-white",
    },
    green: {
      wrap: "from-emerald-50 to-white border-emerald-200/80",
      icon: "bg-emerald-600 text-white",
    },
  }[tone];

  return (
    <AppLink
      href={href}
      navFilters={navFilters}
      className={`surface block bg-gradient-to-br p-4 transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(30,58,95,0.12)] ${tones.wrap}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-[var(--color-muted)]">{label}</div>
          <div className="mt-2 truncate text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
            {value}
          </div>
        </div>
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ${tones.icon}`}
        >
          <StatIcon name={icon} />
        </span>
      </div>
    </AppLink>
  );
}

function StatIcon({ name }: { name: StatIconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    "aria-hidden": true as const,
  };
  if (name === "users" || name === "team") {
    return (
      <svg {...common}>
        <path
          d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="2" />
        <path
          d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a3 3 0 0 1 0 5.74"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === "pool") {
    return (
      <svg {...common}>
        <path
          d="M4 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M4 10c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === "won") {
    return (
      <svg {...common}>
        <path
          d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17 4h2a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4M7 4H5a2 2 0 0 0-2 2v1a4 4 0 0 0 4 4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === "spark") {
    return (
      <svg {...common}>
        <path
          d="M12 3v4M12 17v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M3 12h4M17 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === "tag") {
    return (
      <svg {...common}>
        <path
          d="M20 10V7a2 2 0 0 0-2-2h-3L7 13l5 5 8-8Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="14.5" cy="7.5" r="1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path
        d="M5 12.5 10 17.5 19 7"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function dueMeta(dueAt: string | null) {
  if (!dueAt) {
    return {
      label: "无截止",
      className: "text-[var(--color-muted)]",
      dot: "bg-slate-300",
    };
  }
  const due = new Date(dueAt);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round(
    (startDue.getTime() - startToday.getTime()) / (24 * 3600 * 1000)
  );
  if (diffDays < 0) {
    return {
      label: `已逾期 ${formatDate(dueAt)}`,
      className: "font-medium text-rose-600",
      dot: "bg-rose-500",
    };
  }
  if (diffDays === 0) {
    return {
      label: `今天截止 · ${formatDate(dueAt)}`,
      className: "font-medium text-amber-700",
      dot: "bg-amber-500",
    };
  }
  return {
    label: `截止 ${formatDate(dueAt)}`,
    className: "text-[var(--color-muted)]",
    dot: "bg-emerald-500",
  };
}
