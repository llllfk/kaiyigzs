"use client";

import { useCallback, useEffect, useState } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useUi } from "@/components/ui/Feedback";
import { ListRowsSkeleton } from "@/components/ui/Skeleton";
import { useAppRouter } from "@/hooks/useAppRouter";
import { EMPTY_PAGE_META, type PageMeta } from "@/lib/pagination";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";

type Notice = {
  id: number;
  type?: string | null;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const FILTER_OPTIONS = [
  { value: "", label: "全部" },
  { value: "unread", label: "未读" },
];

const TYPE_META: Record<
  string,
  { label: string; tone: string; icon: "spark" | "task" | "pool" | "stage" | "kb" | "user" | "review" | "bell" }
> = {
  ai_done: { label: "解析", tone: "bg-sky-50 text-sky-700 ring-sky-600/15", icon: "spark" },
  task: { label: "待办", tone: "bg-amber-50 text-amber-800 ring-amber-600/15", icon: "task" },
  pool: { label: "公海", tone: "bg-violet-50 text-violet-700 ring-violet-600/15", icon: "pool" },
  stage_suggestion: {
    label: "商机",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    icon: "stage",
  },
  review: { label: "复盘", tone: "bg-slate-100 text-slate-700 ring-slate-500/15", icon: "review" },
  kb: { label: "知识库", tone: "bg-indigo-50 text-indigo-700 ring-indigo-600/15", icon: "kb" },
  account: { label: "账号", tone: "bg-slate-100 text-slate-700 ring-slate-500/15", icon: "user" },
  quote: { label: "报价", tone: "bg-amber-50 text-amber-800 ring-amber-600/15", icon: "review" },
};

function typeMeta(type?: string | null) {
  if (type && TYPE_META[type]) return TYPE_META[type];
  return {
    label: "通知",
    tone: "bg-slate-100 text-slate-600 ring-slate-500/15",
    icon: "bell" as const,
  };
}

function TypeIcon({ name }: { name: (typeof TYPE_META)[string]["icon"] | "bell" }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    "aria-hidden": true as const,
  };
  switch (name) {
    case "spark":
      return (
        <svg {...common}>
          <path
            d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "task":
      return (
        <svg {...common}>
          <path
            d="M9 6h11M9 12h11M9 18h11M4.5 6.5l1 1 2-2M4.5 12.5l1 1 2-2M4.5 18.5l1 1 2-2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "pool":
      return (
        <svg {...common}>
          <path
            d="M4 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2M4 19c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M12 4v7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "stage":
      return (
        <svg {...common}>
          <path
            d="M4 19h16M7 19V9h3v10M14 19V5h3v14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "kb":
      return (
        <svg {...common}>
          <path
            d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M8 7h8M8 11h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <path
            d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "review":
      return (
        <svg {...common}>
          <path
            d="M8 7h8M8 12h8M8 17h5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path
            d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
  }
}

export default function NotificationsPage() {
  const ui = useUi();
  const router = useAppRouter();
  const [list, setList] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_PAGE_META);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (filter === "unread") params.set("unread", "1");
      const res = await fetch(`/api/notifications?${params}`);
      const json = await res.json();
      if (res.ok) {
        setList(json.data || []);
        if (json.meta) {
          setMeta(json.meta);
          if (json.meta.page !== page) setPage(json.meta.page);
        }
      } else ui.error("加载通知失败", json.error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filter, ui]);

  useEffect(() => {
    load();
  }, [load]);

  async function markAll() {
    const ok = await ui.confirm({
      title: "全部标为已读？",
      description: "将把所有未读通知标记为已读。",
      confirmText: "全部已读",
    });
    if (!ok) return;
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) ui.error("操作失败", json.error);
    else {
      ui.success("已全部标为已读");
      window.dispatchEvent(new Event("crm:notifications-changed"));
      router.refresh();
      await load();
    }
  }

  async function markOne(id: number, silent = false) {
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (!silent) ui.error("标记失败", json.error);
      return false;
    }
    if (!silent) ui.success("已标为已读");
    window.dispatchEvent(new Event("crm:notifications-changed"));
    router.refresh();
    await load();
    return true;
  }

  async function openNotice(n: Notice) {
    if (!n.link) return;
    if (!n.read_at) await markOne(n.id, true);
    router.push(n.link);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">通知</h1>
          <p className="text-sm text-[var(--color-muted)]">站内通知中心</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-28">
            <Select
              value={filter}
              onChange={(v) => {
                setFilter(v);
                setPage(1);
              }}
              options={FILTER_OPTIONS}
            />
          </div>
          <Button variant="secondary" onClick={() => void markAll()}>
            全部已读
          </Button>
        </div>
      </div>

      {loading ? (
        <ListRowsSkeleton count={5} />
      ) : (
        <ul className="space-y-2">
          {list.map((n) => {
            const unread = !n.read_at;
            const meta = typeMeta(n.type);
            const fullTime = formatDateTime(n.created_at);
            return (
              <li
                key={n.id}
                className={cn(
                  "surface card-interactive relative overflow-hidden p-4",
                  unread ? "border-sky-200 bg-sky-50/30" : "opacity-90"
                )}
              >
                {unread && (
                  <span
                    className="absolute inset-y-0 left-0 w-1 bg-[var(--color-accent)]"
                    aria-hidden
                  />
                )}
                <div className="flex items-start gap-3 pl-1">
                  <div
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                      meta.tone
                    )}
                    title={meta.label}
                  >
                    <TypeIcon name={meta.icon} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="card-corner-status">
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                            meta.tone
                          )}
                        >
                          {meta.label}
                        </span>
                      </div>
                      {unread && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
                          aria-label="未读"
                        />
                      )}
                      {n.link ? (
                        <button
                          type="button"
                          className={cn(
                            "text-link min-w-0 text-left text-sm font-medium",
                            !unread && "opacity-80"
                          )}
                          onClick={() => void openNotice(n)}
                        >
                          {n.title}
                        </button>
                      ) : (
                        <span
                          className={cn(
                            "min-w-0 text-sm font-medium",
                            !unread && "text-[var(--color-muted)]"
                          )}
                        >
                          {n.title}
                        </span>
                      )}
                    </div>
                    {n.body && (
                      <div
                        className={cn(
                          "mt-1 text-sm",
                          unread ? "text-[var(--color-text)]/80" : "text-[var(--color-muted)]"
                        )}
                      >
                        {n.body}
                      </div>
                    )}
                    <div className="mt-1.5 text-xs text-[var(--color-muted)]" title={fullTime}>
                      {formatRelativeTime(n.created_at)}
                    </div>
                  </div>
                </div>
                  <div className="card-actions flex shrink-0 gap-2">
                    {unread && (
                      <Button variant="secondary" onClick={() => void markOne(n.id)}>
                        已读
                      </Button>
                    )}
                    {n.link && (
                      <AppLink
                        href={n.link}
                        className="btn btn-primary"
                        onClick={() => {
                          if (unread) void markOne(n.id, true);
                        }}
                      >
                        查看
                      </AppLink>
                    )}
                  </div>
              </li>
            );
          })}
          {list.length === 0 && (
            <li className="rounded-lg border border-dashed border-[var(--color-border)] px-4 py-10 text-center text-sm text-[var(--color-muted)]">
              {filter === "unread" ? "没有未读通知" : "暂无通知"}
            </li>
          )}
        </ul>
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
    </div>
  );
}
