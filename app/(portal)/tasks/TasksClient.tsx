"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { Select } from "@/components/ui/Select";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { Modal } from "@/components/ui/Modal";
import { useUi } from "@/components/ui/Feedback";
import { StatusTag } from "@/components/ui/StatusTag";
import { IconButton } from "@/components/ui/IconButton";
import { CardListSkeleton } from "@/components/ui/Skeleton";
import { EMPTY_PAGE_META, type PageMeta } from "@/lib/pagination";
import { subscribeListFilters, takeListFilters, normalizePath } from "@/lib/nav-filters";

function notifyTasksChanged() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event("crm:tasks-changed"));
  } catch {
    /* ignore */
  }
}
import { taskDueUrgency } from "@/lib/utils";
import { useAppRouter } from "@/hooks/useAppRouter";
import type { SessionUser } from "@/types";
import { pageCacheFetchJson, pageCachePeek, pageCachePut } from "@/lib/page-cache";
import { useSessionUser } from "@/components/shared/SessionUserContext";
import { CollapsibleListFilters } from "@/components/ui/CollapsibleListFilters";

export type Task = {
  id: number;
  public_id?: string;
  title: string;
  status: string;
  source: string;
  due_at: string | null;
  owner_id?: number | null;
  customer_id?: number | null;
  opportunity_id?: number | null;
  customer_name?: string | null;
  customer_public_id?: string | null;
  opportunity_title?: string | null;
  owner_name?: string | null;
};

type CustomerOpt = {
  id: number;
  name: string;
  company_name?: string | null;
};

type OppOpt = {
  id: number;
  title: string;
  customer_id: number;
};

function parseUrgencyParam(value: string | null | undefined) {
  if (value === "overdue" || value === "urgent" || value === "normal") return value;
  return "";
}

function parseStatusParam(value: string | null | undefined) {
  if (value === "pending" || value === "done") return value;
  return "";
}

function canShowOwnerSearch(user: SessionUser) {
  if (user.act_as_company_id) return true;
  return user.role === "company_admin" || user.role === "sales_manager";
}

const TASKS_SEED_URL = "/api/tasks?page=1&pageSize=10";

