"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { DatePicker } from "@/components/ui/DatePicker";
import { Modal } from "@/components/ui/Modal";
import { StatusTag } from "@/components/ui/StatusTag";
import { useUi } from "@/components/ui/Feedback";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { formatDateTime, formatViewDurationMs } from "@/lib/utils";
import { EMPTY_PAGE_META, pageRowNo, type PageMeta } from "@/lib/pagination";
import { pageCacheFetchJson, pageCachePeek } from "@/lib/page-cache";
import { useSessionUser } from "@/components/shared/SessionUserContext";
import { useViewMode } from "@/components/ui/ViewModeToggle";
type QuoteItem = {
  id?: number;
  name: string;
  spec?: string | null;
  qty: number | string;
  unit_price: number | string;
  discount_pct: number | string;
  amount?: number;
};

type QuoteShare = {
  id: number;
  token: string;
  status: string;
  path: string;
  url: string;
  expires_at: string;
  max_views: number;
  view_count: number;
  last_viewed_at: string | null;
  view_times?: string[];
  views?: { id: number; viewed_at: string; duration_ms: number | null }[];
  confirmed_at: string | null;
  confirmer_name: string | null;
  confirmer_note: string | null;
  expired: boolean;
  views_exhausted: boolean;
  usable: boolean;
};

type Quote = {
  id: number;
  public_id: string;
  version: number;
  status: string;
  title: string | null;
  total: number;
  list_total: number;
  max_discount_pct: number;
  valid_until: string | null;
  note: string | null;
  reject_reason: string | null;
  opportunity_id: number;
  opportunity_title?: string;
  customer_name?: string;
  owner_name?: string;
  approver_name?: string;
  submitter_name?: string;
  submitted_at?: string | null;
  decided_at?: string | null;
  updated_at?: string;
  items?: QuoteItem[];
  share?: QuoteShare | null;
};

type OppOpt = { id: number; title: string; customer_name?: string };

const emptyItem = (): QuoteItem => ({
  name: "",
  spec: "",
  qty: 1,
  unit_price: 0,
  discount_pct: 0,
});

function lineAmount(it: QuoteItem) {
  const qty = Number(it.qty) || 0;
  const price = Number(it.unit_price) || 0;
  const disc = Math.min(100, Math.max(0, Number(it.discount_pct) || 0));
  return Math.round(qty * price * (1 - disc / 100) * 100) / 100;
}

function lineListAmount(it: QuoteItem) {
  const qty = Number(it.qty) || 0;
  const price = Number(it.unit_price) || 0;
  return Math.round(qty * price * 100) / 100;
}

