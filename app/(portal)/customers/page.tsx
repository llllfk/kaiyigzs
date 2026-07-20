"use client";

import { AppLink } from "@/components/ui/AppLink";
import { useAppRouter } from "@/hooks/useAppRouter";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { Modal } from "@/components/ui/Modal";
import { DatePicker } from "@/components/ui/DatePicker";
import { EMPTY_PAGE_META, pageRowNo, type PageMeta } from "@/lib/pagination";
import { subscribeListFilters, takeListFilters, normalizePath } from "@/lib/nav-filters";
import { useUi } from "@/components/ui/Feedback";
import {
  customerLabel,
  formatDateTime,
  formatIdleSince,
} from "@/lib/utils";
import {
  CUSTOMER_STATUS_OPTIONS,
  type CustomerStatus,
  type SessionUser,
} from "@/types";
import { StatusTag } from "@/components/ui/StatusTag";
import { CardListSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { downloadExport, exportStamp } from "@/lib/download-export";

type Customer = {
  id: number;
  company_name: string | null;
  name: string;
  phone: string | null;
  industry: string | null;
  source: string | null;
  status: CustomerStatus;
  owner_name?: string;
  opportunity_count?: number;
  last_follow_at?: string | null;
  created_at?: string;
};

function canShowOwnerSearch(user: SessionUser) {
  if (user.act_as_company_id) return true;
  return user.role === "company_admin" || user.role === "sales_manager";
}

const emptyForm = {
  company_name: "",
  name: "",
  phone: "",
  industry: "",
  source: "",
  status: "active" as CustomerStatus,
};

export default function CustomersPage() {
  const ui = useUi();
  const router = useAppRouter();
  const pathname = usePathname();
  const [list, setList] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [ownerQ, setOwnerQ] = useState("");
  const [status, setStatus] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [canOwnerSearch, setCanOwnerSearch] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [navReady, setNavReady] = useState(false);
  const [navToken, setNavToken] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("crm:customers-view");
      if (saved === "table" || saved === "card") {
        setViewMode(saved);
        return;
      }
      if (window.matchMedia("(max-width: 767px)").matches) {
        setViewMode("card");
      }
    } catch {
      /* ignore */
    }
  }, []);

  function changeViewMode(mode: "table" | "card") {
    setViewMode(mode);
    try {
      localStorage.setItem("crm:customers-view", mode);
    } catch {
      /* ignore */
    }
  }

  const load = useCallback(
    async (opts?: {
      keyword?: string;
      ownerKeyword?: string;
      status?: string;
      createdFrom?: string;
      createdTo?: string;
      page?: number;
      pageSize?: number;
    }) => {
      const keyword = opts?.keyword ?? q;
      const ownerKeyword = opts?.ownerKeyword ?? ownerQ;
      const statusFilter = opts?.status ?? status;
      const from = opts?.createdFrom ?? createdFrom;
      const to = opts?.createdTo ?? createdTo;
      const p = opts?.page ?? page;
      const size = opts?.pageSize ?? pageSize;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: keyword,
          page: String(p),
          pageSize: String(size),
        });
        // 接口侧会按角色忽略无权用户的 owner_q
        if (ownerKeyword.trim()) params.set("owner_q", ownerKeyword.trim());
        if (statusFilter) params.set("status", statusFilter);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const res = await fetch(`/api/customers?${params}`);
        const json = await res.json();
        if (!res.ok) {
          ui.error("加载失败", json.error);
          return;
        }
        setList(json.data || []);
        if (json.meta) {
          setMeta(json.meta);
          if (json.meta.page !== p) setPage(json.meta.page);
        }
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, q, ownerQ, status, createdFrom, createdTo, ui]
  );

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json();
        if (res.ok && json.data) {
          setCanOwnerSearch(canShowOwnerSearch(json.data as SessionUser));
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    function ingest(fromNav: ReturnType<typeof takeListFilters>) {
      if (!fromNav) return;
      const oq =
        fromNav.ownerQ?.trim() || fromNav.ownerName?.trim() || "";
      setOwnerQ(oq);
      setPage(1);
      setNavToken((t) => t + 1);
    }

    const sp =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    ingest(takeListFilters(pathname));
    if (sp && sp.toString()) router.replace(pathname);
    setNavReady(true);

    return subscribeListFilters((f) => {
      if (f.path && normalizePath(f.path) !== normalizePath(pathname)) return;
      ingest(f);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!navReady) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navReady, page, pageSize, status, navToken]);

  function onSearch() {
    if (page === 1)
      void load({
        keyword: q,
        ownerKeyword: ownerQ,
        status,
        createdFrom,
        createdTo,
        page: 1,
      });
    else setPage(1);
  }

  function onStatusChange(v: string) {
    setStatus(v);
    setPage(1);
  }

  async function onExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (ownerQ.trim()) params.set("owner_q", ownerQ.trim());
      if (status) params.set("status", status);
      if (createdFrom) params.set("from", createdFrom);
      if (createdTo) params.set("to", createdTo);
      const qs = params.toString();
      await downloadExport(
        `/api/exports/customers${qs ? `?${qs}` : ""}`,
        `客户导出-${exportStamp()}.csv`
      );
      ui.success("已导出客户 CSV");
    } catch (err) {
      ui.error("导出失败", err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  }

  async function onExportFollowUps() {
    if (exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (ownerQ.trim()) params.set("owner_q", ownerQ.trim());
      if (createdFrom) params.set("from", createdFrom);
      if (createdTo) params.set("to", createdTo);
      const qs = params.toString();
      await downloadExport(
        `/api/exports/follow-ups${qs ? `?${qs}` : ""}`,
        `跟进导出-${exportStamp()}.csv`
      );
      ui.success("已导出跟进 CSV");
    } catch (err) {
      ui.error("导出失败", err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  }

  function openCreate() {
    setForm(emptyForm);
    setOpen(true);
  }

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_name.trim()) {
      ui.error("请填写客户公司");
      return;
    }
    if (!form.name.trim()) {
      ui.error("请填写客户名");
      return;
    }
    const ok = await ui.confirm({
      title: "确认新建客户？",
      description: `将创建「${form.company_name} / ${form.name}」${
        form.phone ? `（${form.phone}）` : ""
      }${form.industry ? ` · ${form.industry}` : ""}。`,
      confirmText: "确认创建",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("创建失败", json.error);
        return;
      }
      ui.success("客户已创建", customerLabel(form));
      setOpen(false);
      setForm(emptyForm);
      if (page === 1) await load({ page: 1 });
      else setPage(1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">客户</h1>
          <p className="text-sm text-[var(--color-muted)]">按权限范围查看与管理客户</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-lg border border-[var(--color-border)] bg-white p-0.5"
            role="group"
            aria-label="展示方式"
          >
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                viewMode === "table"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
              aria-pressed={viewMode === "table"}
              onClick={() => changeViewMode("table")}
            >
              表格
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                viewMode === "card"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
              aria-pressed={viewMode === "card"}
              onClick={() => changeViewMode("card")}
            >
              卡片
            </button>
          </div>
          <Button variant="secondary" onClick={() => void onExport()} disabled={exporting}>
            {exporting ? "导出中…" : "导出客户"}
          </Button>
          <Button variant="secondary" onClick={() => void onExportFollowUps()} disabled={exporting}>
            导出跟进
          </Button>
          <Button onClick={openCreate}>新建客户</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-36 max-w-full shrink-0">
          <Select
            value={status}
            onChange={onStatusChange}
            placeholder="全部状态"
            options={[
              { value: "", label: "全部状态" },
              ...CUSTOMER_STATUS_OPTIONS,
            ]}
          />
        </div>
        <div className="w-64 max-w-full shrink-0">
          <input
            className="input"
            placeholder="搜索公司 / 客户名 / 手机号"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
          />
        </div>
        {canOwnerSearch ? (
          <div className="relative w-44 max-w-full shrink-0">
            <input
              className={`input ${ownerQ ? "pr-9" : ""}`}
              placeholder="搜索负责人"
              value={ownerQ}
              onChange={(e) => setOwnerQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
            {ownerQ ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]"
                aria-label="清除负责人搜索"
                title="清除"
                onClick={() => {
                  setOwnerQ("");
                  if (page === 1) void load({ ownerKeyword: "", page: 1 });
                  else setPage(1);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M6 6l12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="w-40 shrink-0">
          <DatePicker
            value={createdFrom}
            onChange={setCreatedFrom}
            placeholder="起始日"
            allowClear
          />
        </div>
        <div className="w-40 shrink-0">
          <DatePicker
            value={createdTo}
            onChange={setCreatedTo}
            placeholder="结束日"
            allowClear
          />
        </div>
        <Button variant="secondary" onClick={onSearch}>
          搜索
        </Button>
      </div>

      <Modal
        open={open}
        title="新建客户"
        description="请分别填写客户公司与客户名"
        onClose={() => setOpen(false)}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" form="customer-create-form" disabled={submitting}>
              {submitting ? "创建中…" : "创建客户"}
            </Button>
          </>
        }
      >
        <form
          id="customer-create-form"
          onSubmit={createCustomer}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <div className="field">
            <label>客户公司</label>
            <input
              className="input"
              value={form.company_name}
              onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
              placeholder="例如：星河智能科技"
              required
            />
          </div>
          <div className="field">
            <label>客户名</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="例如：张经理"
              required
            />
          </div>
          <div className="field">
            <label>手机号</label>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="选填"
              inputMode="tel"
            />
          </div>
          <div className="field">
            <label>行业</label>
            <input
              className="input"
              value={form.industry}
              onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>来源</label>
            <Select
              value={form.source}
              onChange={(v) => setForm((f) => ({ ...f, source: v }))}
              placeholder="选择来源"
              options={[
                { value: "", label: "未选择" },
                { value: "线上咨询", label: "线上咨询" },
                { value: "转介绍", label: "转介绍" },
                { value: "展会", label: "展会" },
                { value: "电话拓客", label: "电话拓客" },
              ]}
            />
          </div>
          <div className="field">
            <label>状态</label>
            <Select
              value={form.status}
              onChange={(v) => setForm((f) => ({ ...f, status: v as CustomerStatus }))}
              options={CUSTOMER_STATUS_OPTIONS}
            />
          </div>
        </form>
      </Modal>

      {viewMode === "table" ? (
        loading ? (
          <TableSkeleton rows={pageSize > 10 ? 8 : pageSize} cols={12} />
        ) : (
          <div className="surface overflow-x-auto">
            <table className="w-full min-w-[74rem] text-sm">
              <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
                <tr>
                  <th className="w-14 px-4 py-3 font-medium">#</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">状态</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">客户公司</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">客户名</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">手机号</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">行业</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">来源</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">负责人</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">关联商机</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">上次跟进</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">多久未跟进</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">录入时间</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-6 text-[var(--color-muted)]">
                      暂无客户
                    </td>
                  </tr>
                )}
                {list.map((c, i) => {
                  const href = `/customers/${c.id}`;
                  const goDetail = (e: React.MouseEvent) => {
                    const start = pointerDown.current;
                    const dragged =
                      !!start &&
                      (Math.abs(e.clientX - start.x) > 4 ||
                        Math.abs(e.clientY - start.y) > 4);
                    const selected = !!window.getSelection()?.toString().trim();
                    if (dragged || selected) return;
                    router.push(href);
                  };
                  const oppCount = Number(c.opportunity_count || 0);
                  const idleDays = formatIdleSince(c.last_follow_at);
                  const idleWarn = idleDays !== "—" && Number(idleDays) >= 3;
                  return (
                    <tr
                      key={c.id}
                      role="link"
                      tabIndex={0}
                      className="table-row-link border-t border-[var(--color-border)]"
                      onMouseDown={(e) => {
                        pointerDown.current = { x: e.clientX, y: e.clientY };
                      }}
                      onClick={goDetail}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(href);
                        }
                      }}
                    >
                      <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">
                        {pageRowNo(meta, i)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusTag kind="customer" value={c.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        {c.company_name || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{c.name || "—"}</td>
                      <td className="px-4 py-3 select-text">{c.phone || "—"}</td>
                      <td className="px-4 py-3">{c.industry || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3">{c.source || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {c.owner_name || "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{oppCount}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--color-muted)]">
                        {formatDateTime(c.last_follow_at)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 tabular-nums ${
                          idleWarn ? "text-amber-700" : "text-[var(--color-muted)]"
                        }`}
                      >
                        {idleDays}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--color-muted)]">
                        {formatDateTime(c.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {loading && (
            <CardListSkeleton count={4} className="col-span-full sm:grid-cols-2" />
          )}
          {!loading && list.length === 0 && (
            <div className="text-sm text-[var(--color-muted)]">暂无客户</div>
          )}
          {!loading &&
            list.map((c) => {
              const idleDays = formatIdleSince(c.last_follow_at);
              const idleWarn = idleDays !== "—" && Number(idleDays) >= 3;
              return (
                <AppLink
                  key={c.id}
                  href={`/customers/${c.id}`}
                  className="surface card-interactive flex h-full w-full flex-col p-4"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="card-corner-status mt-0.5">
                      <StatusTag kind="customer" value={c.status} />
                    </div>
                    <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="break-words font-semibold text-[var(--color-accent)]">
                        {c.company_name || c.name || "未填公司"}
                      </span>
                      {c.company_name ? (
                        <span className="text-sm text-[var(--color-text)]">
                          {c.name || "未填客户名"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-muted)]">
                    {[c.phone, c.owner_name].filter(Boolean).join(" · ") ||
                      "未填手机 / 负责人"}
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-muted)]">
                    上次跟进：{formatDateTime(c.last_follow_at)}
                    {idleWarn ? (
                      <span className="ml-1 text-amber-700">· 已 {idleDays} 天未跟进</span>
                    ) : null}
                  </div>
                </AppLink>
              );
            })}
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
    </div>
  );
}