export default function TasksClient({
  initialData,
}: {
  initialData?: { data?: Task[]; meta?: PageMeta } | null;
}) {
  const router = useAppRouter();
  const pathname = usePathname();
  const ui = useUi();
  const sessionUser = useSessionUser();
  const seed =
    pageCachePeek<{ data?: Task[]; meta?: PageMeta }>(TASKS_SEED_URL) || initialData;
  const [list, setList] = useState<Task[]>(() => seed?.data || []);
  const [loading, setLoading] = useState(() => seed == null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PageMeta>(seed?.meta || EMPTY_PAGE_META);
  const hasRowsRef = useRef((seed?.data?.length || 0) > 0);
  hasRowsRef.current = list.length > 0;
  const [q, setQ] = useState("");
  const [ownerQ, setOwnerQ] = useState("");
  const canOwnerSearch = canShowOwnerSearch(sessionUser);
  const meId = Number(sessionUser.id);
  const [remindingId, setRemindingId] = useState<number | null>(null);
  const [remindingAll, setRemindingAll] = useState(false);
  const [status, setStatus] = useState("");
  const [urgency, setUrgency] = useState("");
  const [navReady, setNavReady] = useState(false);
  const [navToken, setNavToken] = useState(0);
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [open, setOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [customerId, setCustomerId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [taskStatus, setTaskStatus] = useState("pending");
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [opps, setOpps] = useState<OppOpt[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialData?.data) pageCachePut(TASKS_SEED_URL, initialData);
  }, [initialData]);

  const customerOptions = useMemo(
    () => [
      { value: "", label: "请选择客户" },
      ...customers.map((c) => ({
        value: String(c.id),
        label: [c.company_name, c.name].filter(Boolean).join(" · ") || "客户",
      })),
    ],
    [customers]
  );

  const oppOptions = useMemo(() => {
    const cid = Number(customerId);
    const filtered = cid
      ? opps.filter((o) => Number(o.customer_id) === cid)
      : opps;
    return [
      { value: "", label: "不关联商机" },
      ...filtered.map((o) => ({ value: String(o.id), label: o.title })),
    ];
  }, [opps, customerId]);

  const load = useCallback(
    async (opts?: {
      keyword?: string;
      ownerKeyword?: string;
      status?: string;
      urgency?: string;
      dueFrom?: string;
      dueTo?: string;
      page?: number;
      pageSize?: number;
      force?: boolean;
    }) => {
      const keyword = opts?.keyword ?? q;
      const ownerKeyword = opts?.ownerKeyword ?? ownerQ;
      const statusFilter = opts?.status ?? status;
      const urgencyFilter = opts?.urgency ?? urgency;
      const from = opts?.dueFrom ?? dueFrom;
      const to = opts?.dueTo ?? dueTo;
      const p = opts?.page ?? page;
      const size = opts?.pageSize ?? pageSize;
      const force = opts?.force === true;
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(size),
      });
      if (keyword.trim()) params.set("q", keyword.trim());
      if (ownerKeyword.trim()) params.set("owner_q", ownerKeyword.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (urgencyFilter) params.set("urgency", urgencyFilter);
      if (from) params.set("due_from", from);
      if (to) params.set("due_to", to);
      const url = `/api/tasks?${params}`;
      const cached = pageCachePeek<{ data?: Task[]; meta?: PageMeta }>(url);
      if (!force && cached?.data) {
        setList(cached.data);
        if (cached.meta) setMeta(cached.meta);
        setLoading(false);
        return;
      }
      if (cached?.data) {
        setList(cached.data);
        if (cached.meta) setMeta(cached.meta);
      }
      const soft = hasRowsRef.current || Boolean(cached?.data);
      if (!soft) setLoading(true);
      try {
        const { res, json } = await pageCacheFetchJson<{
          data?: Task[];
          meta?: PageMeta;
          error?: string;
        }>(url, { force });
        if (!res.ok) ui.error("加载失败", json.error);
        else {
          setList(json.data || []);
          if (json.meta) {
            setMeta(json.meta);
            if (json.meta.page !== p) setPage(json.meta.page);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, q, ownerQ, status, urgency, dueFrom, dueTo, ui]
  );

  const loadOptions = useCallback(async () => {
    const [cRes, oRes] = await Promise.all([
      fetch("/api/customers"),
      fetch("/api/opportunities"),
    ]);
    const [cJson, oJson] = await Promise.all([cRes.json(), oRes.json()]);
    if (cRes.ok) setCustomers(cJson.data || []);
    if (oRes.ok) setOpps(oJson.data || []);
  }, []);

  useEffect(() => {
    function ingest(fromNav: ReturnType<typeof takeListFilters>) {
      if (!fromNav) return;
      const oq =
        fromNav.ownerQ?.trim() || fromNav.ownerName?.trim() || "";
      setOwnerQ(oq);
      if (fromNav.status !== undefined) {
        setStatus(parseStatusParam(fromNav.status));
      }
      if (fromNav.urgency !== undefined) {
        setUrgency(parseUrgencyParam(fromNav.urgency));
      }
      setPage(1);
      setNavToken((t) => t + 1);
    }

    const sp =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const fromNav = takeListFilters(pathname);
    if (fromNav) {
      ingest(fromNav);
    } else if (sp) {
      const nextStatus = parseStatusParam(sp.get("status"));
      const nextUrgency = parseUrgencyParam(sp.get("urgency"));
      const oq = sp.get("owner")?.trim() || sp.get("owner_q")?.trim() || "";
      if (nextStatus) setStatus(nextStatus);
      if (nextUrgency) setUrgency(nextUrgency);
      if (oq) setOwnerQ(oq);
    }
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
  }, [navReady, page, pageSize, status, urgency, dueFrom, dueTo, navToken]);

  function onSearch() {
    if (page === 1) void load({ keyword: q, ownerKeyword: ownerQ, page: 1, force: true });
    else setPage(1);
  }

  function onStatusChange(v: string) {
    setStatus(v);
    setPage(1);
  }

  function onUrgencyChange(v: string) {
    setUrgency(v);
    setPage(1);
  }

  function splitDueAt(dueAt: string | null | undefined) {
    if (!dueAt) return { date: "", time: "18:00" };
    const d = new Date(dueAt);
    if (Number.isNaN(d.getTime())) return { date: "", time: "18:00" };
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return { date: `${y}-${m}-${day}`, time: `${hh}:${mm}` };
  }

  function openCreate() {
    setEditTask(null);
    setTitle("");
    setDate("");
    setTime("18:00");
    setCustomerId("");
    setOpportunityId("");
    setTaskStatus("pending");
    setOpen(true);
    void loadOptions();
  }

  function openEdit(t: Task) {
    const due = splitDueAt(t.due_at);
    setEditTask(t);
    setTitle(t.title);
    setDate(due.date);
    setTime(due.time);
    setCustomerId(t.customer_id ? String(t.customer_id) : "");
    setOpportunityId(t.opportunity_id ? String(t.opportunity_id) : "");
    setTaskStatus(t.status === "done" ? "done" : "pending");
    setOpen(true);
    void loadOptions();
  }

  async function saveTask(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      ui.error("请选择客户");
      return;
    }
    if (!title.trim()) {
      ui.error("请填写标题");
      return;
    }
    const due_at = date ? `${date}T${time || "18:00"}:00` : null;
    setSubmitting(true);
    try {
      if (editTask) {
        const res = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editTask.id,
            title: title.trim(),
            due_at,
            status: taskStatus,
            customer_id: Number(customerId),
            opportunity_id: opportunityId ? Number(opportunityId) : null,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("保存失败", json.error);
          return;
        }
        ui.success("待办已更新", title.trim());
        setOpen(false);
        setEditTask(null);
        notifyTasksChanged();
        await load({ force: true });
      } else {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            due_at,
            customer_id: Number(customerId),
            opportunity_id: opportunityId ? Number(opportunityId) : null,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("创建失败", json.error);
          return;
        }
        ui.success("待办已创建", title.trim());
        setOpen(false);
        notifyTasksChanged();
        await load({ force: true });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteTask(t: Task) {
    const ok = await ui.confirm({
      title: "确认删除待办？",
      description: `将永久删除「${t.title}」。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/tasks?id=${t.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) ui.error("删除失败", json.error);
    else {
      ui.success("待办已删除");
      notifyTasksChanged();
      await load({ force: true });
    }
  }

  async function remindTask(t: Task) {
    if (remindingId != null || remindingAll) return;
    const ok = await ui.confirm({
      title: "确认催办？",
      description: `将通知${t.owner_name ? `「${t.owner_name}」` : "负责人"}尽快处理「${t.title}」。`,
      confirmText: "催办",
    });
    if (!ok) return;
    setRemindingId(t.id);
    try {
      const res = await fetch(`/api/tasks/${t.public_id || t.id}/remind`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) ui.error("催办失败", json.error || "请稍后重试");
      else ui.success("催办成功", "已通知负责人");
    } catch {
      ui.error("催办失败", "网络异常，请稍后重试");
    } finally {
      setRemindingId(null);
    }
  }

  async function remindAllUrgent() {
    if (remindingAll || remindingId != null) return;
    try {
      const previewRes = await fetch("/api/tasks/remind");
      const previewJson = await previewRes.json().catch(() => ({}));
      if (!previewRes.ok) {
        ui.error("一键催办失败", previewJson.error || "无法获取催办数量");
        return;
      }
      const overdueTotal = Number(previewJson.data?.overdue_total || 0);
      const previewTasks = Number(previewJson.data?.task_count || 0);
      const previewOwners = Number(previewJson.data?.owner_count || 0);
      const selfCount = Number(previewJson.data?.self_count || 0);
      if (previewTasks <= 0) {
        ui.success(
          "无需催办",
          selfCount > 0
            ? `共 ${overdueTotal || selfCount} 条逾期待办，均为你自己的，无法催办`
            : "暂无逾期待办"
        );
        return;
      }

      const selfHint =
        selfCount > 0
          ? `（逾期共 ${overdueTotal || previewTasks + selfCount} 条，已排除你自己的 ${selfCount} 条）`
          : "";
      const ok = await ui.confirm({
        title: "确认一键催办？",
        description: `将催办 ${previewTasks} 条已逾期待办（涉及 ${previewOwners} 人）${selfHint}。同一人 30 分钟内只催一次。`,
        confirmText: "一键催办",
      });
      if (!ok) return;

      setRemindingAll(true);
      const res = await fetch("/api/tasks/remind", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("一键催办失败", json.error || "请稍后重试");
        return;
      }
      const owners = Number(json.data?.owner_count || 0);
      const tasks = Number(json.data?.task_count || 0);
      const skipped = Number(json.data?.skipped || 0);
      if (owners === 0 && tasks === 0) {
        ui.success(
          "无需催办",
          skipped
            ? "相关负责人近期已催办过"
            : json.data?.message || "暂无逾期待办"
        );
        return;
      }
      ui.success(
        "一键催办成功",
        `已通知 ${owners} 人、共 ${tasks} 条待办${
          skipped ? `（另有 ${skipped} 人近期已催，已跳过）` : ""
        }`
      );
    } catch {
      ui.error("一键催办失败", "网络异常，请稍后重试");
    } finally {
      setRemindingAll(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">待办</h1>
          <p className="text-sm text-[var(--color-muted)]">
            紧急程度按截止日期自动区分（已逾期 / 今天截止为紧急 / 其余为普通）；已完成不显示。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canOwnerSearch ? (
            <Button
              variant="secondary"
              disabled={remindingAll || remindingId != null}
              onClick={() => void remindAllUrgent()}
            >
              {remindingAll ? "催办中…" : "一键催办"}
            </Button>
          ) : null}
          <Button onClick={openCreate}>新建待办</Button>
        </div>
      </div>

      <CollapsibleListFilters
        activeCount={
          (status ? 1 : 0) +
          (urgency ? 1 : 0) +
          (canOwnerSearch && ownerQ.trim() ? 1 : 0) +
          (dueFrom ? 1 : 0) +
          (dueTo ? 1 : 0)
        }
        primary={
          <div className="relative w-full min-w-0 md:w-72 md:max-w-full md:shrink-0">
            <input
              className={`input w-full ${q ? "pr-9" : ""}`}
              placeholder="客户名 / 客户负责人 / 商机"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
            {q ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]"
                aria-label="清除搜索"
                title="清除"
                onClick={() => {
                  setQ("");
                  if (page === 1) void load({ keyword: "", page: 1, force: true });
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
        }
        secondary={
          <>
            <div className="w-36 shrink-0">
              <Select
                value={status}
                onChange={onStatusChange}
                options={[
                  { value: "", label: "全部状态" },
                  { value: "pending", label: "待办" },
                  { value: "done", label: "已完成" },
                ]}
              />
            </div>
            <div className="w-36 shrink-0">
              <Select
                value={urgency}
                onChange={onUrgencyChange}
                options={[
                  { value: "", label: "全部紧急" },
                  { value: "overdue", label: "已逾期" },
                  { value: "urgent", label: "紧急" },
                  { value: "normal", label: "普通" },
                ]}
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
                      if (page === 1) void load({ ownerKeyword: "", page: 1, force: true });
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
                value={dueFrom}
                onChange={(v) => {
                  setDueFrom(v);
                  setPage(1);
                }}
                placeholder="截止起"
              />
            </div>
            <div className="w-40 shrink-0">
              <DatePicker
                value={dueTo}
                onChange={(v) => {
                  setDueTo(v);
                  setPage(1);
                }}
                placeholder="截止止"
              />
            </div>
            <Button variant="secondary" onClick={onSearch}>
              搜索
            </Button>
          </>
        }
      />

      <Modal
        open={open}
        title={editTask ? "编辑待办" : "新建待办"}
        description="请选择客户；有具体商机时建议一并关联"
        onClose={() => {
          setOpen(false);
          setEditTask(null);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setEditTask(null);
              }}
            >
              取消
            </Button>
            <Button type="submit" form="task-create-form" disabled={submitting}>
              {submitting
                ? editTask
                  ? "保存中…"
                  : "创建中…"
                : editTask
                  ? "保存"
                  : "创建待办"}
            </Button>
          </>
        }
      >
        <form id="task-create-form" onSubmit={saveTask} className="space-y-3">
          <div className="field">
            <label>客户</label>
            <Select
              value={customerId}
              onChange={(v) => {
                setCustomerId(v);
                setOpportunityId("");
              }}
              options={customerOptions}
              searchable
              placement="auto"
            />
          </div>
          <div className="field">
            <label>商机（可选）</label>
            <Select
              value={opportunityId}
              onChange={setOpportunityId}
              options={oppOptions}
              searchable
              placement="auto"
              disabled={!customerId}
            />
          </div>
          <div className="field">
            <label>标题</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          {editTask ? (
            <div className="field">
              <label>状态</label>
              <Select
                value={taskStatus}
                onChange={setTaskStatus}
                options={[
                  { value: "pending", label: "待办" },
                  { value: "done", label: "已完成" },
                ]}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field">
              <label>截止日期</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <div className="field">
              <label>截止时间</label>
              <TimePicker value={time} onChange={setTime} />
            </div>
          </div>
        </form>
      </Modal>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {loading && list.length === 0 && (
          <CardListSkeleton count={4} className="lg:col-span-2 lg:grid-cols-2" />
        )}
        {list.length === 0 && !loading && (
          <div className="text-sm text-[var(--color-muted)] lg:col-span-2">
            暂无待办
          </div>
        )}
        {list.map((t) => {
            const isMine =
              meId != null && t.owner_id != null && Number(t.owner_id) === meId;
            const canRemind =
              meId != null &&
              canOwnerSearch &&
              !isMine &&
              t.owner_id != null &&
              t.status === "pending";
            return (
            <div
              key={t.id}
              className="surface card-interactive relative p-4"
            >
              <div className="flex min-w-0 items-start gap-2">
                <div className="card-corner-status mt-0.5">
                  <StatusTag kind="task" value={t.status} />
                  {t.status === "pending" ? (
                    <StatusTag
                      kind="task_urgency"
                      value={taskDueUrgency(t.due_at, t.status)}
                    />
                  ) : null}
                </div>
                <div className="min-w-0 font-semibold">
                  {t.title}
                  {t.source === "ai" && (
                    <span className="ml-2 text-xs font-medium text-[var(--color-accent)]">
                      AI
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
                {t.owner_name ? (
                  <span className="shrink-0">{t.owner_name}</span>
                ) : null}
                {t.customer_id ? (
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => router.push(`/customers/${t.customer_public_id || t.customer_id}`)}
                  >
                    {t.customer_name || "客户"}
                  </button>
                ) : (
                  <span className="shrink-0">未关联客户</span>
                )}
                {t.opportunity_title ? (
                  <>
                    <span className="shrink-0 text-[var(--color-border)]" aria-hidden>
                      |
                    </span>
                    <span>
                      商机{" "}
                      <span className="text-[var(--color-text)]">
                        {t.opportunity_title}
                      </span>
                    </span>
                  </>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-[var(--color-muted)]">
                {t.due_at
                  ? new Date(t.due_at).toLocaleString("zh-CN")
                  : "无截止"}
              </div>
              <div className="card-actions flex items-center gap-1.5">
                {canRemind ? (
                  <IconButton
                    icon="bell"
                    label="催办"
                    variant="secondary"
                    disabled={remindingId === t.id}
                    onClick={() => void remindTask(t)}
                  />
                ) : null}
                {isMine ? (
                  <>
                    <IconButton
                      icon="pencil"
                      label="编辑"
                      variant="secondary"
                      onClick={() => openEdit(t)}
                    />
                    <IconButton
                      icon="trash"
                      label="删除"
                      variant="danger"
                      onClick={() => void deleteTask(t)}
                    />
                  </>
                ) : null}
              </div>
            </div>
            );
          })}
      </div>

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
    </div>
  );
}