function money(n: number | string | null | undefined) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `¥${v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const QUOTE_STATUS_FILTERS = [
  { value: "", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "pending_approval", label: "待审批" },
  { value: "approved", label: "已通过" },
  { value: "confirmed", label: "客户已确认" },
  { value: "rejected", label: "已驳回" },
  { value: "void", label: "已作废" },
];

const QUOTES_SEED_URL = "/api/quotes?page=1&pageSize=10";

export default function QuotesClient() {
  const me = useSessionUser();
  const ui = useUi();
  const searchParams = useSearchParams();
  const seed = pageCachePeek<{ data?: Quote[]; meta?: PageMeta }>(QUOTES_SEED_URL);
  const [tab, setTab] = useState<"mine" | "pending">("mine");
  const [list, setList] = useState<Quote[]>(() => seed?.data || []);
  const [pending, setPending] = useState<Quote[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PageMeta>(seed?.meta || EMPTY_PAGE_META);
  const [loading, setLoading] = useState(() => seed == null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [opps, setOpps] = useState<OppOpt[]>([]);
  const [oppId, setOppId] = useState("");
  const [title, setTitle] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [viewMode, changeViewMode] = useViewMode("crm:quotes-view");
  const [shareBusy, setShareBusy] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [customerInput, setCustomerInput] = useState("");
  const [filterCustomerQ, setFilterCustomerQ] = useState("");
  const [filterOppId, setFilterOppId] = useState("");
  const [oppLocked, setOppLocked] = useState(false);

  const canApprove =
    me?.role === "company_admin" ||
    me?.role === "sales_manager" ||
    Boolean(me?.act_as_company_id);

  const listTabLabel =
    me?.role === "company_admin" || me?.act_as_company_id
      ? "全部报价"
      : me?.role === "sales_manager"
        ? "团队报价"
        : "我的报价";

  const totalPreview = useMemo(
    () => items.reduce((s, it) => s + lineAmount(it), 0),
    [items]
  );
  const listTotalPreview = useMemo(
    () => items.reduce((s, it) => s + lineListAmount(it), 0),
    [items]
  );

  const load = useCallback(async (opts?: {
    force?: boolean;
    customerQ?: string;
    status?: string;
    oppId?: string;
    page?: number;
  }) => {
    const force = opts?.force === true;
    const p = opts?.page ?? page;
    const status = opts?.status ?? filterStatus;
    const customerQ = opts?.customerQ ?? filterCustomerQ;
    const oppId = opts?.oppId ?? filterOppId;
    const params = new URLSearchParams({
      page: String(p),
      pageSize: String(pageSize),
    });
    if (tab === "pending") {
      params.set("scope", "pending");
    } else {
      if (status) params.set("status", status);
      if (customerQ.trim()) params.set("customer_q", customerQ.trim());
      if (oppId) params.set("opportunity_id", oppId);
    }
    const url = `/api/quotes?${params}`;
    const cached = pageCachePeek<{ data?: Quote[]; meta?: PageMeta }>(url);
    if (!force && cached?.data) {
      if (tab === "pending") {
        setPending(cached.data);
        if (cached.meta) setPendingTotal(cached.meta.total ?? cached.data.length);
      } else {
        setList(cached.data);
      }
      if (cached.meta) setMeta(cached.meta);
      setLoading(false);
      return;
    }
    if (cached?.data) {
      if (tab === "pending") {
        setPending(cached.data);
        if (cached.meta) setPendingTotal(cached.meta.total ?? cached.data.length);
      } else {
        setList(cached.data);
      }
      if (cached.meta) setMeta(cached.meta);
    }
    const currentRows = tab === "pending" ? pending : list;
    const soft = currentRows.length > 0 || Boolean(cached?.data);
    if (!soft) setLoading(true);
    try {
      const { res, json } = await pageCacheFetchJson<{
        data?: Quote[];
        meta?: PageMeta;
        error?: string;
      }>(url, { force });
      if (!res.ok) {
        ui.error("加载失败", json.error);
        return;
      }
      const rows = json.data || [];
      if (tab === "pending") {
        setPending(rows);
        setPendingTotal(json.meta?.total ?? rows.length);
      } else {
        setList(rows);
      }
      if (json.meta) {
        setMeta(json.meta);
        if (json.meta.page !== page) setPage(json.meta.page);
      } else {
        setMeta({
          ...EMPTY_PAGE_META,
          total: rows.length,
          pageSize,
        });
      }

      if (canApprove && tab === "mine") {
        const countRes = await fetch("/api/quotes?scope=pending&page=1&pageSize=1");
        const countJson = await countRes.json();
        if (countRes.ok) {
          setPendingTotal(countJson.meta?.total ?? (countJson.data || []).length);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [
    canApprove,
    filterCustomerQ,
    filterOppId,
    filterStatus,
    list,
    page,
    pageSize,
    pending,
    tab,
    ui,
  ]);

  useEffect(() => {
    void load();
  }, [me, load]);

  function changeTab(next: "mine" | "pending") {
    setTab(next);
    setPage(1);
  }

  function clearFilters() {
    setFilterStatus("");
    setCustomerInput("");
    setFilterCustomerQ("");
    setFilterOppId("");
    if (page === 1) void load({ force: true, status: "", customerQ: "", oppId: "", page: 1 });
    else setPage(1);
  }

  const hasMineFilters = Boolean(
    filterStatus || filterCustomerQ.trim() || filterOppId || customerInput.trim()
  );

  async function loadOpps(q?: string) {
    const params = new URLSearchParams();
    // 不传 page/pageSize：接口走非分页分支，最多返回 200 条（pageSize=200 会被分页白名单打回成 10）
    if (q?.trim()) params.set("q", q.trim());
    const qs = params.toString();
    const res = await fetch(qs ? `/api/opportunities?${qs}` : "/api/opportunities");
    const json = await res.json();
    if (!res.ok) {
      ui.error("加载商机失败", json.error);
      return;
    }
    setOpps(
      (json.data || []).map((o: { id: number; title: string; customer_name?: string }) => ({
        id: o.id,
        title: o.title,
        customer_name: o.customer_name,
      }))
    );
  }

  async function ensureOppOption(id: string) {
    if (!id) return null;
    const res = await fetch(`/api/opportunities/${id}`);
    const json = await res.json();
    if (!res.ok || !json.data) return null;
    const o = json.data as { id: number; title: string; customer_name?: string };
    const opt = {
      id: o.id,
      title: o.title,
      customer_name: o.customer_name,
    };
    setOpps((prev) => {
      if (prev.some((x) => x.id === o.id)) return prev;
      return [opt, ...prev];
    });
    return opt;
  }

  const searchOppsTimer = useRef<number | null>(null);
  function onOppQueryChange(query: string) {
    if (oppLocked) return;
    if (searchOppsTimer.current) window.clearTimeout(searchOppsTimer.current);
    searchOppsTimer.current = window.setTimeout(() => {
      void loadOpps(query);
    }, 250);
  }

  useEffect(() => {
    void loadOpps();
  }, []);

  async function openById(id: number) {
    const key = [...list, ...pending].find((item) => item.id === id)?.public_id || id;
    const res = await fetch(`/api/quotes/${key}`);
    const json = await res.json();
    if (!res.ok) {
      ui.error("打开报价失败", json.error);
      return;
    }
    const q = json.data as Quote;
    setEditing(q);
    setOppId(String(q.opportunity_id));
    setTitle(q.title || "");
    setValidUntil(q.valid_until ? String(q.valid_until).slice(0, 10) : "");
    setNote(q.note || "");
    setItems(
      (q.items || []).map((it) => ({
        name: it.name,
        spec: it.spec || "",
        qty: Number(it.qty),
        unit_price: Number(it.unit_price),
        discount_pct: Number(it.discount_pct),
      }))
    );
    setOpen(true);
  }

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      void openById(Number(id));
      return;
    }
    const oid = searchParams.get("opportunity_id");
    if (!oid) return;

    const openNew = searchParams.get("new") === "1";
    void (async () => {
      // 先拉商机名称，避免筛选框短暂显示数字 id
      const opt = await ensureOppOption(oid);
      if (openNew) {
        // 新建报价：只锁定弹窗商机，不改列表「全部商机」筛选
        setEditing(null);
        setOppId(oid);
        setOppLocked(true);
        setTitle("");
        setValidUntil("");
        setNote("");
        setItems([emptyItem()]);
        setOpen(true);
        return;
      }
      // 无名称则不写入筛选，避免下拉显示裸 id
      if (!opt) {
        ui.error("加载商机失败", "无法按商机筛选报价");
        return;
      }
      setFilterOppId(oid);
      setPage(1);
      void load({ force: true, oppId: oid, page: 1 });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openCreate() {
    setEditing(null);
    setOppId(filterOppId || "");
    setOppLocked(Boolean(filterOppId));
    setTitle("");
    setValidUntil("");
    setNote("");
    setItems([emptyItem()]);
    if (filterOppId) void ensureOppOption(filterOppId);
    else void loadOpps();
    setOpen(true);
  }

  const editable =
    !editing || editing.status === "draft" || editing.status === "rejected";

  async function saveQuote(andSubmit = false) {
    if (!editable && editing) {
      ui.error("当前状态不可编辑");
      return;
    }
    if (!editing && !oppId) {
      ui.error("请选择商机");
      return;
    }
    const payloadItems = items
      .map((it) => ({
        name: String(it.name || "").trim(),
        spec: String(it.spec || "").trim(),
        qty: Number(it.qty),
        unit_price: Number(it.unit_price),
        discount_pct: Number(it.discount_pct) || 0,
      }))
      .filter((it) => it.name);
    if (!payloadItems.length) {
      ui.error("请至少填写一行明细");
      return;
    }

    setSaving(true);
    try {
      let quoteId = editing?.id;
      if (!editing) {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            opportunity_id: Number(oppId),
            title,
            valid_until: validUntil || null,
            note,
            items: payloadItems,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("创建失败", json.error);
          return;
        }
        quoteId = json.data.id;
        ui.success("报价已创建");
      } else {
        const res = await fetch(`/api/quotes/${editing.public_id || editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            valid_until: validUntil || null,
            note,
            items: payloadItems,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("保存失败", json.error);
          return;
        }
        ui.success("已保存");
        quoteId = json.data.id;
      }

      if (andSubmit && quoteId) {
      const key = editing?.public_id || quoteId;
      const res = await fetch(`/api/quotes/${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "submit" }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("提交失败", json.error);
          await load({ force: true });
          if (quoteId) await openById(quoteId);
          return;
        }
        if (json.data.auto_approved) {
          ui.success("未超审批阈值，已自动通过");
        } else {
          ui.success("已提交审批");
        }
      }

      setOpen(false);
      setOppLocked(false);
      await load({ force: true });
    } finally {
      setSaving(false);
    }
  }

  async function createShare(quoteId: number) {
    setShareBusy(true);
    try {
      const key = editing?.public_id || quoteId;
      const res = await fetch(`/api/quotes/${key}/share`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("生成链接失败", json.error);
        return;
      }
      const share = json.data as QuoteShare;
      setEditing((prev) => (prev && prev.id === quoteId ? { ...prev, share } : prev));
      ui.success("客户确认链接已生成");
      try {
        await navigator.clipboard.writeText(share.url);
        ui.toast({ kind: "info", title: "链接已复制", description: share.url });
      } catch {
        /* ignore */
      }
    } finally {
      setShareBusy(false);
    }
  }

  async function revokeShare(quoteId: number) {
    const ok = await ui.confirm({
      title: "撤销客户链接？",
      description: "撤销后原链接将无法打开，可重新生成。",
      confirmText: "撤销",
    });
    if (!ok) return;
    setShareBusy(true);
    try {
      const key = editing?.public_id || quoteId;
      const res = await fetch(`/api/quotes/${key}/share`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("撤销失败", json.error);
        return;
      }
      setEditing((prev) =>
        prev && prev.id === quoteId ? { ...prev, share: json.data } : prev
      );
      ui.success("链接已撤销");
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShareUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      ui.success("已复制链接");
    } catch {
      ui.error("复制失败", "请手动选择链接复制");
    }
  }

  async function runAction(id: number, action: string, extra?: Record<string, unknown>) {
    const key = [...list, ...pending].find((item) => item.id === id)?.public_id || id;
    const res = await fetch(`/api/quotes/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = await res.json();
    if (!res.ok) {
      ui.error("操作失败", json.error);
      return;
    }
    ui.success(
      action === "approve"
        ? "已通过"
        : action === "reject"
          ? "已驳回"
          : action === "revise"
            ? "已生成新版本草稿"
            : action === "withdraw"
              ? "已撤回"
              : "完成"
    );
    if (action === "revise" && json.data?.id) {
      await load({ force: true });
      await openById(json.data.id);
      return;
    }
    setOpen(false);
    setRejectOpen(false);
    await load({ force: true });
  }

  const rows = tab === "pending" ? pending : list;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">报价</h1>
          <p className="text-sm text-[var(--color-muted)]">
            多版本报价与审批；未超公司阈值可自动通过
          </p>
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
          <Button onClick={openCreate}>新建报价</Button>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-white p-0.5">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "mine" ? "bg-slate-900 text-white" : "text-[var(--color-muted)]"
          }`}
          onClick={() => changeTab("mine")}
        >
          {listTabLabel}
        </button>
        {canApprove ? (
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === "pending" ? "bg-slate-900 text-white" : "text-[var(--color-muted)]"
            }`}
            onClick={() => changeTab("pending")}
          >
            待我审批{pendingTotal ? ` (${pendingTotal})` : ""}
          </button>
        ) : null}
      </div>

      {tab === "mine" ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-36 min-w-[8rem]">
            <Select
              value={filterStatus}
              onChange={(v) => {
                setFilterStatus(v);
                setPage(1);
              }}
              options={QUOTE_STATUS_FILTERS}
              placeholder="状态"
            />
          </div>
          <div className="min-w-[12rem] flex-1 sm:max-w-sm">
            <Select
              value={filterOppId}
              onChange={(v) => {
                setFilterOppId(v);
                setPage(1);
              }}
              searchable
              onQueryChange={onOppQueryChange}
              placeholder="全部商机"
              options={[
                { value: "", label: "全部商机" },
                ...opps.map((o) => ({
                  value: String(o.id),
                  label: `${o.title}${o.customer_name ? ` · ${o.customer_name}` : ""}`,
                })),
              ]}
            />
          </div>
          <div className="relative w-full min-w-0 md:max-w-xs md:flex-1">
            <input
              className={`input w-full ${customerInput ? "pr-9" : ""}`}
              placeholder="搜索客户"
              value={customerInput}
              onChange={(e) => setCustomerInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const q = customerInput.trim();
                  setFilterCustomerQ(q);
                  if (page === 1) void load({ force: true, customerQ: q, page: 1 });
                  else setPage(1);
                }
              }}
            />
            {customerInput ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
                onClick={() => {
                  setCustomerInput("");
                  setFilterCustomerQ("");
                  if (page === 1) void load({ force: true, customerQ: "", page: 1 });
                  else setPage(1);
                }}
              >
                清除
              </button>
            ) : null}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="min-h-9"
            onClick={() => {
              const q = customerInput.trim();
              setFilterCustomerQ(q);
              if (page === 1) void load({ force: true, customerQ: q, page: 1 });
              else setPage(1);
            }}
          >
            查询
          </Button>
          {hasMineFilters ? (
            <Button type="button" variant="ghost" className="min-h-9" onClick={clearFilters}>
              重置
            </Button>
          ) : null}
        </div>
      ) : null}

      {viewMode === "table" ? (
        <div className="surface overflow-x-auto">
          {loading && rows.length === 0 ? (
            <div className="p-6 text-sm text-[var(--color-muted)]">加载中…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-[var(--color-muted)]">暂无报价</div>
          ) : (
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">序号</th>
                  <th className="px-4 py-3 font-medium">报价</th>
                  <th className="px-4 py-3 font-medium">客户 / 商机</th>
                  {tab === "pending" ? (
                    <th className="px-4 py-3 font-medium">提交人</th>
                  ) : (
                    <th className="px-4 py-3 font-medium">负责人</th>
                  )}
                  <th className="px-4 py-3 font-medium">金额</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  {tab !== "pending" ? (
                    <th className="px-4 py-3 font-medium">审批</th>
                  ) : null}
                  <th className="px-4 py-3 font-medium">
                    {tab === "pending" ? "提交时间" : "更新"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((q, i) => (
                  <tr
                    key={q.id}
                    className="cursor-pointer hover:bg-slate-50/80"
                    onClick={() => void openById(q.id)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[var(--color-muted)]">
                      {pageRowNo(meta, i)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{q.title || "未命名"}</div>
                      <div className="text-xs text-[var(--color-muted)]">V{q.version}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{q.customer_name || "—"}</div>
                      <span className="text-xs text-[var(--color-muted)]">
                        {q.opportunity_title || "关联商机"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {tab === "pending"
                        ? q.submitter_name || q.owner_name || "—"
                        : q.owner_name || "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{money(q.total)}</td>
                    <td className="px-4 py-3">
                      <StatusTag kind="quote" value={q.status} />
                      {q.reject_reason ? (
                        <div className="mt-1 max-w-[12rem] truncate text-xs text-rose-600">
                          {q.reject_reason}
                        </div>
                      ) : null}
                    </td>
                    {tab !== "pending" ? (
                      <td className="px-4 py-3 text-sm">
                        {q.status === "approved" ||
                        q.status === "confirmed" ||
                        q.status === "rejected" ? (
                          <div>
                            <div>{q.approver_name || "—"}</div>
                            <div className="text-xs text-[var(--color-muted)]">
                              {formatDateTime(q.decided_at || undefined)}
                            </div>
                          </div>
                        ) : q.status === "pending_approval" ? (
                          <span className="text-xs text-[var(--color-muted)]">待审</span>
                        ) : (
                          <span className="text-[var(--color-muted)]">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {formatDateTime(
                        (tab === "pending"
                          ? q.submitted_at
                          : q.updated_at || q.decided_at || q.submitted_at) || undefined
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {loading && rows.length === 0 ? (
            <div className="col-span-full p-6 text-sm text-[var(--color-muted)]">加载中…</div>
          ) : rows.length === 0 ? (
            <div className="col-span-full p-6 text-sm text-[var(--color-muted)]">暂无报价</div>
          ) : (
            rows.map((q) => (
              <div
                key={q.id}
                role="button"
                tabIndex={0}
                className="surface card-interactive card-stretch relative flex w-full cursor-pointer flex-col p-4"
                onClick={() => void openById(q.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void openById(q.id);
                  }
                }}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="card-corner-status mt-0.5">
                      <StatusTag kind="quote" value={q.status} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{q.title || "未命名"}</div>
                      <div className="text-xs text-[var(--color-muted)]">V{q.version}</div>
                    </div>
                    <div className="ml-auto shrink-0 tabular-nums font-semibold">
                      {money(q.total)}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-[var(--color-muted)]">
                    {q.customer_name || "—"}
                    {q.opportunity_title ? ` · ${q.opportunity_title}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-muted)]">
                    {tab === "pending" ? (
                      <>
                        提交人 {q.submitter_name || q.owner_name || "—"}
                        {q.submitted_at ? ` · ${formatDateTime(q.submitted_at)}` : ""}
                      </>
                    ) : (
                      <>
                        负责人 {q.owner_name || "—"}
                        {q.status === "approved" ||
                        q.status === "confirmed" ||
                        q.status === "rejected" ? (
                          <>
                            {" "}
                            ·{" "}
                            {q.status === "rejected"
                              ? "驳回"
                              : q.status === "confirmed"
                                ? "已确认"
                                : "审批"}{" "}
                            {q.approver_name || "—"}
                            {q.decided_at ? `（${formatDateTime(q.decided_at)}）` : ""}
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                  {q.reject_reason ? (
                    <div className="mt-1 line-clamp-2 text-xs text-rose-600">{q.reject_reason}</div>
                  ) : (
                    <div className="mt-1 min-h-[1rem]" aria-hidden />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && (
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
      )}

      <Modal
        open={open}
        title={editing ? `报价 V${editing.version}` : "新建报价"}
        description={
          editing?.status === "rejected" && editing.reject_reason
            ? `驳回原因：${editing.reject_reason}`
            : "填写明细后保存；提交时若未超公司阈值将自动通过"
        }
        onClose={() => {
          setOpen(false);
          setOppLocked(false);
        }}
        size="xl"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              关闭
            </Button>
            {editing && editing.status === "pending_approval" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => void runAction(editing.id, "withdraw")}
              >
                撤回
              </Button>
            ) : null}
            {editing &&
            (editing.status === "approved" ||
              editing.status === "confirmed" ||
              editing.status === "rejected" ||
              editing.status === "void") ? (
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => void runAction(editing.id, "revise")}
              >
                修订为新版本
              </Button>
            ) : null}
            {editing && canApprove && editing.status === "pending_approval" ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setRejectId(editing.id);
                    setRejectReason("");
                    setRejectOpen(true);
                  }}
                >
                  驳回
                </Button>
                <Button type="button" onClick={() => void runAction(editing.id, "approve")}>
                  通过
                </Button>
              </>
            ) : null}
            {editable ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => void saveQuote(false)}
                >
                  {saving ? "保存中…" : "保存草稿"}
                </Button>
                <Button type="button" disabled={saving} onClick={() => void saveQuote(true)}>
                  {saving ? "提交中…" : "保存并提交"}
                </Button>
              </>
            ) : null}
          </>
        }
      >
        <div className="space-y-4">
          {!editing ? (
            <div className="field">
              <label>关联商机</label>
              {oppLocked && oppId ? (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2,#f8fafc)] px-3 py-2 text-sm">
                  {(() => {
                    const o = opps.find((x) => String(x.id) === oppId);
                    return o
                      ? `${o.title}${o.customer_name ? ` · ${o.customer_name}` : ""}`
                      : "关联商机";
                  })()}
                </div>
              ) : (
                <Select
                  value={oppId}
                  onChange={setOppId}
                  searchable
                  onQueryChange={onOppQueryChange}
                  placeholder="选择商机"
                  options={opps.map((o) => ({
                    value: String(o.id),
                    label: `${o.title}${o.customer_name ? ` · ${o.customer_name}` : ""}`,
                  }))}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <StatusTag kind="quote" value={editing.status} />
              <span className="text-[var(--color-muted)]">
                {editing.customer_name} · {editing.opportunity_title}
              </span>
              {editing.submitter_name || editing.owner_name ? (
                <span className="text-[var(--color-muted)]">
                  · 提交人 {editing.submitter_name || editing.owner_name}
                  {editing.submitted_at
                    ? `（${formatDateTime(editing.submitted_at)}）`
                    : ""}
                </span>
              ) : null}
              {(editing.status === "approved" ||
                editing.status === "confirmed" ||
                editing.status === "rejected") &&
              (editing.approver_name || editing.decided_at) ? (
                <span className="text-[var(--color-muted)]">
                  ·{" "}
                  {editing.status === "rejected"
                    ? "驳回人"
                    : editing.status === "confirmed"
                      ? "审批人"
                      : "审批人"}{" "}
                  {editing.approver_name || "—"}
                  {editing.decided_at
                    ? `（${formatDateTime(editing.decided_at)}）`
                    : ""}
                </span>
              ) : null}
            </div>
          )}

          {editing &&
          (editing.status === "approved" || editing.status === "confirmed") ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-sky-950">客户确认链接</div>
                  <p className="text-xs text-sky-900/70">
                    发给客户查看并确认；发到微信会显示为带封面的链接卡片。有效期与查看次数见公司报价规则
                  </p>
                </div>
                <div className="flex shrink-0 flex-nowrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="!px-2 !py-1 text-xs whitespace-nowrap"
                    disabled={shareBusy}
                    onClick={() => void createShare(editing.id)}
                  >
                    {editing.share?.status === "active" && !editing.share.expired
                      ? "重新生成"
                      : "生成链接"}
                  </Button>
                  {editing.share?.status === "active" &&
                  !editing.share.expired &&
                  editing.share.url ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!px-2 !py-1 text-xs whitespace-nowrap"
                        disabled={shareBusy}
                        onClick={() => void revokeShare(editing.id)}
                      >
                        撤销
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!px-2 !py-1 text-xs whitespace-nowrap"
                        onClick={() => void copyShareUrl(editing.share!.url)}
                      >
                        复制
                      </Button>
                    </>
                  ) : editing.share?.status === "active" && !editing.share.expired ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="!px-2 !py-1 text-xs whitespace-nowrap"
                      disabled={shareBusy}
                      onClick={() => void revokeShare(editing.id)}
                    >
                      撤销
                    </Button>
                  ) : null}
                </div>
              </div>
              {editing.share ? (
                <div className="space-y-1.5 text-xs text-sky-950/80">
                  {editing.share.url ? (
                    <code className="block w-full truncate rounded bg-white/80 px-2 py-1 text-[11px]">
                      {editing.share.url}
                    </code>
                  ) : editing.share.status === "active" && !editing.share.expired ? (
                    <p className="rounded bg-white/80 px-2 py-1 text-[11px] text-amber-800">
                      当前链接已生成，但无法还原完整地址（旧数据）。请点「重新生成」后再复制。
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    <span>
                      状态：
                      {editing.share.confirmed_at
                        ? "客户已确认"
                        : editing.share.status === "revoked"
                          ? "已撤销"
                          : editing.share.expired
                            ? "已过期"
                            : editing.share.views_exhausted
                              ? "次数用尽"
                              : "有效"}
                    </span>
                    <span>
                      查看 {editing.share.view_count}/{editing.share.max_views}
                    </span>
                    <span>有效至 {formatDateTime(editing.share.expires_at)}</span>
                  </div>
                  {editing.share.views && editing.share.views.length > 0 ? (
                    <div className="rounded-lg bg-white/80 px-2.5 py-2">
                      <div className="font-medium text-sky-950">查看记录</div>
                      <ul className="mt-1 max-h-36 space-y-0.5 overflow-y-auto">
                        {editing.share.views.map((v, i) => (
                          <li key={v.id} className="tabular-nums">
                            第 {editing.share!.views!.length - i} 次：
                            {formatDateTime(v.viewed_at)}
                            <span className="text-sky-900/60">
                              {" "}
                              · 停留 {formatViewDurationMs(v.duration_ms)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : editing.share.view_times && editing.share.view_times.length > 0 ? (
                    <div className="rounded-lg bg-white/80 px-2.5 py-2">
                      <div className="font-medium text-sky-950">查看记录</div>
                      <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto">
                        {editing.share.view_times.map((t, i) => (
                          <li key={`${t}-${i}`} className="tabular-nums">
                            第 {editing.share!.view_times!.length - i} 次：
                            {formatDateTime(t)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : editing.share.last_viewed_at ? (
                    <div>最近查看：{formatDateTime(editing.share.last_viewed_at)}</div>
                  ) : null}
                  {editing.share.confirmed_at ? (
                    <div>
                      确认
                      {editing.share.confirmer_name
                        ? `：${editing.share.confirmer_name}`
                        : ""}
                      （{formatDateTime(editing.share.confirmed_at)}）
                      {editing.share.confirmer_note
                        ? ` · ${editing.share.confirmer_note}`
                        : ""}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-sky-900/70">尚未生成链接</p>
              )}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field">
              <label>标题</label>
              <input
                className="input"
                value={title}
                disabled={!editable}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：星河 CRM 标准版报价"
              />
            </div>
            <div className="field">
              <label>报价有效期至</label>
              <DatePicker
                value={validUntil}
                onChange={setValidUntil}
                allowClear
                disabled={!editable}
              />
            </div>
          </div>

          <div className="field">
            <label>备注</label>
            <textarea
              className="input textarea"
              rows={2}
              value={note}
              disabled={!editable}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">明细</label>
              {editable ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="!px-2 !py-1 text-xs"
                  onClick={() => setItems((prev) => [...prev, emptyItem()])}
                >
                  加一行
                </Button>
              ) : null}
            </div>
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-[var(--color-muted)]">
                  <tr>
                    <th className="px-2 py-2">名称</th>
                    <th className="px-2 py-2">规格</th>
                    <th className="px-2 py-2 w-20">数量</th>
                    <th className="px-2 py-2 w-24">单价</th>
                    <th className="px-2 py-2 w-24">折前金额</th>
                    <th className="px-2 py-2 w-20">折扣%</th>
                    <th className="px-2 py-2 w-24">小计</th>
                    {editable ? <th className="px-2 py-2 w-14" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-1.5">
                        <input
                          className="input !py-1"
                          value={it.name}
                          disabled={!editable}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, name: e.target.value } : row
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className="input !py-1"
                          value={it.spec || ""}
                          disabled={!editable}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, spec: e.target.value } : row
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className="input !py-1"
                          type="number"
                          min={0}
                          step="0.01"
                          value={it.qty}
                          disabled={!editable}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, qty: e.target.value } : row
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className="input !py-1"
                          type="number"
                          min={0}
                          step="0.01"
                          value={it.unit_price}
                          disabled={!editable}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, unit_price: e.target.value } : row
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-[var(--color-muted)]">
                        {money(lineListAmount(it))}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className="input !py-1"
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          value={it.discount_pct}
                          disabled={!editable}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, discount_pct: e.target.value } : row
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-[var(--color-muted)]">
                        {money(lineAmount(it))}
                      </td>
                      {editable ? (
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            className="text-xs text-rose-600"
                            disabled={items.length <= 1}
                            onClick={() =>
                              setItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                          >
                            删
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-end gap-0.5 text-sm">
              <div className="text-[var(--color-muted)]">
                折前合计{" "}
                {money(
                  editable
                    ? listTotalPreview
                    : editing?.list_total != null
                      ? editing.list_total
                      : listTotalPreview
                )}
              </div>
              <div className="font-semibold">
                合计 {money(editable ? totalPreview : editing?.total)}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={rejectOpen}
        title="驳回报价"
        onClose={() => setRejectOpen(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setRejectOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!rejectId) return;
                if (!rejectReason.trim()) {
                  ui.error("请填写驳回原因");
                  return;
                }
                void runAction(rejectId, "reject", { reason: rejectReason.trim() });
              }}
            >
              确认驳回
            </Button>
          </>
        }
      >
        <div className="field">
          <label>驳回原因</label>
          <textarea
            className="input textarea"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="例如：折扣过高，请调整后重提"
          />
        </div>
      </Modal>
    </div>
  );
}
