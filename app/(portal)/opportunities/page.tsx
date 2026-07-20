"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AppLink } from "@/components/ui/AppLink";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { Modal } from "@/components/ui/Modal";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { STAGE_LABELS, type OpportunityStage, type SessionUser } from "@/types";
import { useUi } from "@/components/ui/Feedback";
import { ContextChat } from "@/components/ai/ContextChat";
import { StatusTag } from "@/components/ui/StatusTag";
import { CardListSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { EMPTY_PAGE_META, pageRowNo, type PageMeta } from "@/lib/pagination";
import { subscribeListFilters, takeListFilters, normalizePath } from "@/lib/nav-filters";
import { useAppRouter } from "@/hooks/useAppRouter";
import { formatDateTime } from "@/lib/utils";
import { downloadExport, exportStamp } from "@/lib/download-export";

type OppViewMode = "table" | "card" | "funnel";

const STAGE_ORDER = Object.keys(STAGE_LABELS) as OpportunityStage[];

const STAGE_COL: Record<OpportunityStage, string> = {
  lead: "border-slate-200 bg-slate-50/80",
  contact: "border-sky-200 bg-sky-50/60",
  proposal: "border-amber-200 bg-amber-50/60",
  won: "border-emerald-200 bg-emerald-50/60",
  lost: "border-rose-200 bg-rose-50/50",
};

type Opp = {
  id: number;
  title: string;
  stage: string;
  amount: number | null;
  customer_name?: string;
  customer_id: number;
  owner_name?: string;
  expected_close_date?: string | null;
  created_at?: string;
  stage_suggestion_json?: {
    stage?: string;
    reason?: string;
  } | null;
};

type CustomerOpt = {
  id: number;
  name: string;
  company_name?: string | null;
};

const REASON_OPTIONS = [
  { value: "价格", label: "价格" },
  { value: "功能", label: "功能" },
  { value: "竞品", label: "竞品" },
  { value: "关系", label: "关系/信任" },
  { value: "时机", label: "时机/预算周期" },
  { value: "服务", label: "服务交付" },
  { value: "其他", label: "其他" },
];

const STAGE_OPTIONS = Object.entries(STAGE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function canShowOwnerSearch(user: SessionUser) {
  if (user.act_as_company_id) return true;
  return user.role === "company_admin" || user.role === "sales_manager";
}

export default function OpportunitiesPage() {
  const ui = useUi();
  const router = useAppRouter();
  const pathname = usePathname();
  const [list, setList] = useState<Opp[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [q, setQ] = useState("");
  const [ownerQ, setOwnerQ] = useState("");
  const [canOwnerSearch, setCanOwnerSearch] = useState(false);
  const [stages, setStages] = useState<string[]>([]);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [navReady, setNavReady] = useState(false);
  const [navToken, setNavToken] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [error, setError] = useState("");
  const [reviewOppId, setReviewOppId] = useState<number | null>(null);
  const [chatOpp, setChatOpp] = useState<Opp | null>(null);
  const [taskOpp, setTaskOpp] = useState<Opp | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [taskTime, setTaskTime] = useState("18:00");
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [outcome, setOutcome] = useState("won");
  const [reason, setReason] = useState("价格");
  const [detail, setDetail] = useState("");
  const [lessons, setLessons] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpp, setEditOpp] = useState<Opp | null>(null);
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [createCustomerId, setCreateCustomerId] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createStage, setCreateStage] = useState("lead");
  const [createDate, setCreateDate] = useState("");
  const [createAmount, setCreateAmount] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<OppViewMode>(() => {
    if (typeof window === "undefined") return "card";
    try {
      const saved = localStorage.getItem("crm:opportunities-view");
      if (saved === "table" || saved === "card" || saved === "funnel") return saved;
      if (saved === "list") return "card";
    } catch {
      /* ignore */
    }
    return "card";
  });
  const [movingId, setMovingId] = useState<number | null>(null);
  const [funnelDrag, setFunnelDrag] = useState<{
    oppId: number;
    title: string;
    x: number;
    y: number;
  } | null>(null);
  const [dropStage, setDropStage] = useState<OpportunityStage | null>(null);
  const [pressHoldId, setPressHoldId] = useState<number | null>(null);
  const funnelDragRef = useRef<{
    oppId: number;
    title: string;
    startX: number;
    startY: number;
    started: boolean;
    armed: boolean;
    needLongPress: boolean;
    pointerId: number;
    target: HTMLElement | null;
  } | null>(null);
  const funnelBoardRef = useRef<HTMLDivElement | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const isTabletRef = useRef(false);

  function changeViewMode(mode: OppViewMode) {
    if (mode === "funnel" && !isDesktop) return;
    setViewMode(mode);
    endFunnelDrag();
    try {
      localStorage.setItem("crm:opportunities-view", mode);
    } catch {
      /* ignore */
    }
  }

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

  const load = useCallback(
    async (opts?: {
      keyword?: string;
      ownerKeyword?: string;
      stages?: string[];
      createdFrom?: string;
      createdTo?: string;
      page?: number;
      pageSize?: number;
      mode?: OppViewMode;
    }) => {
      const keyword = opts?.keyword ?? q;
      const ownerKeyword = opts?.ownerKeyword ?? ownerQ;
      const mode = opts?.mode ?? viewMode;
      const stagesFilter = mode === "funnel" ? [] : opts?.stages ?? stages;
      const from = opts?.createdFrom ?? createdFrom;
      const to = opts?.createdTo ?? createdTo;
      const p = opts?.page ?? page;
      const size = opts?.pageSize ?? pageSize;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (mode !== "funnel") {
          params.set("page", String(p));
          params.set("pageSize", String(size));
        }
        if (keyword.trim()) params.set("q", keyword.trim());
        if (ownerKeyword.trim()) params.set("owner_q", ownerKeyword.trim());
        if (stagesFilter.length) params.set("stages", stagesFilter.join(","));
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const res = await fetch(`/api/opportunities?${params}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "加载失败");
          ui.error("加载商机失败", json.error);
        } else {
          setError("");
          setList(json.data || []);
          if (mode !== "funnel" && json.meta) {
            setMeta(json.meta);
            if (json.meta.page !== p) setPage(json.meta.page);
          } else if (mode === "funnel") {
            setMeta({
              ...EMPTY_PAGE_META,
              total: (json.data || []).length,
              pageSize: (json.data || []).length || 10,
            });
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, q, ownerQ, stages, createdFrom, createdTo, viewMode, ui]
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
      const nextStages = Array.isArray(fromNav.stages)
        ? fromNav.stages.filter(Boolean)
        : [];
      if (nextStages.length) {
        setStages(nextStages);
      } else if (fromNav.open === true) {
        setStages(["lead", "contact", "proposal"]);
      } else {
        setStages([]);
      }
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
  }, [navReady, page, pageSize, stages, navToken, viewMode]);

  function onSearch() {
    if (page === 1)
      void load({
        keyword: q,
        ownerKeyword: ownerQ,
        createdFrom,
        createdTo,
        page: 1,
      });
    else setPage(1);
  }

  function onStagesChange(v: string[]) {
    setStages(v);
    setPage(1);
  }

  async function onExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (ownerQ.trim()) params.set("owner_q", ownerQ.trim());
      if (stages.length) params.set("stages", stages.join(","));
      if (createdFrom) params.set("from", createdFrom);
      if (createdTo) params.set("to", createdTo);
      const qs = params.toString();
      await downloadExport(
        `/api/exports/opportunities${qs ? `?${qs}` : ""}`,
        `商机导出-${exportStamp()}.csv`
      );
      ui.success("已导出商机 CSV");
    } catch (err) {
      ui.error("导出失败", err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  }

  function openCreate() {
    setEditOpp(null);
    setCreateCustomerId("");
    setCreateTitle("");
    setCreateStage("lead");
    setCreateDate("");
    setCreateAmount("");
    setCreateOpen(true);
    void (async () => {
      const res = await fetch("/api/customers");
      const json = await res.json();
      if (res.ok) setCustomers(json.data || []);
      else ui.error("加载客户失败", json.error);
    })();
  }

  function toYmd(v?: string | null) {
    if (!v) return "";
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function openEdit(o: Opp) {
    setEditOpp(o);
    setCreateCustomerId(String(o.customer_id));
    setCreateTitle(o.title);
    setCreateStage(o.stage || "lead");
    setCreateDate(toYmd(o.expected_close_date));
    setCreateAmount(o.amount != null ? String(o.amount) : "");
    setCreateOpen(true);
  }

  async function saveOpportunity(e: React.FormEvent) {
    e.preventDefault();
    if (!editOpp && !createCustomerId) {
      ui.error("请选择客户");
      return;
    }
    if (!createTitle.trim()) {
      ui.error("请填写商机标题");
      return;
    }
    const stageLabel =
      STAGE_LABELS[createStage as keyof typeof STAGE_LABELS] || createStage;
    const isEdit = Boolean(editOpp);
    const ok = await ui.confirm({
      title: isEdit ? "确认保存商机？" : "确认创建商机？",
      description: isEdit
        ? `将更新商机「${createTitle.trim()}」。`
        : `将创建商机「${createTitle.trim()}」，初始阶段为「${stageLabel}」。`,
      confirmText: isEdit ? "确认保存" : "确认创建",
    });
    if (!ok) return;
    setCreateSubmitting(true);
    try {
      if (isEdit && editOpp) {
        const res = await fetch(`/api/opportunities/${editOpp.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: createTitle.trim(),
            stage: createStage,
            expected_close_date: createDate || null,
            amount: createAmount.trim() ? Number(createAmount) : null,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("保存失败", json.error);
          return;
        }
        ui.success("商机已更新", createTitle.trim());
        setCreateOpen(false);
        setEditOpp(null);
        if (createStage === "won" || createStage === "lost") {
          setReviewOppId(editOpp.id);
          setOutcome(createStage);
        }
        await load();
      } else {
        const res = await fetch("/api/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: Number(createCustomerId),
            title: createTitle.trim(),
            stage: createStage,
            expected_close_date: createDate || null,
            amount: createAmount.trim() ? Number(createAmount) : null,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("创建商机失败", json.error);
          return;
        }
        ui.success("商机已创建", createTitle.trim());
        setCreateOpen(false);
        if (page === 1) await load({ page: 1 });
        else setPage(1);
      }
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function acceptSuggestion(id: number, title: string, stage?: string) {
    const label = stage
      ? STAGE_LABELS[stage as keyof typeof STAGE_LABELS] || stage
      : "建议阶段";
    const ok = await ui.confirm({
      title: "确认采纳阶段建议？",
      description: `将「${title}」推进到「${label}」。`,
      confirmText: "采纳建议",
    });
    if (!ok) return;
    const res = await fetch(`/api/opportunities/${id}/stage-suggestion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    const json = await res.json();
    if (!res.ok) ui.error("采纳失败", json.error);
    else {
      ui.success("已采纳阶段建议");
      const next = json.data?.stage;
      if (next === "won" || next === "lost") {
        setReviewOppId(id);
        setOutcome(next);
      }
      await load();
    }
  }

  async function dismissSuggestion(id: number) {
    const ok = await ui.confirm({
      title: "忽略该阶段建议？",
      description: "忽略后可继续手动调整商机阶段。",
      confirmText: "忽略建议",
    });
    if (!ok) return;
    const res = await fetch(`/api/opportunities/${id}/stage-suggestion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
    const json = await res.json();
    if (!res.ok) ui.error("操作失败", json.error);
    else {
      ui.success("已忽略建议");
      await load();
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewOppId) return;
    const ok = await ui.confirm({
      title: "提交成交复盘？",
      description: "提交后将写入复盘记录，供分析看板统计。",
      confirmText: "提交复盘",
    });
    if (!ok) return;
    const res = await fetch("/api/opportunity-reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opportunity_id: reviewOppId,
        outcome,
        reason_category: reason,
        detail,
        lessons,
      }),
    });
    const json = await res.json();
    if (!res.ok) ui.error("复盘提交失败", json.error);
    else {
      ui.success("复盘已提交");
      setReviewOppId(null);
      setDetail("");
      setLessons("");
      await load();
    }
  }

  async function createOppTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskOpp) return;
    if (!taskTitle.trim()) {
      ui.error("请填写标题");
      return;
    }
    setTaskSubmitting(true);
    try {
      const due_at = taskDate ? `${taskDate}T${taskTime || "18:00"}:00` : null;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: taskOpp.customer_id,
          opportunity_id: taskOpp.id,
          title: taskTitle.trim(),
          due_at,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("创建待办失败", json.error);
        return;
      }
      ui.success("待办已创建", taskTitle.trim());
      setTaskOpp(null);
      setTaskTitle("");
      setTaskDate("");
      setTaskTime("18:00");
    } finally {
      setTaskSubmitting(false);
    }
  }

  async function deleteOpportunity(o: Opp) {
    const ok = await ui.confirm({
      title: "确认删除商机？",
      description: `将永久删除「${o.title}」。关联待办会解除商机关联。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/opportunities/${o.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) ui.error("删除失败", json.error);
    else {
      ui.success("商机已删除");
      await load();
    }
  }

  async function moveStage(opp: Opp, nextStage: OpportunityStage) {
    if (opp.stage === nextStage) return;
    setMovingId(opp.id);
    const prev = opp.stage;
    setList((cur) =>
      cur.map((x) => (x.id === opp.id ? { ...x, stage: nextStage } : x))
    );
    try {
      const res = await fetch(`/api/opportunities/${opp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: nextStage }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setList((cur) =>
          cur.map((x) => (x.id === opp.id ? { ...x, stage: prev } : x))
        );
        ui.error("阶段更新失败", json.error);
        return;
      }
      ui.success(`已移至「${STAGE_LABELS[nextStage]}」`);
      if (nextStage === "won" || nextStage === "lost") {
        setReviewOppId(opp.id);
        setOutcome(nextStage);
      }
    } finally {
      setMovingId(null);
    }
  }

  function stopFunnelAutoScroll() {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }

  function edgeScrollDelta(
    pos: number,
    start: number,
    end: number,
    edge = 56,
    maxSpeed = 22
  ) {
    if (pos < start + edge) {
      const t = Math.max(0, Math.min(1, 1 - (pos - start) / edge));
      return -maxSpeed * t;
    }
    if (pos > end - edge) {
      const t = Math.max(0, Math.min(1, 1 - (end - pos) / edge));
      return maxSpeed * t;
    }
    return 0;
  }

  function tickFunnelAutoScroll() {
    autoScrollRafRef.current = null;
    const st = funnelDragRef.current;
    const pos = lastPointerRef.current;
    if (!st?.started || !pos) return;

    let scrolled = false;
    const board = funnelBoardRef.current;
    if (board) {
      const r = board.getBoundingClientRect();
      const dx = edgeScrollDelta(pos.x, r.left, r.right);
      if (dx) {
        const before = board.scrollLeft;
        board.scrollLeft += dx;
        if (board.scrollLeft !== before) scrolled = true;
      }
    }

    const under = document.elementFromPoint(pos.x, pos.y);
    const colScroll = under?.closest?.(
      "[data-funnel-col-scroll]"
    ) as HTMLElement | null;
    if (colScroll) {
      const r = colScroll.getBoundingClientRect();
      const dy = edgeScrollDelta(pos.y, r.top, r.bottom);
      if (dy) {
        const before = colScroll.scrollTop;
        colScroll.scrollTop += dy;
        if (colScroll.scrollTop !== before) scrolled = true;
      }
    }

    {
      const dy = edgeScrollDelta(pos.y, 0, window.innerHeight, 64, 18);
      if (dy) {
        const before = window.scrollY;
        window.scrollBy(0, dy);
        if (window.scrollY !== before) scrolled = true;
      }
    }

    if (scrolled) {
      setDropStage(stageFromPoint(pos.x, pos.y));
    }

    autoScrollRafRef.current = requestAnimationFrame(tickFunnelAutoScroll);
  }

  function startFunnelAutoScroll() {
    if (autoScrollRafRef.current != null) return;
    autoScrollRafRef.current = requestAnimationFrame(tickFunnelAutoScroll);
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function endFunnelDrag() {
    clearLongPressTimer();
    stopFunnelAutoScroll();
    funnelDragRef.current = null;
    lastPointerRef.current = null;
    setFunnelDrag(null);
    setDropStage(null);
    setPressHoldId(null);
  }

  function stageFromPoint(x: number, y: number): OpportunityStage | null {
    const el = document.elementFromPoint(x, y);
    const col = el?.closest?.("[data-funnel-stage]") as HTMLElement | null;
    const stage = col?.dataset?.funnelStage;
    if (stage && STAGE_LABELS[stage as OpportunityStage]) {
      return stage as OpportunityStage;
    }
    return null;
  }

  function beginFunnelDragVisual(st: NonNullable<typeof funnelDragRef.current>) {
    st.armed = true;
    st.started = true;
    setPressHoldId(null);
    const pos = lastPointerRef.current;
    if (pos) {
      setFunnelDrag({
        oppId: st.oppId,
        title: st.title,
        x: pos.x,
        y: pos.y,
      });
      setDropStage(stageFromPoint(pos.x, pos.y));
    }
    startFunnelAutoScroll();
    try {
      navigator.vibrate?.(20);
    } catch {
      /* ignore */
    }
  }

  function onFunnelPointerDown(e: React.PointerEvent, opp: Opp) {
    if (e.button !== 0) return;
    if (movingId === opp.id) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, [data-no-drag]")) return;

    clearLongPressTimer();
    // 触摸 / 手写笔一律走长按；避免平板被误判成「鼠标拖拽」导致原地长按无反应
    const needLongPress =
      e.pointerType === "touch" ||
      e.pointerType === "pen" ||
      isTabletRef.current;
    const el = e.currentTarget as HTMLElement;

    if (needLongPress) {
      // 降低 iOS 长按被系统取消 / 出菜单的概率
      e.preventDefault();
    }

    funnelDragRef.current = {
      oppId: opp.id,
      title: opp.title,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
      armed: !needLongPress,
      needLongPress,
      pointerId: e.pointerId,
      target: el,
    };
    lastPointerRef.current = { x: e.clientX, y: e.clientY };

    if (needLongPress) {
      setPressHoldId(opp.id);
      longPressTimerRef.current = window.setTimeout(() => {
        const st = funnelDragRef.current;
        if (!st || st.pointerId !== e.pointerId || st.armed) return;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        beginFunnelDragVisual(st);
      }, 350);
      return;
    }

    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onFunnelPointerMove(e: React.PointerEvent) {
    const st = funnelDragRef.current;
    if (!st || st.pointerId !== e.pointerId) return;

    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    const dist = Math.hypot(dx, dy);

    // 长按未触发前：明显滑动则取消（当作滚动）
    if (st.needLongPress && !st.armed) {
      if (dist > 12) {
        clearLongPressTimer();
        funnelDragRef.current = null;
        lastPointerRef.current = null;
        setPressHoldId(null);
      }
      return;
    }

    if (!st.started) {
      if (dist < 6) return;
      st.started = true;
      startFunnelAutoScroll();
    }

    if (st.needLongPress) {
      e.preventDefault();
    }

    setFunnelDrag({
      oppId: st.oppId,
      title: st.title,
      x: e.clientX,
      y: e.clientY,
    });
    setDropStage(stageFromPoint(e.clientX, e.clientY));
  }

  function onFunnelPointerUp(e: React.PointerEvent) {
    const st = funnelDragRef.current;
    if (!st || st.pointerId !== e.pointerId) return;

    const wasActive = st.started && st.armed;
    const oppId = st.oppId;
    const nextStage = wasActive ? stageFromPoint(e.clientX, e.clientY) : null;
    const target = st.target;
    endFunnelDrag();

    try {
      target?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (!wasActive || !nextStage) return;
    const opp = list.find((x) => x.id === oppId);
    if (opp) void moveStage(opp, nextStage);
  }

  function onFunnelPointerCancel(e: React.PointerEvent) {
    const st = funnelDragRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    endFunnelDrag();
  }

  useEffect(() => {
    // 漏斗仅电脑宽屏（≥1024px）
    const desktopMq = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      const desktop = desktopMq.matches;
      setIsDesktop(desktop);
      isTabletRef.current = false;
      if (!desktop) {
        setViewMode((m) => {
          if (m !== "funnel") return m;
          try {
            localStorage.setItem("crm:opportunities-view", "card");
          } catch {
            /* ignore */
          }
          return "card";
        });
        endFunnelDrag();
      }
    };
    apply();
    desktopMq.addEventListener("change", apply);
    return () => desktopMq.removeEventListener("change", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => stopFunnelAutoScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const funnelGroups = useMemo(() => {
    const map = Object.fromEntries(
      STAGE_ORDER.map((s) => [s, [] as Opp[]])
    ) as Record<OpportunityStage, Opp[]>;
    for (const o of list) {
      const stage = (STAGE_LABELS[o.stage as OpportunityStage]
        ? o.stage
        : "lead") as OpportunityStage;
      map[stage].push(o);
    }
    return map;
  }, [list]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">商机</h1>
          <p className="text-sm text-[var(--color-muted)]">
            漏斗管理、AI 阶段建议与成交/流失复盘
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-lg border border-[var(--color-border)] bg-white p-0.5"
            role="group"
            aria-label="展示方式"
          >
            {(
              [
                ["table", "表格"],
                ["card", "卡片"],
                ...(isDesktop ? [["funnel", "漏斗"] as const] : []),
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  viewMode === mode
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                }`}
                aria-pressed={viewMode === mode}
                onClick={() => changeViewMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => void onExport()} disabled={exporting}>
            {exporting ? "导出中…" : "导出 CSV"}
          </Button>
          <Button onClick={openCreate}>新建商机</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40 shrink-0">
          <Select
            multiple
            value={stages}
            onChange={onStagesChange}
            placeholder="全部状态"
            options={STAGE_OPTIONS}
          />
        </div>
        <div className="relative w-72 max-w-full shrink-0">
          <input
            className={`input ${q ? "pr-9" : ""}`}
            placeholder="搜索客户名 / 联系人 / 商机名"
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
                if (page === 1) void load({ keyword: "", page: 1 });
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
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      <Modal
        open={createOpen}
        title={editOpp ? "编辑商机" : "新建商机"}
        description={
          editOpp ? "修改商机标题、阶段、金额与预计成交日" : "选择客户并填写商机信息"
        }
        onClose={() => {
          setCreateOpen(false);
          setEditOpp(null);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCreateOpen(false);
                setEditOpp(null);
              }}
            >
              取消
            </Button>
            <Button type="submit" form="opp-create-form" disabled={createSubmitting}>
              {createSubmitting
                ? editOpp
                  ? "保存中…"
                  : "创建中…"
                : editOpp
                  ? "保存"
                  : "创建商机"}
            </Button>
          </>
        }
      >
        <form id="opp-create-form" onSubmit={saveOpportunity} className="space-y-3">
          <div className="field">
            <label>客户</label>
            {editOpp ? (
              <div className="input bg-slate-50 text-[var(--color-muted)]">
                {editOpp.customer_name || "客户"}
              </div>
            ) : (
              <Select
                value={createCustomerId}
                onChange={setCreateCustomerId}
                options={customerOptions}
                searchable
                placement="auto"
              />
            )}
          </div>
          <div className="field">
            <label>商机标题</label>
            <input
              className="input"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>阶段</label>
            <Select
              value={createStage}
              onChange={setCreateStage}
              options={Object.entries(STAGE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field">
              <label>预计成交日</label>
              <DatePicker
                value={createDate}
                onChange={setCreateDate}
                placeholder="预计成交日"
              />
            </div>
            <div className="field">
              <label>金额（可选）</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={createAmount}
                onChange={(e) => setCreateAmount(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={reviewOppId != null}
        title="成交复盘"
        description="记录赢单/输单原因，便于后续分析"
        onClose={() => setReviewOppId(null)}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setReviewOppId(null)}>
              稍后
            </Button>
            <Button type="submit" form="opp-review-form">
              提交复盘
            </Button>
          </>
        }
      >
        <form id="opp-review-form" onSubmit={submitReview} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="field">
            <label>结果</label>
            <Select
              value={outcome}
              onChange={setOutcome}
              options={[
                { value: "won", label: "成交" },
                { value: "lost", label: "流失" },
              ]}
            />
          </div>
          <div className="field">
            <label>原因分类</label>
            <Select value={reason} onChange={setReason} options={REASON_OPTIONS} />
          </div>
          <div className="field sm:col-span-2">
            <label>详情</label>
            <textarea
              className="input textarea"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              required
            />
          </div>
          <div className="field sm:col-span-2">
            <label>可复用经验</label>
            <textarea
              className="input textarea"
              value={lessons}
              onChange={(e) => setLessons(e.target.value)}
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={taskOpp != null}
        title={taskOpp ? `新建待办 · ${taskOpp.title}` : "新建待办"}
        description={
          taskOpp
            ? `将关联客户「${taskOpp.customer_name || taskOpp.customer_id}」与当前商机`
            : undefined
        }
        onClose={() => setTaskOpp(null)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setTaskOpp(null)}>
              取消
            </Button>
            <Button type="submit" form="opp-task-form" disabled={taskSubmitting}>
              {taskSubmitting ? "创建中…" : "创建待办"}
            </Button>
          </>
        }
      >
        <form id="opp-task-form" onSubmit={createOppTask} className="space-y-3">
          <div className="field">
            <label>标题</label>
            <input
              className="input"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field">
              <label>截止日期</label>
              <DatePicker value={taskDate} onChange={setTaskDate} />
            </div>
            <div className="field">
              <label>截止时间</label>
              <TimePicker value={taskTime} onChange={setTaskTime} />
            </div>
          </div>
        </form>
      </Modal>

      {viewMode === "table" && (
        loading ? (
          <TableSkeleton rows={pageSize > 10 ? 8 : pageSize} cols={9} />
        ) : (
          <div className="surface overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
                <tr>
                  <th className="w-14 whitespace-nowrap px-4 py-3">#</th>
                  <th className="whitespace-nowrap px-4 py-3">阶段</th>
                  <th className="whitespace-nowrap px-4 py-3">商机</th>
                  <th className="whitespace-nowrap px-4 py-3">客户</th>
                  <th className="whitespace-nowrap px-4 py-3">负责人</th>
                  <th className="whitespace-nowrap px-4 py-3">金额</th>
                  <th className="whitespace-nowrap px-4 py-3">录入时间</th>
                  <th className="whitespace-nowrap px-4 py-3">AI 建议</th>
                  <th className="whitespace-nowrap px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-[var(--color-muted)]">
                      暂无商机
                    </td>
                  </tr>
                )}
                {list.map((o, i) => (
                  <tr key={o.id} className="border-t border-[var(--color-border)]">
                    <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">
                      {pageRowNo(meta, i)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusTag kind="stage" value={o.stage} />
                    </td>
                    <td className="max-w-[14rem] px-4 py-3 font-medium">
                      <span className="line-clamp-2">{o.title}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <AppLink
                        href={`/customers/${o.customer_id}`}
                        className="text-link"
                      >
                        {o.customer_name || "客户"}
                      </AppLink>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {o.owner_name || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {o.amount != null ? `¥${o.amount}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--color-muted)]">
                      {formatDateTime(o.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {o.stage_suggestion_json?.stage ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusTag
                            kind="stage"
                            value={o.stage_suggestion_json.stage}
                          />
                          <Button
                            className="!px-1.5 !py-0.5 !text-[11px]"
                            onClick={() =>
                              acceptSuggestion(
                                o.id,
                                o.title,
                                o.stage_suggestion_json?.stage
                              )
                            }
                          >
                            采纳
                          </Button>
                          <Button
                            variant="secondary"
                            className="!px-1.5 !py-0.5 !text-[11px]"
                            onClick={() => dismissSuggestion(o.id)}
                          >
                            忽略
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[var(--color-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <IconButton
                          icon="pencil"
                          label="编辑商机"
                          variant="secondary"
                          onClick={() => openEdit(o)}
                        />
                        <IconButton
                          icon="chat"
                          label="AI 对话"
                          variant="secondary"
                          onClick={() => setChatOpp(o)}
                        />
                        <IconButton
                          icon="plus"
                          label="新建待办"
                          variant="secondary"
                          onClick={() => {
                            setTaskOpp(o);
                            setTaskTitle("");
                            setTaskDate("");
                            setTaskTime("18:00");
                          }}
                        />
                        <IconButton
                          icon="clipboard"
                          label="新建报价"
                          variant="secondary"
                          href={`/quotes?opportunity_id=${o.id}`}
                        />
                        {(o.stage === "won" || o.stage === "lost") && (
                          <IconButton
                            icon="clipboard"
                            label="复盘"
                            variant="secondary"
                            onClick={() => {
                              setReviewOppId(o.id);
                              setOutcome(o.stage);
                            }}
                          />
                        )}
                        <IconButton
                          icon="trash"
                          label="删除商机"
                          variant="danger"
                          onClick={() => void deleteOpportunity(o)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {viewMode === "card" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {loading && (
            <CardListSkeleton count={4} className="lg:col-span-2 lg:grid-cols-2" />
          )}
          {!loading &&
            list.map((o) => (
          <div key={o.id} className="surface card-interactive relative p-4">
            <div className="flex min-w-0 items-center gap-2">
              <div className="card-corner-status">
                <StatusTag kind="stage" value={o.stage} />
              </div>
              <div className="min-w-0 font-semibold">{o.title}</div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
              {o.owner_name ? (
                <span className="shrink-0">{o.owner_name}</span>
              ) : null}
              <AppLink
                href={`/customers/${o.customer_id}`}
                className="text-link"
              >
                {o.customer_name || "客户"}
              </AppLink>
              {o.amount != null ? (
                <span className="shrink-0 whitespace-nowrap">¥{o.amount}</span>
              ) : null}
            </div>
            {o.created_at ? (
              <div className="mt-1 text-xs text-[var(--color-muted)]">
                {formatDateTime(o.created_at)}
              </div>
            ) : null}
            <div className="card-actions flex items-center gap-1.5">
              <IconButton
                icon="pencil"
                label="编辑商机"
                variant="secondary"
                onClick={() => openEdit(o)}
              />
              <IconButton
                icon="chat"
                label="AI 对话"
                variant="secondary"
                onClick={() => setChatOpp(o)}
              />
              <IconButton
                icon="plus"
                label="新建待办"
                variant="secondary"
                onClick={() => {
                  setTaskOpp(o);
                  setTaskTitle("");
                  setTaskDate("");
                  setTaskTime("18:00");
                }}
              />
              <IconButton
                icon="clipboard"
                label="新建报价"
                variant="secondary"
                href={`/quotes?opportunity_id=${o.id}`}
              />
              {(o.stage === "won" || o.stage === "lost") && (
                <IconButton
                  icon="clipboard"
                  label="复盘"
                  variant="secondary"
                  onClick={() => {
                    setReviewOppId(o.id);
                    setOutcome(o.stage);
                  }}
                />
              )}
              <IconButton
                icon="trash"
                label="删除商机"
                variant="danger"
                onClick={() => void deleteOpportunity(o)}
              />
            </div>

            {o.stage_suggestion_json?.stage && (
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs">
                <span className="shrink-0 font-medium text-amber-900">AI 建议</span>
                <StatusTag kind="stage" value={o.stage_suggestion_json.stage} />
                {o.stage_suggestion_json.reason ? (
                  <span
                    className="min-w-0 flex-1 truncate text-amber-800/80"
                    title={o.stage_suggestion_json.reason}
                  >
                    {o.stage_suggestion_json.reason}
                  </span>
                ) : (
                  <span className="min-w-0 flex-1" />
                )}
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    className="!px-2 !py-0.5 !text-xs"
                    onClick={() =>
                      acceptSuggestion(o.id, o.title, o.stage_suggestion_json?.stage)
                    }
                  >
                    采纳
                  </Button>
                  <Button
                    variant="secondary"
                    className="!px-2 !py-0.5 !text-xs"
                    onClick={() => dismissSuggestion(o.id)}
                  >
                    忽略
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        </div>
      )}

      {viewMode === "funnel" && isDesktop && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-muted)]">
            按住卡片拖到目标阶段列松开即可移动
            {stages.length > 0
              ? " · 漏斗展示全部阶段，上方筛选仅作用于表格/卡片"
              : ""}
          </p>
          {loading ? (
            <CardListSkeleton count={5} className="sm:grid-cols-2 lg:grid-cols-5" />
          ) : (
            <div
              ref={funnelBoardRef}
              className="overflow-x-auto px-1 pt-2 pb-3"
            >
              <div className="flex min-w-[64rem] gap-3">
                {STAGE_ORDER.map((stage) => {
                  const items = funnelGroups[stage];
                  const amountSum = items.reduce(
                    (sum, o) => sum + (Number(o.amount) || 0),
                    0
                  );
                  const isDropTarget = dropStage === stage && funnelDrag != null;
                  return (
                    <div
                      key={stage}
                      data-funnel-stage={stage}
                      className={`flex w-56 shrink-0 flex-col rounded-xl border transition ${STAGE_COL[stage]} ${
                        isDropTarget
                          ? "border-[var(--color-accent)] shadow-[inset_0_0_0_2px_var(--color-accent)]"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {STAGE_LABELS[stage]}
                          </div>
                          <div className="text-[11px] text-[var(--color-muted)]">
                            {items.length} 条
                            {amountSum > 0
                              ? ` · ¥${amountSum.toLocaleString("zh-CN")}`
                              : ""}
                            {isDropTarget ? " · 松开移入" : ""}
                          </div>
                        </div>
                        <StatusTag kind="stage" value={stage} />
                      </div>
                      <div
                        data-funnel-col-scroll
                        className="flex min-h-[8rem] max-h-[min(70vh,36rem)] flex-1 flex-col gap-2 overflow-y-auto p-2"
                      >
                        {items.length === 0 ? (
                          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-black/10 px-2 py-6 text-center text-xs text-[var(--color-muted)]">
                            {isDropTarget ? "松开移入此阶段" : "拖入商机"}
                          </div>
                        ) : (
                          items.map((o) => {
                            const dragging = funnelDrag?.oppId === o.id;
                            const holding = pressHoldId === o.id && !dragging;
                            return (
                              <div
                                key={o.id}
                                onPointerDown={(e) => onFunnelPointerDown(e, o)}
                                onPointerMove={onFunnelPointerMove}
                                onPointerUp={onFunnelPointerUp}
                                onPointerCancel={onFunnelPointerCancel}
                                onContextMenu={(e) => e.preventDefault()}
                                className={`select-none rounded-lg border bg-white p-2.5 shadow-sm transition ${
                                  dragging || holding ? "touch-none" : ""
                                } ${
                                  dragging
                                    ? "border-[var(--color-accent)] opacity-40"
                                    : holding
                                      ? "scale-[1.02] border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/40"
                                      : movingId === o.id
                                        ? "border-[var(--color-border)] opacity-50"
                                        : "border-[var(--color-border)] cursor-grab active:cursor-grabbing"
                                }`}
                              >
                                <div className="line-clamp-2 text-sm font-medium leading-snug">
                                  {o.title}
                                </div>
                                {holding ? (
                                  <div className="mt-1 text-[11px] font-medium text-[var(--color-accent)]">
                                    继续按住…可拖动
                                  </div>
                                ) : null}
                                <div className="mt-1 truncate text-xs text-[var(--color-muted)]">
                                  <AppLink
                                    href={`/customers/${o.customer_id}`}
                                    className="text-link"
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    {o.customer_name || "客户"}
                                  </AppLink>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-muted)]">
                                  {o.owner_name ? <span>{o.owner_name}</span> : null}
                                  {o.amount != null ? (
                                    <span className="whitespace-nowrap">¥{o.amount}</span>
                                  ) : null}
                                </div>
                                {o.stage_suggestion_json?.stage ? (
                                  <div className="mt-1.5 text-[11px] text-amber-800">
                                    AI 建议 →{" "}
                                    {STAGE_LABELS[
                                      o.stage_suggestion_json.stage as OpportunityStage
                                    ] || o.stage_suggestion_json.stage}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {funnelDrag ? (
            <div
              className="pointer-events-none fixed z-[80] w-52 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--color-accent)] bg-white p-2.5 shadow-xl"
              style={{ left: funnelDrag.x, top: funnelDrag.y }}
            >
              <div className="line-clamp-2 text-sm font-medium">{funnelDrag.title}</div>
              <div className="mt-1 text-[11px] text-[var(--color-muted)]">
                {dropStage
                  ? `移至「${STAGE_LABELS[dropStage]}」`
                  : "拖到目标阶段列"}
              </div>
            </div>
          ) : null}
          {!loading && list.length >= 200 && (
            <p className="text-xs text-[var(--color-muted)]">
              漏斗最多展示 200 条，可用筛选缩小范围。
            </p>
          )}
        </div>
      )}

      {!loading && list.length === 0 && viewMode !== "table" && (
        <div className="text-sm text-[var(--color-muted)]">暂无商机，点击右上角「新建商机」创建。</div>
      )}

      {!loading && viewMode !== "funnel" && (
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
        open={chatOpp != null}
        title={chatOpp ? `商机 AI 助手 · ${chatOpp.title}` : "商机 AI 助手"}
        description="结合该商机与所属客户资料给出推进建议"
        onClose={() => setChatOpp(null)}
        size="lg"
        footer={
          <Button type="button" variant="secondary" onClick={() => setChatOpp(null)}>
            关闭
          </Button>
        }
      >
        {chatOpp && (
          <ContextChat
            opportunityId={chatOpp.id}
            title="对话"
            description="可问阶段推进、异议处理、成交卡点等"
            framed={false}
          />
        )}
      </Modal>
    </div>
  );
}
