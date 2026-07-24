"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { CardListSkeleton } from "@/components/ui/Skeleton";
import { useSessionUser } from "@/components/shared/SessionUserContext";
import { useUi } from "@/components/ui/Feedback";
import { downloadBlob, filenameFromContentDisposition } from "@/lib/download-export";
import type { ListNavFilters } from "@/lib/nav-filters";
import { ROLE_LABELS, type UserRole } from "@/types";
import { cn } from "@/lib/utils";

type Person = { id: number; name: string };

type MemberRow = {
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
const REPORT_START_YEAR = 2026;
const REPORT_START_MONTH = 7;

function currentMonthKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthOptions() {
  const list: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; ; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    if (
      d.getFullYear() < REPORT_START_YEAR ||
      (d.getFullYear() === REPORT_START_YEAR &&
        d.getMonth() + 1 < REPORT_START_MONTH)
    ) {
      break;
    }
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    list.push({
      value: v,
      label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
    });
  }
  return list;
}

/** 所选月份是否连续（按自然月） */
function areMonthKeysContiguous(keys: string[]) {
  const indexes = [
    ...new Set(
      keys
        .map((k) => {
          const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(k.trim());
          if (!m) return null;
          return Number(m[1]) * 12 + Number(m[2]);
        })
        .filter((n): n is number => n != null)
    ),
  ].sort((a, b) => a - b);
  if (indexes.length <= 1) return true;
  for (let i = 1; i < indexes.length; i++) {
    if (indexes[i] !== indexes[i - 1] + 1) return false;
  }
  return true;
}

