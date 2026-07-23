"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppLink } from "@/components/ui/AppLink";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { Modal } from "@/components/ui/Modal";
import { useUi } from "@/components/ui/Feedback";
import { StatusTag } from "@/components/ui/StatusTag";
import { CardListSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { ViewModeToggle, useViewMode } from "@/components/ui/ViewModeToggle";
import { CollapsibleListFilters } from "@/components/ui/CollapsibleListFilters";
import { useAppRouter } from "@/hooks/useAppRouter";
import { customerLabel, cn, formatAudioDuration } from "@/lib/utils";
import { probeAudioDurationMs } from "@/lib/audio-duration";
import { EMPTY_PAGE_META, pageRowNo, type PageMeta } from "@/lib/pagination";
import { MEDIA_KIND_LABELS, labelOf } from "@/types";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { IconButton } from "@/components/ui/IconButton";
import { TagChip } from "@/components/ui/DelayedTooltip";
import { pageCacheFetchJson, pageCachePeek, pageCachePut } from "@/lib/page-cache";

type Customer = { id: number; company_name?: string | null; name: string };
export type Media = {
  id: number;
  kind: string;
  file_name: string;
  status: string;
  customer_id: number | null;
  customer_name?: string;
  customer_public_id?: string;
  customer_company_name?: string | null;
  uploader_name?: string | null;
  created_at: string;
  transcript?: string;
  duration_ms?: number | null;
  pain_points?: string[] | null;
  competitors?: string[] | null;
};

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x || "").trim()).filter(Boolean);
}

function InsightChips({
  painPoints,
  competitors,
}: {
  painPoints?: string[] | null;
  competitors?: string[] | null;
}) {
  const pains = asStringList(painPoints);
  const comps = asStringList(competitors);
  if (pains.length === 0 && comps.length === 0) {
    return <span className="text-[var(--color-muted)]">—</span>;
  }
  return (
    <div className="flex max-w-xs flex-col gap-1.5">
      {pains.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="shrink-0 text-[10px] font-semibold text-[var(--color-muted)]">
            痛点
          </span>
          {pains.slice(0, 4).map((p) => (
            <TagChip key={p} text={p} tone="amber" />
          ))}
          {pains.length > 4 ? (
            <span className="text-[10px] text-[var(--color-muted)]">+{pains.length - 4}</span>
          ) : null}
        </div>
      )}
      {comps.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="shrink-0 text-[10px] font-semibold text-[var(--color-muted)]">
            竞品
          </span>
          {comps.slice(0, 4).map((p) => (
            <TagChip key={p} text={p} tone="rose" />
          ))}
          {comps.length > 4 ? (
            <span className="text-[10px] text-[var(--color-muted)]">+{comps.length - 4}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

const KIND_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "call", label: "通话录音" },
  { value: "wechat", label: "微信聊天" },
];

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "uploaded", label: "已上传" },
  { value: "analyzing", label: "解析中" },
  { value: "analyzed", label: "已解析" },
  { value: "failed", label: "失败" },
];

const UPLOADS_SEED_URL = "/api/uploads?page=1&pageSize=10";

