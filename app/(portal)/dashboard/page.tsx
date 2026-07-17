import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getVisibleOwnerIds, buildOwnerFilter } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { STAGE_LABELS, type OpportunityStage } from "@/types";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await requireSession().catch(() => null);
  if (!user) redirect("/login");
  if (user.role === "super_admin") redirect("/platform");

  const owners = await getVisibleOwnerIds(user);
  const filter = buildOwnerFilter(owners, user.company_id, "c");

  const [customerCount, oppByStage, tasksDue, recentCustomers] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS c FROM customers c WHERE ${filter.sql}`,
      filter.params
    ),
    pool.query(
      `SELECT o.stage, COUNT(*)::int AS c
       FROM opportunities o
       WHERE ${buildOwnerFilter(owners, user.company_id, "o").sql}
       GROUP BY o.stage`,
      buildOwnerFilter(owners, user.company_id, "o").params
    ),
    pool.query(
      `SELECT * FROM tasks
       WHERE owner_id = $1 AND status != 'done'
       ORDER BY due_at NULLS LAST LIMIT 8`,
      [user.id]
    ),
    pool.query(
      `SELECT id, name, industry, updated_at FROM customers c
       WHERE ${filter.sql}
       ORDER BY updated_at DESC LIMIT 6`,
      filter.params
    ),
  ]);

  const stageMap = Object.fromEntries(
    oppByStage.rows.map((r: { stage: string; c: number }) => [r.stage, r.c])
  ) as Record<string, number>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">工作台</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          你好，{user.name}。今日待跟进与商机概览。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="可见客户" value={customerCount.rows[0]?.c || 0} />
        <StatCard label="新线索" value={stageMap.lead || 0} />
        <StatCard label="报价中" value={stageMap.proposal || 0} />
        <StatCard label="待办未完成" value={tasksDue.rows.length} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="surface p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">商机漏斗</h2>
            <Link href="/opportunities" className="text-sm text-[var(--color-accent)]">
              查看全部
            </Link>
          </div>
          <div className="space-y-2">
            {(Object.keys(STAGE_LABELS) as OpportunityStage[]).map((stage) => (
              <div key={stage} className="flex items-center gap-3 text-sm">
                <div className="w-16 text-[var(--color-muted)]">{STAGE_LABELS[stage]}</div>
                <div className="h-2 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded bg-[var(--color-accent)]"
                    style={{
                      width: `${Math.min(100, (stageMap[stage] || 0) * 12)}%`,
                    }}
                  />
                </div>
                <div className="w-8 text-right font-semibold">{stageMap[stage] || 0}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="surface p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">我的待办</h2>
            <Link href="/tasks" className="text-sm text-[var(--color-accent)]">
              全部待办
            </Link>
          </div>
          <ul className="space-y-2">
            {tasksDue.rows.length === 0 && (
              <li className="text-sm text-[var(--color-muted)]">暂无待办</li>
            )}
            {tasksDue.rows.map((t: { id: number; title: string; due_at: string | null; source: string }) => (
              <li
                key={t.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="text-xs text-[var(--color-muted)]">
                    {t.source === "ai" ? "AI 生成 · " : ""}
                    {t.due_at ? `截止 ${formatDate(t.due_at)}` : "无截止日"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="surface p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">最近客户</h2>
          <Link href="/customers" className="text-sm text-[var(--color-accent)]">
            客户列表
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {recentCustomers.rows.map(
            (c: { id: number; name: string; industry: string | null; updated_at: string }) => (
              <Link
                key={c.id}
                href={`/customers/${c.id}`}
                className="rounded-lg border border-[var(--color-border)] px-3 py-3 hover:border-[var(--color-accent)]"
              >
                <div className="font-medium">{c.name}</div>
                <div className="mt-1 text-xs text-[var(--color-muted)]">
                  {c.industry || "未填行业"} · {formatDate(c.updated_at)}
                </div>
              </Link>
            )
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface p-4">
      <div className="text-sm text-[var(--color-muted)]">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