function formatCny(n: number) {
  return `¥${n.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/** 半开区间 [from, to) → 闭区间结束日 YYYY-MM-DD */
function inclusiveEnd(toExclusive: string) {
  const d = new Date(`${toExclusive}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function MetricValue({
  label,
  value,
  emphasize,
  align = "left",
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  emphasize?: boolean;
  align?: "left" | "center";
  tone?: "neutral" | "blue" | "emerald";
}) {
  return (
    <div className={cn(align === "center" && "text-center")}>
      <div className="text-[11px] leading-none text-[var(--color-muted)]">
        {label}
      </div>
      <div
        className={cn(
          "mt-1.5 tabular-nums font-extrabold tracking-tight",
          emphasize ? "text-xl leading-none" : "text-lg leading-none",
          tone === "blue" && "text-sky-800",
          tone === "emerald" && "text-emerald-800",
          tone === "neutral" && "text-slate-900"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MetricLink({
  href,
  label,
  value,
  navFilters,
  emphasize,
  className,
  align,
  tone,
}: {
  href: string;
  label: string;
  value: string | number;
  navFilters?: ListNavFilters;
  emphasize?: boolean;
  className?: string;
  align?: "left" | "center";
  tone?: "neutral" | "blue" | "emerald";
}) {
  return (
    <AppLink
      href={href}
      navFilters={navFilters}
      className={cn(
        "block rounded-lg bg-slate-50 px-2.5 py-2.5 transition hover:bg-slate-100",
        className
      )}
    >
      <MetricValue
        label={label}
        value={value}
        emphasize={emphasize}
        align={align}
        tone={tone}
      />
    </AppLink>
  );
}

/** 无对应列表页时仅展示，避免跳到错误筛选 */
function MetricStat({
  label,
  value,
  emphasize,
  className,
  align,
  tone,
}: {
  label: string;
  value: string | number;
  emphasize?: boolean;
  className?: string;
  align?: "left" | "center";
  tone?: "neutral" | "blue" | "emerald";
}) {
  return (
    <div className={cn("rounded-lg bg-slate-50 px-2.5 py-2.5", className)}>
      <MetricValue
        label={label}
        value={value}
        emphasize={emphasize}
        align={align}
        tone={tone}
      />
    </div>
  );
}

function SectionLabel({
  children,
  color,
}: {
  children: ReactNode;
  color: "slate" | "teal";
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "h-3 w-0.5 rounded-full",
          color === "slate" && "bg-slate-400",
          color === "teal" && "bg-teal-500"
        )}
        aria-hidden
      />
      <span className="text-[11px] font-medium text-[var(--color-muted)]">
        {children}
      </span>
    </div>
  );
}

function MemberCard({
  row,
  periodLabel,
  from,
  toEnd,
  contiguous,
}: {
  row: MemberRow;
  periodLabel: string;
  from: string;
  toEnd: string;
  contiguous: boolean;
}) {
  const owner = { ownerQ: row.name };
  // 不连续多选时列表页无法表达「月并集」，仅带负责人；连续时带日期区间
  const period = contiguous
    ? { createdFrom: from, createdTo: toEnd }
    : {};
  const wonPeriod = contiguous
    ? {
        ...period,
        stages: ["won"],
        dateField: "updated_at" as const,
      }
    : { stages: ["won"] };

  return (
    <article className="surface overflow-hidden">
      <header className="flex items-baseline justify-between gap-3 border-b border-[var(--color-border)] bg-slate-50/60 px-4 py-3">
        <h3 className="min-w-0 truncate text-base font-semibold" title={row.name}>
          {row.name}
        </h3>
        <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-xs text-[var(--color-muted)] ring-1 ring-slate-200/80">
          {ROLE_LABELS[row.role as UserRole] || row.role}
        </span>
      </header>

      <section className="px-4 py-3">
        <div className="mb-2">
          <SectionLabel color="slate">当前存量</SectionLabel>
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-200/90 overflow-hidden rounded-lg bg-slate-50">
          <MetricLink
            href="/customers"
            label="私海客户"
            value={row.customers}
            navFilters={owner}
            align="center"
            className="rounded-none bg-transparent px-2 py-3 hover:bg-slate-100/80"
          />
          <MetricLink
            href="/opportunities"
            label="推进中商机"
            value={row.open_opps}
            navFilters={{ ...owner, open: true }}
            align="center"
            className="rounded-none bg-transparent px-2 py-3 hover:bg-slate-100/80"
          />
          <MetricLink
            href="/tasks"
            label="待办"
            value={row.open_tasks}
            navFilters={{ ...owner, status: "pending" }}
            align="center"
            className="rounded-none bg-transparent px-2 py-3 hover:bg-slate-100/80"
          />
        </div>
      </section>

      <section className="border-t border-[var(--color-border)] px-4 py-3">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
          <SectionLabel color="teal">周期业绩</SectionLabel>
          <span
            className="min-w-0 truncate text-[11px] text-[var(--color-muted)]"
            title={periodLabel}
          >
            {periodLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricLink
            href="/opportunities"
            label="商机金额"
            value={formatCny(row.opportunity_amount)}
            navFilters={{ ...owner, ...period }}
            emphasize
            tone="blue"
            className="bg-sky-50 hover:bg-sky-100/80"
          />
          <MetricLink
            href="/opportunities"
            label="成交额"
            value={formatCny(row.won_amount)}
            navFilters={{ ...owner, ...wonPeriod }}
            emphasize
            tone="emerald"
            className="bg-emerald-50 hover:bg-emerald-100/80"
          />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <MetricLink
            href="/customers"
            label="新建客户"
            value={row.new_customers}
            navFilters={{ ...owner, ...period }}
          />
          <MetricLink
            href="/opportunities"
            label="新建商机"
            value={row.opportunities}
            navFilters={{ ...owner, ...period }}
          />
          <MetricLink
            href="/opportunities"
            label="成交单数"
            value={row.won_count}
            navFilters={{ ...owner, ...wonPeriod }}
          />
          <MetricStat label="跟进记录" value={row.follow_ups} />
        </div>
      </section>
    </article>
  );
}

export default function ReportsPage() {
  const me = useSessionUser();
  const ui = useUi();
  const isCompanyAdmin =
    me.role === "company_admin" || Boolean(me.act_as_company_id);
  const isSalesManager = me.role === "sales_manager" && !me.act_as_company_id;
  const canPickOwner = isCompanyAdmin || isSalesManager;

  const [keys, setKeys] = useState<string[]>([currentMonthKey()]);
  const [owner, setOwner] = useState(canPickOwner ? "all" : String(me.id));
  const [people, setPeople] = useState<Person[]>([]);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [periodLabel, setPeriodLabel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [contiguous, setContiguous] = useState(true);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [generating, setGenerating] = useState(false);

  const periods = useMemo(() => monthOptions(), []);

  const loadPeople = useCallback(async () => {
    setLoadingPeople(true);
    try {
      const a = await fetch("/api/reports/people");
      const aj = await a.json();
      if (!a.ok) throw new Error(aj.error || "加载失败");
      setPeople(aj.data || []);
    } catch (e) {
      ui.error("加载失败", e instanceof Error ? e.message : "");
    } finally {
      setLoadingPeople(false);
    }
  }, [ui]);

  const loadRows = useCallback(async () => {
    if (keys.length === 0) {
      setRows([]);
      setPeriodLabel("");
      setFrom("");
      setTo("");
      setContiguous(true);
      setLoadingRows(false);
      return;
    }
    setLoadingRows(true);
    try {
      const params = new URLSearchParams({
        period_keys: keys.join(","),
      });
      if (owner !== "all") params.set("owner_id", owner);
      const r = await fetch(`/api/reports?${params}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "加载失败");
      const data = j.data || {};
      setRows(data.rows || []);
      setPeriodLabel(data.periodLabel || "");
      setFrom(data.from || "");
      setTo(data.to || "");
      setContiguous(data.contiguous !== false);
    } catch (e) {
      ui.error("加载成员数据失败", e instanceof Error ? e.message : "");
    } finally {
      setLoadingRows(false);
    }
  }, [keys, owner, ui]);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  function changeKeys(next: string[]) {
    if (next.length === 0) {
      ui.error("请至少选择一个统计周期");
      return;
    }
    setKeys(next);
  }

  async function generate() {
    if (keys.length === 0) {
      ui.error("请至少选择一个统计周期");
      return;
    }
    if (!areMonthKeysContiguous(keys)) {
      ui.error("所选月份必须连续", "请选择连续的月份区间，例如 7、8、9 月");
      return;
    }
    setGenerating(true);
    try {
      const r = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_keys: keys,
          owner_id: owner === "all" ? null : Number(owner),
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "生成失败");
      }
      const blob = await r.blob();
      const cd = r.headers.get("Content-Disposition") || "";
      const fileName = filenameFromContentDisposition(
        cd,
        `经营报表-${keys.join(",")}.xlsx`
      );
      downloadBlob(blob, fileName);
      ui.success("报表已生成", "已开始下载");
    } catch (e) {
      ui.error("生成失败", e instanceof Error ? e.message : "");
    } finally {
      setGenerating(false);
    }
  }

  const ownerOptions = [
    ...(isCompanyAdmin ? [{ value: "all", label: "全公司" }] : []),
    ...(isSalesManager ? [{ value: "all", label: "本人及下属" }] : []),
    ...people.map((p) => ({ value: String(p.id), label: p.name })),
  ];

  const toEnd = to ? inclusiveEnd(to) : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">经营报表</h1>
        <p className="text-sm text-[var(--color-muted)]">
          查看成员存量与周期业绩；成员跟单支持不连续多选，导出 Excel 需选择连续月份。
          {isCompanyAdmin
            ? " 公司管理员可查看全公司。"
            : isSalesManager
              ? " 销售经理可查看本人及下属。"
              : " 销售仅可查看本人数据。"}
        </p>
      </div>

      <section className="surface p-4 md:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="field w-56 max-w-full shrink-0">
            <label>统计周期</label>
            <Select
              multiple
              value={keys}
              onChange={changeKeys}
              options={periods}
              placeholder="选择月份"
            />
          </div>

          {canPickOwner && (
            <div className="field w-44 max-w-full shrink-0">
              <label>数据范围</label>
              <Select
                value={owner}
                onChange={setOwner}
                options={ownerOptions}
              />
            </div>
          )}

          <Button
            onClick={() => void generate()}
            disabled={generating || loadingPeople || keys.length === 0}
          >
            {generating ? "正在生成…" : "生成 Excel"}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-base font-semibold">成员跟单</h2>
          {periodLabel && (
            <p className="text-xs text-[var(--color-muted)]">
              周期业绩：{periodLabel} · 存量实时
            </p>
          )}
        </div>

        {loadingRows ? (
          <CardListSkeleton count={4} className="sm:grid-cols-2 xl:grid-cols-3" />
        ) : rows.length === 0 ? (
          <div className="surface px-4 py-10 text-center text-sm text-[var(--color-muted)]">
            暂无成员数据
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <MemberCard
                key={row.id}
                row={row}
                periodLabel={periodLabel}
                from={from}
                toEnd={toEnd}
                contiguous={contiguous}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