function MediaRowActions({
  m,
  onRename,
  onDelete,
  onReanalyze,
}: {
  m: Media;
  onRename: () => void;
  onDelete: () => void;
  onReanalyze: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; place: "bottom" | "top" } | null>(
    null
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const menuW = 128;

  const clearClose = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const updatePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const place: "bottom" | "top" = spaceBelow >= 120 ? "bottom" : "top";
    setPos({
      top: place === "bottom" ? rect.bottom + 4 : rect.top - 4,
      left: Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8)),
      place,
    });
  };

  const openMenu = () => {
    clearClose();
    updatePos();
    setOpen(true);
  };

  const scheduleClose = () => {
    clearClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePos();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  useEffect(() => () => clearClose(), []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const menu =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[200] overflow-hidden rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-[var(--shadow)]"
            style={{
              width: menuW,
              left: pos.left,
              top: pos.place === "bottom" ? pos.top : undefined,
              bottom: pos.place === "top" ? window.innerHeight - pos.top : undefined,
            }}
            onMouseEnter={openMenu}
            onMouseLeave={scheduleClose}
          >
            {m.customer_id ? (
              <AppLink
                href={`/customers/${m.customer_public_id || m.customer_id}`}
                role="menuitem"
                className="block px-3 py-2 text-sm hover:bg-[#eff6ff]"
                onClick={() => setOpen(false)}
              >
                看客户
              </AppLink>
            ) : null}
            {m.status !== "analyzed" && (
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[#eff6ff]"
                onClick={() => {
                  setOpen(false);
                  onReanalyze();
                }}
              >
                重新解析
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-[var(--color-danger)] hover:bg-red-50"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              删除
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="flex items-center justify-end gap-1.5">
      <IconButton
        icon="pencil"
        label="编辑"
        variant="secondary"
        onClick={onRename}
      />
      <div
        className="relative"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
      >
        <button
          ref={btnRef}
          type="button"
          title="更多"
          aria-label="更多"
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-text)] transition-colors hover:bg-slate-50",
            open && "border-[var(--color-accent)]/40 bg-slate-50"
          )}
          onClick={() => (open ? setOpen(false) : openMenu())}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="5" cy="12" r="1.75" fill="currentColor" />
            <circle cx="12" cy="12" r="1.75" fill="currentColor" />
            <circle cx="19" cy="12" r="1.75" fill="currentColor" />
          </svg>
        </button>
        {menu}
      </div>
    </div>
  );
}

