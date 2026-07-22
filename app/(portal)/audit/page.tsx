"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { DatePicker } from "@/components/ui/DatePicker";
import { Modal } from "@/components/ui/Modal";
import { TableSkeleton, CardListSkeleton } from "@/components/ui/Skeleton";
import { ViewModeToggle, useViewMode } from "@/components/ui/ViewModeToggle";
import { EMPTY_PAGE_META, pageRowNo, type PageMeta } from "@/lib/pagination";
import {
  AUDIT_CATEGORY_OPTIONS,
  auditActionLabel,
  auditCategoryLabel,
  lastNDaysRange,
  readableAuditSummary,
} from "@/lib/audit-labels";
import { TruncateWithDelayTip } from "@/components/ui/DelayedTooltip";
import { pageCacheFetchJson, pageCachePeek } from "@/lib/page-cache";

type Log = {
  id: number;
  action: string;
  summary: string | null;
  actor_id?: number | null;
  actor_name?: string | null;
  company_id?: number | null;
  company_name?: string | null;
  created_at: string;
  target_type?: string | null;
  target_id?: string | null;
};

type ActorOption = { id: number; name: string };
type CompanyOption = { id: number; name: string };

function AuditSummaryCell({
  action,
  summary,
}: {
  action: string;
  summary: string | null;
}) {
  const full = summary?.replace(/\s+/g, " ").trim() || "";
  if (!full) return <span>—</span>;
  const short = readableAuditSummary(action, summary);
  const display = short === "—" ? full : short;
  return (
    <TruncateWithDelayTip
      text={full}
      alwaysShowTip={display !== full}
      className="block max-w-full"
    >
      {display}
    </TruncateWithDelayTip>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-sm break-words whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}

function defaultRange() {
  return lastNDaysRange(7);
}

function auditSeedUrl(from: string, to: string) {
  return `/api/audit-logs?page=1&pageSize=10&from=${from}&to=${to}`;
}

export default function AuditPage() {
  const range0 = useMemo(() => defaultRange(), []);
  const [viewMode, changeViewMode] = useViewMode("crm:audit-view");
  const seedUrl = auditSeedUrl(range0.from, range0.to);
  const seed = pageCachePeek<{
    data?: Log[];
    meta?: PageMeta & { platform_wide?: boolean };
  }>(seedUrl);
  const [list, setList] = useState<Log[]>(() => seed?.data || []);
  const [actors, setActors] = useState<ActorOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [platformWide, setPlatformWide] = useState(
    () => Boolean(seed?.meta?.platform_wide)
  );
  const [loading, setLoading] = useState(() => seed == null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Log | null>(null);
  const hasRowsRef = useRef((seed?.data?.length || 0) > 0);

  const [q, setQ] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [actorId, setActorId] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState(range0.from);
  const [to, setTo] = useState(range0.to);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PageMeta>(seed?.meta || EMPTY_PAGE_META);
  hasRowsRef.current = list.length > 0;

  const companyOptions = useMemo(
    () => [
      { value: "", label: "全部公司" },
      ...companies.map((c) => ({ value: String(c.id), label: c.name })),
    ],
    [companies]
  );

  const actorOptions = useMemo(
    () => [
      { value: "", label: "全部人员" },
      { value: "system", label: "系统" },
      ...actors.map((a) => ({ value: String(a.id), label: a.name })),
    ],
    [actors]
  );

  const loadCompanies = useCallback(async () => {
    try {
      const res = await fetch("/api/companies?page=1&pageSize=200");
      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) {
        setCompanies(
          json.data.map((c: { id: number; name: string }) => ({
            id: c.id,
            name: c.name,
          }))
        );
        setPlatformWide(true);
      }
    } catch {
      /* 非超管无权限，忽略 */
    }
  }, []);

  const loadActors = useCallback(async (cid?: string) => {
    try {
      const params = new URLSearchParams();
      if (cid) params.set("company_id", cid);
      const qs = params.toString();
      const res = await fetch(`/api/users${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) {
        setActors(
          json.data.map((u: { id: number; name: string }) => ({
            id: u.id,
            name: u.name,
          }))
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(
    async (opts?: {
      q?: string;
      companyId?: string;
      actorId?: string;
      category?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
      force?: boolean;
    }) => {
      const keyword = opts?.q ?? q;
      const cid = opts?.companyId ?? companyId;
      const aid = opts?.actorId ?? actorId;
      const cat = opts?.category ?? category;
      const f = opts?.from ?? from;
      const t = opts?.to ?? to;
      const p = opts?.page ?? page;
      const size = opts?.pageSize ?? pageSize;
      const force = opts?.force === true;

      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(size),
      });
      if (keyword.trim()) params.set("q", keyword.trim());
      if (cid) params.set("company_id", cid);
      if (aid) params.set("actor_id", aid);
      if (cat) params.set("category", cat);
      if (f) params.set("from", f);
      if (t) params.set("to", t);
      const url = `/api/audit-logs?${params}`;

      const cached = pageCachePeek<{
        data?: Log[];
        meta?: PageMeta & { platform_wide?: boolean };
        error?: string;
      }>(url);
      if (!force && cached?.data) {
        setList(cached.data);
        if (typeof cached.meta?.platform_wide === "boolean") {
          setPlatformWide(cached.meta.platform_wide);
        }
        if (cached.meta) {
          setMeta({
            total: Number(cached.meta.total) || 0,
            page: Number(cached.meta.page) || p,
            pageSize: Number(cached.meta.pageSize) || size,
            totalPages: Math.max(1, Number(cached.meta.totalPages) || 1),
          });
        }
        setLoading(false);
        setError("");
        return;
      }
      if (cached?.data) {
        setList(cached.data);
        if (cached.meta) {
          setMeta({
            total: Number(cached.meta.total) || 0,
            page: Number(cached.meta.page) || p,
            pageSize: Number(cached.meta.pageSize) || size,
            totalPages: Math.max(1, Number(cached.meta.totalPages) || 1),
          });
        }
      }
      const soft = hasRowsRef.current || Boolean(cached?.data);
      if (!soft) setLoading(true);
      try {
        const { res, json } = await pageCacheFetchJson<{
          data?: Log[];
          meta?: PageMeta & { platform_wide?: boolean };
          error?: string;
        }>(url, { force });
        if (!res.ok) setError(json.error || "加载失败");
        else {
          setError("");
          setList(json.data || []);
          if (typeof json.meta?.platform_wide === "boolean") {
            setPlatformWide(json.meta.platform_wide);
          }
          if (json.meta) {
            const nextMeta: PageMeta = {
              total: Number(json.meta.total) || 0,
              page: Number(json.meta.page) || p,
              pageSize: Number(json.meta.pageSize) || size,
              totalPages: Math.max(1, Number(json.meta.totalPages) || 1),
            };
            setMeta(nextMeta);
            if (nextMeta.page !== p) setPage(nextMeta.page);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [q, companyId, actorId, category, from, to, page, pageSize]
  );

  useEffect(() => {
    loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadActors(companyId || undefined);
  }, [companyId, loadActors]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  function onSearch() {
    if (from && to && from > to) {
      setError("开始日期不能晚于结束日期");
      return;
    }
    if (page === 1) load({ page: 1 });
    else setPage(1);
  }

  function resetFilters() {
    const r = defaultRange();
    setQ("");
    setCompanyId("");
    setActorId("");
    setCategory("");
    setFrom(r.from);
    setTo(r.to);
    if (page === 1) {
      load({
        q: "",
        companyId: "",
        actorId: "",
        category: "",
        from: r.from,
        to: r.to,
        page: 1,
      });
    } else setPage(1);
  }

  const colCount = platformWide ? 8 : 6;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">审计日志</h1>
          <p className="text-sm text-[var(--color-muted)]">
            关键写操作可追溯 · 默认近 7 天 · 点击行查看详情
          </p>
        </div>
        <ViewModeToggle value={viewMode} onChange={changeViewMode} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {platformWide && (
          <div className="field w-44 min-w-[10rem]">
            <label>公司</label>
            <Select
              value={companyId}
              onChange={(v) => {
                setCompanyId(v);
                setActorId("");
              }}
              options={companyOptions}
              searchable
              placement="auto"
            />
          </div>
        )}
        <div className="field w-40 min-w-[9rem]">
          <label>人员</label>
          <Select
            value={actorId}
            onChange={setActorId}
            options={actorOptions}
            searchable
            placement="auto"
          />
        </div>
        <div className="field w-40 min-w-[9rem]">
          <label>类别</label>
          <Select
            value={category}
            onChange={setCategory}
            options={[...AUDIT_CATEGORY_OPTIONS]}
            placement="auto"
          />
        </div>
        <div className="field w-40 min-w-[9rem]">
          <label>开始日期</label>
          <DatePicker value={from} onChange={setFrom} placeholder="开始" />
        </div>
        <div className="field w-40 min-w-[9rem]">
          <label>结束日期</label>
          <DatePicker value={to} onChange={setTo} placeholder="结束" />
        </div>
        <div className="field w-52 min-w-[12rem] flex-1">
          <label>关键词</label>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              platformWide ? "动作 / 摘要 / 人员 / 公司" : "动作 / 摘要 / 人员"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2 pb-0.5">
          <Button variant="secondary" onClick={onSearch}>
            查询
          </Button>
          <Button variant="secondary" onClick={resetFilters}>
            重置
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading && viewMode === "table" && (
        <TableSkeleton rows={8} cols={colCount} />
      )}
      {loading && viewMode === "card" && (
        <CardListSkeleton count={4} className="sm:grid-cols-2" />
      )}

      {!loading && viewMode === "table" && (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
              <tr>
                <th className="w-14 px-4 py-3 font-medium">#</th>
                <th className="w-[1%] whitespace-nowrap px-3 py-3 font-medium">
                  时间
                </th>
                {platformWide && (
                  <th className="whitespace-nowrap px-4 py-3 font-medium">公司</th>
                )}
                <th className="whitespace-nowrap px-4 py-3 font-medium">人员</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">类别</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">动作</th>
                <th className="px-4 py-3 font-medium">摘要</th>
                {platformWide && (
                  <th className="whitespace-nowrap px-4 py-3 font-medium">对象</th>
                )}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td
                    colSpan={colCount}
                    className="px-4 py-6 text-[var(--color-muted)]"
                  >
                    暂无日志
                  </td>
                </tr>
              )}
              {list.map((l, i) => (
                <tr
                  key={l.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer border-t border-[var(--color-border)] align-top transition hover:bg-slate-50/80"
                  onClick={() => setDetail(l)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetail(l);
                    }
                  }}
                >
                  <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">
                    {pageRowNo(meta, i)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-[var(--color-muted)]">
                    {new Date(l.created_at).toLocaleString("zh-CN")}
                  </td>
                  {platformWide && (
                    <td className="whitespace-nowrap px-4 py-3">
                      {l.company_name || "—"}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-3">
                    {l.actor_name || "系统"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {auditCategoryLabel(l.action)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">
                    {auditActionLabel(l.action)}
                  </td>
                  <td className="max-w-[14rem] px-4 py-3 text-[var(--color-muted)] lg:max-w-xs">
                    <AuditSummaryCell action={l.action} summary={l.summary} />
                  </td>
                  {platformWide && (
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--color-muted)]">
                      {l.target_type
                        ? `${l.target_type}${l.target_id != null ? `#${l.target_id}` : ""}`
                        : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && viewMode === "card" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {list.length === 0 && (
            <div className="text-sm text-[var(--color-muted)]">暂无日志</div>
          )}
          {list.map((l) => (
            <button
              key={l.id}
              type="button"
              className="surface card-interactive relative space-y-1.5 p-4 text-left text-sm"
              onClick={() => setDetail(l)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="card-corner-status">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/15">
                    {auditCategoryLabel(l.action)}
                  </span>
                </div>
                <div className="min-w-0 font-medium">
                  {auditActionLabel(l.action)}
                </div>
              </div>
              <div className="text-xs text-[var(--color-muted)]">
                {platformWide && (l.company_name || "—") + " · "}
                {l.actor_name || "系统"} ·{" "}
                {new Date(l.created_at).toLocaleString("zh-CN")}
              </div>
              {l.summary && (
                <div className="line-clamp-3 break-words text-[var(--color-muted)]">
                  {l.summary}
                </div>
              )}
              {platformWide && l.target_type && (
                <div className="text-xs text-[var(--color-muted)]">
                  对象：{l.target_type}
                  {l.target_id != null ? `#${l.target_id}` : ""}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <PaginationBar
        meta={meta}
        pageSize={pageSize}
        loading={loading}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      <Modal
        open={Boolean(detail)}
        title="审计详情"
        description={
          detail
            ? `${auditActionLabel(detail.action)} · ${new Date(
                detail.created_at
              ).toLocaleString("zh-CN")}`
            : undefined
        }
        onClose={() => setDetail(null)}
        size="md"
        footer={
          <Button type="button" variant="secondary" onClick={() => setDetail(null)}>
            关闭
          </Button>
        }
      >
        {detail ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailField label="时间">
                {new Date(detail.created_at).toLocaleString("zh-CN")}
              </DetailField>
              <DetailField label="人员">
                {detail.actor_name || "系统"}
              </DetailField>
              {platformWide ? (
                <DetailField label="公司">
                  {detail.company_name || "—"}
                </DetailField>
              ) : null}
              <DetailField label="类别">
                {auditCategoryLabel(detail.action)}
              </DetailField>
              <DetailField label="动作">
                {auditActionLabel(detail.action)}
              </DetailField>
              {platformWide ? (
                <DetailField label="对象">
                  {detail.target_type
                    ? `${detail.target_type}${
                        detail.target_id != null ? `#${detail.target_id}` : ""
                      }`
                    : "—"}
                </DetailField>
              ) : null}
            </div>
            <DetailField label="摘要">
              {detail.summary?.trim() || "—"}
            </DetailField>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