export default function UploadsClient({
  initialData,
}: {
  initialData?: { data?: Media[]; meta?: PageMeta } | null;
}) {
  const ui = useUi();
  const router = useAppRouter();
  const seed =
    pageCachePeek<{ data?: Media[]; meta?: PageMeta }>(UPLOADS_SEED_URL) || initialData;
  const [viewMode, changeViewMode] = useViewMode("crm:uploads-view");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [list, setList] = useState<Media[]>(() => seed?.data || []);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PageMeta>(seed?.meta || EMPTY_PAGE_META);
  const [listLoading, setListLoading] = useState(() => seed == null);
  const hasRowsRef = useRef((seed?.data?.length || 0) > 0);
  hasRowsRef.current = list.length > 0;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("call");
  const [customerId, setCustomerId] = useState("");
  const [transcript, setTranscript] = useState("");
  const [textContent, setTextContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"form" | "review">("form");
  const [uploadMediaId, setUploadMediaId] = useState<number | null>(null);
  const [uploadDraft, setUploadDraft] = useState<Record<string, unknown> | null>(
    null
  );
  const [uploadSummary, setUploadSummary] = useState("");
  const [uploadPains, setUploadPains] = useState("");
  const [uploadComps, setUploadComps] = useState("");
  const [uploadSaving, setUploadSaving] = useState(false);
  const [editTarget, setEditTarget] = useState<Media | null>(null);
  const [editKind, setEditKind] = useState("call");
  const [editCustomerId, setEditCustomerId] = useState("");
  const [editTranscript, setEditTranscript] = useState("");
  const [editPains, setEditPains] = useState("");
  const [editComps, setEditComps] = useState("");
  const [editReanalyze, setEditReanalyze] = useState(false);
  const [editPhase, setEditPhase] = useState<"form" | "review">("form");
  const [editDraft, setEditDraft] = useState<Record<string, unknown> | null>(null);
  const [editSummary, setEditSummary] = useState("");
  const [editing, setEditing] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    if (initialData?.data) pageCachePut(UPLOADS_SEED_URL, initialData);
  }, [initialData]);

  const loadCustomers = useCallback(async () => {
    const cRes = await fetch("/api/customers");
    const cJson = await cRes.json();
    if (cRes.ok) {
      const rows = (cJson.data || []) as Customer[];
      setCustomers(rows);
      if (!customerId && rows[0]) {
        setCustomerId(String(rows[0].id));
      }
      return rows;
    }
    return [] as Customer[];
  }, [customerId]);

  const loadList = useCallback(
    async (opts?: {
      keyword?: string;
      kind?: string;
      status?: string;
      page?: number;
      pageSize?: number;
      force?: boolean;
    }) => {
      const keyword = opts?.keyword ?? q;
      const kind = opts?.kind ?? kindFilter;
      const status = opts?.status ?? statusFilter;
      const p = opts?.page ?? page;
      const size = opts?.pageSize ?? pageSize;
      const force = opts?.force === true;
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(size),
      });
      if (keyword) params.set("q", keyword);
      if (kind) params.set("kind", kind);
      if (status) params.set("status", status);
      const url = `/api/uploads?${params}`;
      const cached = pageCachePeek<{ data?: Media[]; meta?: PageMeta }>(url);
      if (!force && cached?.data) {
        setList(cached.data);
        if (cached.meta) setMeta(cached.meta);
        setListLoading(false);
        return;
      }
      if (cached?.data) {
        setList(cached.data);
        if (cached.meta) setMeta(cached.meta);
      }
      const soft = hasRowsRef.current || Boolean(cached?.data);
      if (!soft) setListLoading(true);
      try {
        const { res, json } = await pageCacheFetchJson<{
          data?: Media[];
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
        setListLoading(false);
      }
    },
    [page, pageSize, q, kindFilter, statusFilter, ui]
  );

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, kindFilter, statusFilter]);

  function onSearch() {
    if (page === 1) void loadList({ keyword: q, page: 1, force: true });
    else setPage(1);
  }

  async function openUpload() {
    setKind("call");
    resetCreateModal();
    setRecognizing(false);
    setOpen(true);
    const rows = customers.length ? customers : await loadCustomers();
    if (rows[0]) setCustomerId(String(rows[0].id));
  }

  async function recognizeTranscript() {
    if (!file) {
      ui.error("请先上传录音文件");
      return;
    }
    setRecognizing(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const cust = customers.find((c) => String(c.id) === customerId);
      if (cust?.name) form.set("customer_name", cust.name);
      const res = await fetch("/api/uploads/transcribe", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("语音识别失败", json.error || "请稍后重试或手动粘贴转写");
        return;
      }
      const text = String(json.data?.transcript || "").trim();
      if (!text) {
        ui.error("识别结果为空", "请换一段录音或手动粘贴转写");
        return;
      }
      setTranscript(text);
      const asrDur = Number(json.data?.duration_ms);
      if (Number.isFinite(asrDur) && asrDur > 0) {
        setDurationMs(Math.round(asrDur));
      } else if (durationMs == null) {
        const probed = await probeAudioDurationMs(file);
        if (probed) setDurationMs(probed);
      }
      ui.success("识别完成", "请在下方文本框校对后再上传解析");
    } finally {
      setRecognizing(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (uploadPhase !== "form") return;
    if (kind === "call" && !file) {
      ui.error("请上传通话录音文件");
      return;
    }
    if (kind === "call" && !transcript.trim()) {
      ui.error("请先点击「识别转写」并校对文本，或手动粘贴转写");
      return;
    }
    if (kind !== "call" && !textContent.trim()) {
      ui.error("请粘贴微信聊天内容");
      return;
    }

    const customerName = customerLabel(
      customers.find((c) => String(c.id) === customerId) || { name: customerId }
    );
    const ok = await ui.confirm({
      title: "确认上传并 AI 解析？",
      description: `将为客户「${customerName || customerId}」上传${
        kind === "call" ? "通话录音" : "微信聊天"
      }并生成痛点、竞品与待办。解析后请确认再保存。`,
      confirmText: "确认上传",
    });
    if (!ok) return;

    setLoading(true);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("customer_id", customerId);
      form.set("analyze", "1");
      if (kind === "call") {
        form.set("transcript", transcript);
        if (file) form.set("file", file);
        if (durationMs != null && durationMs > 0) {
          form.set("duration_ms", String(durationMs));
        }
      } else {
        form.set("text_content", textContent.trim());
      }

      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        ui.error("上传解析失败", json.error || "解析失败，文件未保存");
        return;
      }

      const mediaId = Number(json.data?.media?.id || 0);
      const draft =
        json.data?.draft && typeof json.data.draft === "object"
          ? json.data.draft
          : {};
      const pains = Array.isArray(draft.pain_points)
        ? draft.pain_points.map((x: unknown) => String(x || "").trim()).filter(Boolean)
        : [];
      const comps = Array.isArray(draft.competitors)
        ? draft.competitors.map((x: unknown) => String(x || "").trim()).filter(Boolean)
        : [];

      setUploadMediaId(mediaId || null);
      setUploadDraft(draft as Record<string, unknown>);
      setUploadSummary(String(draft.summary || "").trim());
      setUploadPains(pains.join("\n"));
      setUploadComps(comps.join("\n"));
      setUploadPhase("review");
      ui.success("解析完成", "请确认痛点与竞品后点保存");
    } finally {
      setLoading(false);
    }
  }

  function resetCreateModal() {
    setTranscript("");
    setTextContent("");
    setFile(null);
    setDurationMs(null);
    setUploadPhase("form");
    setUploadMediaId(null);
    setUploadDraft(null);
    setUploadSummary("");
    setUploadPains("");
    setUploadComps("");
    setUploadSaving(false);
  }

  function closeCreateModal() {
    if (loading || recognizing || uploadSaving) return;
    const mediaId = uploadMediaId;
    const pending = uploadPhase === "review" && mediaId != null;
    setOpen(false);
    resetCreateModal();
    if (pending) {
      void fetch(`/api/uploads/${mediaId}`, { method: "DELETE" }).then(() => {
        if (page === 1) void loadList({ page: 1, force: true });
        else setPage(1);
      });
    }
  }

  async function saveUploadReview() {
    if (!uploadMediaId) {
      closeCreateModal();
      return;
    }
    setUploadSaving(true);
    try {
      const res = await fetch(`/api/uploads/${uploadMediaId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            ...(uploadDraft || {}),
            summary: uploadSummary,
            pain_points: linesToList(uploadPains),
            competitors: linesToList(uploadComps),
          },
          summary: uploadSummary,
          pain_points: linesToList(uploadPains),
          competitors: linesToList(uploadComps),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      ui.success("已保存", "洞察、痛点与竞品已写入");
      setOpen(false);
      resetCreateModal();
      if (page === 1) await loadList({ page: 1, force: true });
      else setPage(1);
    } finally {
      setUploadSaving(false);
    }
  }

  async function reanalyze(m: Media) {
    const ok = await ui.confirm({
      title: "确认重新解析？",
      description: `将对「${m.file_name}」再次运行 AI 解析。解析后请确认痛点与竞品再保存。`,
      confirmText: "重新解析",
    });
    if (!ok) return;
    setEditing(true);
    try {
      const res = await fetch(`/api/uploads/${m.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("解析失败", json.error);
        return;
      }
      const draft =
        json.data?.draft && typeof json.data.draft === "object"
          ? json.data.draft
          : {};
      const pains = asStringList(draft.pain_points);
      const comps = asStringList(draft.competitors);
      setEditTarget(m);
      setEditKind(m.kind === "wechat" ? "wechat" : "call");
      setEditCustomerId(m.customer_id ? String(m.customer_id) : "");
      setEditDraft(draft as Record<string, unknown>);
      setEditSummary(String(draft.summary || "").trim());
      setEditPains(pains.join("\n"));
      setEditComps(comps.join("\n"));
      setEditReanalyze(true);
      setEditPhase("review");
      ui.success("解析完成", "请确认痛点与竞品后点保存");
    } finally {
      setEditing(false);
    }
  }

  async function deleteMedia(m: Media) {
    const ok = await ui.confirm({
      title: "确认删除解析记录？",
      description: `将永久删除「${m.file_name}」及其相关洞察，此操作不可恢复。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/uploads/${m.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) ui.error("删除失败", json.error);
    else {
      ui.success("解析记录已删除");
      await loadList({ force: true });
    }
  }

  function linesToList(text: string) {
    return text
      .split(/[\n,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  function resetEditModal() {
    setEditTarget(null);
    setEditPhase("form");
    setEditDraft(null);
    setEditSummary("");
    setEditPains("");
    setEditComps("");
    setEditReanalyze(false);
    setEditing(false);
  }

  function closeEditModal() {
    if (editing) return;
    resetEditModal();
  }

  async function openEdit(m: Media) {
    setEditTarget(m);
    setEditKind(m.kind === "wechat" ? "wechat" : "call");
    setEditCustomerId(m.customer_id ? String(m.customer_id) : "");
    setEditTranscript(m.transcript || "");
    setEditPains(asStringList(m.pain_points).join("\n"));
    setEditComps(asStringList(m.competitors).join("\n"));
    setEditReanalyze(false);
    setEditPhase("form");
    setEditDraft(null);
    setEditSummary("");
    setEditLoading(true);
    try {
      if (!customers.length) await loadCustomers();
      const res = await fetch(`/api/uploads/${m.id}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) {
        const full = json.data as Media & {
          transcript?: string;
          result_json?: { pain_points?: string[]; competitors?: string[] };
        };
        setEditTranscript(String(full.transcript || ""));
        const rj = full.result_json || {};
        const pains = asStringList(full.pain_points ?? rj.pain_points);
        const comps = asStringList(full.competitors ?? rj.competitors);
        setEditPains(pains.join("\n"));
        setEditComps(comps.join("\n"));
        if (full.kind) setEditKind(full.kind === "wechat" ? "wechat" : "call");
        if (full.customer_id != null) setEditCustomerId(String(full.customer_id));
        if (full.file_name) {
          setEditTarget((prev) =>
            prev ? { ...prev, file_name: full.file_name } : prev
          );
        }
      }
    } finally {
      setEditLoading(false);
    }
  }

  async function submitEdit() {
    if (!editTarget) return;
    if (editPhase === "review") return;
    if (!editCustomerId) {
      ui.error("请选择关联客户");
      return;
    }

    if (editReanalyze) {
      const ok = await ui.confirm({
        title: "确认重新解析？",
        description: "将按当前文本重新解析，解析后请确认痛点与竞品再保存。",
        confirmText: "开始解析",
      });
      if (!ok) return;

      setEditing(true);
      try {
        const res = await fetch(`/api/uploads/${editTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: Number(editCustomerId),
            transcript: editTranscript,
            reanalyze: true,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("解析失败", json.error);
          return;
        }
        const draft =
          json.data?.draft && typeof json.data.draft === "object"
            ? json.data.draft
            : {};
        const pains = asStringList(draft.pain_points);
        const comps = asStringList(draft.competitors);
        setEditDraft(draft as Record<string, unknown>);
        setEditSummary(String(draft.summary || "").trim());
        setEditPains(pains.join("\n"));
        setEditComps(comps.join("\n"));
        setEditPhase("review");
        ui.success("解析完成", "请确认痛点与竞品后点保存");
      } finally {
        setEditing(false);
      }
      return;
    }

    const ok = await ui.confirm({
      title: "确认保存解析记录？",
      description: "将保存对客户、文本与痛点/竞品的修改。",
      confirmText: "保存",
    });
    if (!ok) return;

    setEditing(true);
    try {
      const res = await fetch(`/api/uploads/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: Number(editCustomerId),
          transcript: editTranscript,
          pain_points: linesToList(editPains),
          competitors: linesToList(editComps),
          reanalyze: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      ui.success("解析记录已保存");
      resetEditModal();
      await loadList({ force: true });
    } finally {
      setEditing(false);
    }
  }

  async function saveEditReview() {
    if (!editTarget) {
      closeEditModal();
      return;
    }
    setEditing(true);
    try {
      const res = await fetch(`/api/uploads/${editTarget.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            ...(editDraft || {}),
            summary: editSummary,
            pain_points: linesToList(editPains),
            competitors: linesToList(editComps),
          },
          summary: editSummary,
          pain_points: linesToList(editPains),
          competitors: linesToList(editComps),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      ui.success("已保存", "洞察、痛点与竞品已写入");
      resetEditModal();
      await loadList({ force: true });
    } finally {
      setEditing(false);
    }
  }

  function customerDisplay(m: Media) {
    if (!m.customer_id) return "未关联";
    return customerLabel({
      company_name: m.customer_company_name,
      name: m.customer_name || "客户",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">解析记录</h1>
          <p className="text-sm text-[var(--color-muted)]">
            全公司通话/微信解析台账。日常请在客户详情上传；此处可筛选、重试与跳转客户。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={changeViewMode} />
          <Button onClick={openUpload}>上传并解析</Button>
        </div>
      </div>

      <CollapsibleListFilters
        activeCount={(kindFilter ? 1 : 0) + (statusFilter ? 1 : 0)}
        primary={
          <div className="w-full min-w-0 md:w-64 md:max-w-full md:shrink-0">
            <input
              className="input w-full"
              placeholder="搜索文件名 / 客户 / 上传人"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
          </div>
        }
        secondary={
          <>
            <div className="w-36 max-w-full shrink-0">
              <Select
                value={kindFilter}
                onChange={(v) => {
                  setKindFilter(v);
                  setPage(1);
                }}
                options={KIND_OPTIONS}
              />
            </div>
            <div className="w-36 max-w-full shrink-0">
              <Select
                value={statusFilter}
                onChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
                options={STATUS_OPTIONS}
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
        title={uploadPhase === "review" ? "确认解析结果" : "上传并 AI 解析"}
        description={
          uploadPhase === "review"
            ? "当前仅为预览，点「确认保存」后才会写入痛点、竞品与待办"
            : "选客户后上传通话或微信，解析后确认再保存"
        }
        onClose={closeCreateModal}
        closeOnOverlay={!loading && !recognizing && !uploadSaving && uploadPhase === "form"}
        size="lg"
        footer={
          uploadPhase === "review" ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={uploadSaving}
                onClick={closeCreateModal}
              >
                放弃
              </Button>
              <Button
                type="button"
                disabled={uploadSaving || !uploadMediaId}
                onClick={() => void saveUploadReview()}
              >
                {uploadSaving ? "保存中…" : "确认保存"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={loading || recognizing}
                onClick={closeCreateModal}
              >
                取消
              </Button>
              {kind === "call" && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!file || loading || recognizing}
                  onClick={() => void recognizeTranscript()}
                >
                  {recognizing ? "识别中…" : "识别转写"}
                </Button>
              )}
              <Button
                type="submit"
                form="upload-create-form"
                disabled={
                  loading || recognizing || (kind === "call" && !transcript.trim())
                }
              >
                {loading ? "上传解析中…" : "上传并解析"}
              </Button>
            </>
          )
        }
      >
        {uploadPhase === "review" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {uploadSummary ? (
              <div className="field sm:col-span-2">
                <label>摘要</label>
                <div className="rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-sm leading-6 text-[var(--color-text)]">
                  {uploadSummary}
                </div>
              </div>
            ) : null}
            <div className="field">
              <label>痛点（每行一条）</label>
              <textarea
                className="input textarea"
                rows={5}
                value={uploadPains}
                onChange={(e) => setUploadPains(e.target.value)}
                placeholder="例如：价格敏感"
              />
            </div>
            <div className="field">
              <label>竞品（每行一条）</label>
              <textarea
                className="input textarea"
                rows={5}
                value={uploadComps}
                onChange={(e) => setUploadComps(e.target.value)}
                placeholder="例如：某竞品名"
              />
            </div>
          </div>
        ) : (
          <form id="upload-create-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field">
              <label>类型</label>
              <Select
                value={kind}
                onChange={setKind}
                options={[
                  { value: "call", label: "通话录音" },
                  { value: "wechat", label: "微信聊天" },
                ]}
              />
            </div>
            <div className="field">
              <label>关联客户</label>
              <Select
                value={customerId}
                onChange={setCustomerId}
                options={customers.map((c) => ({
                  value: String(c.id),
                  label: customerLabel(c),
                }))}
                placeholder="选择客户"
              />
            </div>
            <div className="field sm:col-span-2">
              {kind === "call" ? (
                <>
                  <label>录音文件</label>
                  <FileDropzone
                    accept="audio/*,.mp3,.wav,.m4a,.aac"
                    value={file}
                    onFile={(f) => {
                      setFile(f);
                      setTranscript("");
                      setDurationMs(null);
                      if (f) {
                        void probeAudioDurationMs(f).then((ms) => {
                          if (ms) setDurationMs(ms);
                        });
                      }
                    }}
                    label="点击或拖入录音文件"
                    hint="支持 mp3 / wav / m4a / aac"
                  />
                </>
              ) : (
                <>
                  <label>聊天内容</label>
                  <textarea
                    className="input textarea min-h-40"
                    rows={12}
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="在微信中复制聊天记录，直接粘贴到这里…"
                  />
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    微信里长按/多选消息 → 复制 → 粘贴到上方（仅支持粘贴）
                  </p>
                </>
              )}
            </div>
            {kind === "call" ? (
              <div className="field sm:col-span-2">
                <label>
                  转写文本（请先识别或粘贴，校对后再上传）
                  {durationMs != null && durationMs > 0
                    ? ` · 时长 ${formatAudioDuration(durationMs)}`
                    : ""}
                </label>
                <textarea
                  className="input textarea"
                  rows={10}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="点击「识别转写」后文本会出现在这里，请校对销售/客户对话后再点「上传并解析」…"
                />
              </div>
            ) : null}
          </form>
        )}
      </Modal>

      {viewMode === "table" ? (
        listLoading && list.length === 0 ? (
          <TableSkeleton rows={pageSize > 10 ? 8 : pageSize} cols={8} />
        ) : (
          <div className="surface overflow-x-auto">
            <table className="w-full min-w-[68rem] text-sm">
              <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
                <tr>
                  <th className="w-14 whitespace-nowrap px-4 py-3 font-medium">序号</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">类型</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">文件名</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">时长</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">关联客户</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">痛点 / 竞品</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">上传人</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">状态</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">上传时间</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-6 text-[var(--color-muted)]">
                      暂无上传记录
                    </td>
                  </tr>
                )}
                {list.map((m, i) => (
                  <tr key={m.id} className="border-t border-[var(--color-border)]">
                    <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">
                      {pageRowNo(meta, i)}
                    </td>
                    <td className="px-4 py-3">{labelOf(MEDIA_KIND_LABELS, m.kind)}</td>
                    <td className="px-4 py-3 font-medium">{m.file_name || "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">
                      {m.kind === "call"
                        ? formatAudioDuration(m.duration_ms)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {m.customer_id ? (
                        <AppLink
                          href={`/customers/${m.customer_public_id || m.customer_id}`}
                          className="text-[var(--color-accent)] hover:underline"
                        >
                          {customerDisplay(m)}
                        </AppLink>
                      ) : (
                        <span className="text-[var(--color-muted)]">未关联</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <InsightChips
                        painPoints={m.pain_points}
                        competitors={m.competitors}
                      />
                    </td>
                    <td className="px-4 py-3">{m.uploader_name || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusTag kind="media" value={m.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--color-muted)]">
                      {new Date(m.created_at).toLocaleString("zh-CN")}
                    </td>
                    <td className="px-4 py-3">
                      <MediaRowActions
                        m={m}
                        onRename={() => void openEdit(m)}
                        onDelete={() => void deleteMedia(m)}
                        onReanalyze={() => void reanalyze(m)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {listLoading && list.length === 0 && (
            <CardListSkeleton count={4} className="col-span-full sm:grid-cols-2" />
          )}
          {list.length === 0 && !listLoading && (
            <div className="text-sm text-[var(--color-muted)]">暂无上传记录</div>
          )}
          {list.map((m) => (
              <div
                key={m.id}
                className="surface card-interactive card-stretch relative flex flex-col gap-2 p-4"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <div className="card-corner-status mt-0.5">
                    <StatusTag kind="media" value={m.status} />
                  </div>
                  <div className="min-w-0">
                    <div className="break-words font-medium">{m.file_name}</div>
                    <div className="mt-1 text-xs text-[var(--color-muted)]">
                      {labelOf(MEDIA_KIND_LABELS, m.kind)}
                      {m.kind === "call" && m.duration_ms
                        ? ` · ${formatAudioDuration(m.duration_ms)}`
                        : ""}{" "}
                      · {new Date(m.created_at).toLocaleString("zh-CN")}
                    </div>
                  </div>
                </div>
                <div className="text-sm">
                  {m.customer_id ? (
                    <AppLink
                      href={`/customers/${m.customer_public_id || m.customer_id}`}
                      className="text-[var(--color-accent)]"
                    >
                      {customerDisplay(m)}
                    </AppLink>
                  ) : (
                    <span className="text-[var(--color-muted)]">未关联客户</span>
                  )}
                  {m.uploader_name ? (
                    <span className="text-[var(--color-muted)]"> · {m.uploader_name}</span>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1">
                  <InsightChips
                    painPoints={m.pain_points}
                    competitors={m.competitors}
                  />
                </div>
                <div className="card-actions flex items-center gap-1.5">
                  <MediaRowActions
                    m={m}
                    onRename={() => void openEdit(m)}
                    onDelete={() => void deleteMedia(m)}
                    onReanalyze={() => void reanalyze(m)}
                  />
                </div>
              </div>
            ))}
        </div>
      )}

      {!listLoading && (
        <PaginationBar
          meta={meta}
          pageSize={pageSize}
          loading={listLoading}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      <Modal
        open={Boolean(editTarget)}
        title={editPhase === "review" ? "确认解析结果" : "编辑解析记录"}
        description={
          editPhase === "review"
            ? "当前仅为预览，点「确认保存」后才会写入痛点、竞品与待办"
            : "可修改客户、文本内容与痛点/竞品"
        }
        onClose={closeEditModal}
        closeOnOverlay={!editing && editPhase === "form"}
        size="lg"
        footer={
          editPhase === "review" ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={editing}
                onClick={closeEditModal}
              >
                放弃
              </Button>
              <Button
                type="button"
                disabled={editing || !editTarget}
                onClick={() => void saveEditReview()}
              >
                {editing ? "保存中…" : "确认保存"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={editing}
                onClick={closeEditModal}
              >
                取消
              </Button>
              <Button
                type="button"
                disabled={editing || editLoading || !editCustomerId}
                onClick={() => void submitEdit()}
              >
                {editing
                  ? editReanalyze
                    ? "解析中…"
                    : "保存中…"
                  : editReanalyze
                    ? "保存并重新解析"
                    : "保存"}
              </Button>
            </>
          )
        }
      >
        {editTarget && editPhase === "review" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {editSummary ? (
              <div className="field sm:col-span-2">
                <label>摘要</label>
                <div className="rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-sm leading-6 text-[var(--color-text)]">
                  {editSummary}
                </div>
              </div>
            ) : null}
            <div className="field">
              <label>痛点（每行一条）</label>
              <textarea
                className="input textarea"
                rows={5}
                value={editPains}
                onChange={(e) => setEditPains(e.target.value)}
                placeholder="例如：价格敏感"
              />
            </div>
            <div className="field">
              <label>竞品（每行一条）</label>
              <textarea
                className="input textarea"
                rows={5}
                value={editComps}
                onChange={(e) => setEditComps(e.target.value)}
                placeholder="例如：某竞品名"
              />
            </div>
          </div>
        ) : editTarget ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {editLoading && (
              <p className="sm:col-span-2 text-sm text-[var(--color-muted)]">加载详情…</p>
            )}
            <div className="field">
              <label>类型</label>
              <div className="input flex items-center bg-slate-50 text-[var(--color-muted)]">
                {labelOf(MEDIA_KIND_LABELS, editKind, editKind === "wechat" ? "微信" : "通话")}
              </div>
            </div>
            <div className="field">
              <label>关联客户</label>
              <Select
                value={editCustomerId}
                onChange={setEditCustomerId}
                options={customers.map((c) => ({
                  value: String(c.id),
                  label: customerLabel(c),
                }))}
                searchable
                placeholder="选择客户"
              />
            </div>
            {editTarget.file_name ? (
              <div className="field sm:col-span-2">
                <label>文件名</label>
                <div className="input flex items-center bg-slate-50 text-[var(--color-muted)]">
                  {editTarget.file_name}
                </div>
              </div>
            ) : null}
            <div className="field sm:col-span-2">
              <label>{editKind === "call" ? "转写文本" : "聊天文本"}</label>
              <textarea
                className="input textarea"
                rows={8}
                value={editTranscript}
                onChange={(e) => setEditTranscript(e.target.value)}
                placeholder="解析用的正文内容"
              />
            </div>
            {!editReanalyze && (
              <>
                <div className="field">
                  <label>痛点（每行一条）</label>
                  <textarea
                    className="input textarea"
                    rows={4}
                    value={editPains}
                    onChange={(e) => setEditPains(e.target.value)}
                    placeholder="例如：价格敏感"
                  />
                </div>
                <div className="field">
                  <label>竞品（每行一条）</label>
                  <textarea
                    className="input textarea"
                    rows={4}
                    value={editComps}
                    onChange={(e) => setEditComps(e.target.value)}
                    placeholder="例如：某竞品名"
                  />
                </div>
              </>
            )}
            <label className="sm:col-span-2 flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={editReanalyze}
                onChange={(e) => setEditReanalyze(e.target.checked)}
              />
              <span>
                保存后重新解析
                <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                  会先解析出痛点与竞品预览，确认后才写入；可能覆盖既有洞察
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
