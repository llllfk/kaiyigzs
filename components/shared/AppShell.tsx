"use client";

import { AppLink } from "@/components/ui/AppLink";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useAppRouter } from "@/hooks/useAppRouter";
import { pageCacheInvalidate, prefetchNavPaths } from "@/lib/page-cache";
import {
  SessionUserProvider,
  useSessionUser,
} from "@/components/shared/SessionUserContext";
import { ROLE_LABELS, type SessionUser } from "@/types";

type NavLeaf = { href: string; label: string };

const UNREAD_TTL_MS = 60_000;
let unreadCache: { count: number; at: number } | null = null;
let unreadRequest: Promise<number | null> | null = null;

type NavEntry =
  | { type: "link"; href: string; label: string }
  | { type: "group"; id: string; label: string; children: NavLeaf[] };

function pathActive(pathname: string, href: string) {
  if (pathname === href) return true;
  // /platform 是独立页面，不能把 /platform/voices 等子路径算作它的激活态
  if (href === "/platform") return false;
  return pathname.startsWith(href + "/");
}

function navFor(user: SessionUser): NavEntry[] {
  const acting = Boolean(user.act_as_company_id);
  if (user.role === "super_admin" && !acting) {
    return [
      {
        type: "group",
        id: "platform",
        label: "平台",
        children: [
          { href: "/platform", label: "平台概况" },
          { href: "/companies", label: "公司管理" },
          { href: "/platform/voices", label: "音色管理" },
        ],
      },
      {
        type: "group",
        id: "system",
        label: "系统",
        children: [
          { href: "/audit", label: "审计日志" },
          { href: "/settings", label: "设置" },
        ],
      },
    ];
  }

  const entries: NavEntry[] = [
    { type: "link", href: "/dashboard", label: "工作台" },
    {
      type: "group",
      id: "customers",
      label: "客户",
      children: [
        { href: "/customers", label: "客户" },
        { href: "/pool", label: "公海" },
      ],
    },
    {
      type: "group",
      id: "sales",
      label: "销售",
      children: [
        { href: "/opportunities", label: "商机" },
        { href: "/quotes", label: "报价" },
        { href: "/tasks", label: "待办" },
      ],
    },
    {
      type: "group",
      id: "insights",
      label: "洞察",
      children: [
        { href: "/knowledge", label: "知识库" },
        { href: "/competitors", label: "竞品" },
        { href: "/insights", label: "分析" },
        { href: "/reports", label: "经营报表" },
        { href: "/uploads", label: "解析记录" },
        { href: "/voices/records", label: "声音合成" },
      ],
    },
  ];

  const collab: NavLeaf[] = [{ href: "/notifications", label: "通知" }];
  if (
    user.role === "company_admin" ||
    user.role === "sales_manager" ||
    acting
  ) {
    collab.push({ href: "/team", label: "团队" });
  }
  entries.push({ type: "group", id: "collab", label: "协作", children: collab });

  const system: NavLeaf[] = [];
  if (user.role === "company_admin" || acting) {
    system.push({ href: "/audit", label: "审计" });
  }
  system.push({ href: "/settings", label: "设置" });
  entries.push({ type: "group", id: "system", label: "系统", children: system });

  return entries;
}

function groupContainsPath(group: Extract<NavEntry, { type: "group" }>, pathname: string) {
  return group.children.some((c) => pathActive(pathname, c.href));
}

function NavIcon({ name }: { name: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    "aria-hidden": true as const,
    className: "shrink-0",
  };
  switch (name) {
    case "dashboard":
      return (
        <svg {...common}>
          <path
            d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "customers":
      return (
        <svg {...common}>
          <path
            d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M22 21v-2a3.5 3.5 0 0 0-2.5-3.35M16.5 3.7a3.5 3.5 0 0 1 0 6.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "sales":
      return (
        <svg {...common}>
          <path
            d="M4 19V5M4 19h16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M7 15v-3M11 15V8M15 15v-5M19 15V6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "insights":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M16 16l4.5 4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "collab":
      return (
        <svg {...common}>
          <path
            d="M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M3.5 19a4.5 4.5 0 0 1 9 0M11.5 19a4.5 4.5 0 0 1 9 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "system":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "platform":
      return (
        <svg {...common}>
          <rect
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path d="M3.5 9h17M9 9v11" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
  }
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn(
        "shrink-0 opacity-90 transition-transform duration-150",
        expanded ? "rotate-0" : "-rotate-90"
      )}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserMenu() {
  const user = useSessionUser();
  const router = useAppRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = (user.name || user.phone || user.email || "?").slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function logout() {
    setOpen(false);
    pageCacheInvalidate();
    // 最多等 600ms：会话已在服务端优先清除，超时也直接进登录页
    try {
      await Promise.race([
        fetch("/api/auth/logout", { method: "POST", keepalive: true }),
        new Promise<void>((resolve) => window.setTimeout(resolve, 600)),
      ]);
    } catch {
      /* ignore */
    }
    window.location.assign("/login");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex max-w-[220px] items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-left transition",
          "hover:border-[var(--color-accent)]/40 hover:bg-slate-50",
          open && "border-[var(--color-accent)]/50 bg-slate-50"
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-sidebar)] text-sm font-semibold text-white">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--color-text)]">
            {user.name}
          </span>
          <span className="block truncate text-[11px] text-[var(--color-muted)]">
            {ROLE_LABELS[user.role]}
          </span>
        </span>
        <span
          className={cn(
            "text-[10px] text-[var(--color-muted)] transition-transform",
            open && "rotate-180"
          )}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-64 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow)]"
        >
          <div className="border-b border-[var(--color-border)] px-3 py-3">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
              {user.phone || user.email || "—"}
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-accent)]">
              {ROLE_LABELS[user.role]}
            </div>
          </div>
          <div className="p-1.5">
            <AppLink
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-10 w-full items-center rounded-lg px-3 text-sm text-[var(--color-text)] hover:bg-slate-50"
            >
              个人设置
            </AppLink>
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="flex min-h-10 w-full items-center rounded-lg px-3 text-sm text-[var(--color-danger)] hover:bg-red-50"
            >
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function useSidebarOpenMap() {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  const toggleGroup = useCallback((id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: prev[id] !== true }));
  }, []);

  return { openMap, toggleGroup };
}

function SideNav({
  entries,
  pathname,
  openMap,
  onToggleGroup,
  onNavigate,
  onPrefetchGroup,
}: {
  entries: NavEntry[];
  pathname: string;
  openMap: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
  onNavigate?: () => void;
  onPrefetchGroup?: (hrefs: string[]) => void;
}) {
  return (
    <nav className="flex flex-col gap-3 p-3">
      {entries.map((entry) => {
        if (entry.type === "link") {
          const active = pathActive(pathname, entry.href);
          return (
            <AppLink
              key={entry.href}
              href={entry.href}
              onClick={onNavigate}
              className={cn(
                "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/90",
                "hover:bg-[var(--color-sidebar-hover)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70",
                active && "bg-[var(--color-sidebar-hover)] text-white"
              )}
            >
              <NavIcon name="dashboard" />
              <span>{entry.label}</span>
            </AppLink>
          );
        }

        const expanded = openMap[entry.id] === true;
        const groupActive = groupContainsPath(entry, pathname);

        return (
          <div key={entry.id} className="space-y-1">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => {
                if (!expanded) {
                  onPrefetchGroup?.(entry.children.map((c) => c.href));
                }
                onToggleGroup(entry.id);
              }}
              className={cn(
                "flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left",
                "text-[12px] font-bold tracking-wide",
                groupActive ? "text-white" : "text-white/85",
                "hover:bg-white/10 hover:text-white",
                "focus-visible:outline-none focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky-300/70"
              )}
            >
              <NavIcon name={entry.id} />
              <span className="min-w-0 flex-1">{entry.label}</span>
              <ChevronIcon expanded={expanded} />
            </button>
            {expanded ? (
              <div className="ml-2 space-y-0.5 border-l border-white/15 pl-2.5">
                {entry.children.map((item) => {
                  const active = pathActive(pathname, item.href);
                  return (
                    <AppLink
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "block min-h-10 w-full rounded-lg px-3 py-2 text-sm font-medium",
                        "text-white/55 hover:bg-[var(--color-sidebar-hover)] hover:text-white/85",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60",
                        active &&
                          "bg-[var(--color-sidebar-hover)] font-semibold text-white shadow-sm"
                      )}
                    >
                      {item.label}
                    </AppLink>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({
  user,
  unread = 0,
  children,
}: {
  user: SessionUser;
  unread?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useAppRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [unreadCount, setUnreadCount] = useState(unread);
  const acting = Boolean(user.act_as_company_id);
  const showCompanyChrome = user.role !== "super_admin" || acting;
  const entries = useMemo(
    () => navFor(user),
    // 只用权限相关字段，避免 user 引用变化导致菜单强制重开
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.role, user.act_as_company_id, user.company_id, user.id]
  );
  const { openMap, toggleGroup } = useSidebarOpenMap();
  const showBack = pathname.split("/").filter(Boolean).length >= 2;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    function onViewport() {
      if (mq.matches) setMobileOpen(false);
    }
    onViewport();
    mq.addEventListener("change", onViewport);
    return () => mq.removeEventListener("change", onViewport);
  }, []);

  useEffect(() => {
    setUnreadCount(unread);
  }, [unread]);

  // 展开菜单表示存在导航意图，但限制预取数量，避免形成请求风暴。
  const prefetchGroup = useCallback(
    (hrefs: string[]) => prefetchNavPaths(router, hrefs.slice(0, 2)),
    [router]
  );

  const refreshUnread = useCallback(async (force = false) => {
    if (!force && unreadCache && Date.now() - unreadCache.at < UNREAD_TTL_MS) {
      setUnreadCount(unreadCache.count);
      return;
    }
    try {
      unreadRequest ??= fetch("/api/notifications?page=1&pageSize=1&unread=1")
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          return res.ok && typeof json.meta?.total === "number"
            ? Number(json.meta.total)
            : null;
        })
        .catch(() => null)
        .finally(() => {
          unreadRequest = null;
        });
      const count = await unreadRequest;
      if (count != null) {
        unreadCache = { count, at: Date.now() };
        setUnreadCount(count);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshUnread();
    function onChanged() {
      unreadCache = null;
      void refreshUnread(true);
    }
    window.addEventListener("crm:notifications-changed", onChanged);
    function onVisible() {
      if (document.visibilityState === "visible") void refreshUnread();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("crm:notifications-changed", onChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshUnread]);

  async function exitCompanyView() {
    setExiting(true);
    try {
      const res = await fetch("/api/auth/company-view", { method: "DELETE" });
      if (!res.ok) return;
      router.replace("/companies");
      router.refresh();
    } finally {
      setExiting(false);
    }
  }

  const navProps = {
    entries,
    pathname,
    openMap,
    onToggleGroup: toggleGroup,
    onPrefetchGroup: prefetchGroup,
  };

  return (
    <SessionUserProvider initialUser={user}>
    <div className="min-h-screen md:flex">
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-20 md:flex md:w-52 md:flex-col md:overflow-hidden bg-[var(--color-sidebar)] text-white">
        <div className="shrink-0 px-4 py-5 border-b border-white/10">
          <div className="text-lg font-bold tracking-tight">凯艺销售CRM</div>
          <div className="mt-1 text-xs text-white/60">销售客户关系管理</div>
        </div>
        <div className="sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-0">
          <SideNav {...navProps} />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="关闭菜单"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col overflow-hidden bg-[var(--color-sidebar)] text-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-5">
              <div>
                <div className="text-lg font-bold">凯艺销售CRM</div>
                <div className="text-xs text-white/60">销售客户关系管理</div>
              </div>
              <Button variant="ghost" onClick={() => setMobileOpen(false)}>
                关闭
              </Button>
            </div>
            <div className="sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <SideNav {...navProps} onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col md:pl-52">
        {acting && (
          <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            <span>
              正在以公司管理员视角查看「{user.act_as_company_name || "该公司"}」的业务数据
            </span>
            <Button
              variant="secondary"
              className="min-h-8 px-3 text-xs"
              disabled={exiting}
              onClick={() => void exitCompanyView()}
            >
              {exiting ? "退出中…" : "退出公司视图"}
            </Button>
          </div>
        )}
        <header
          className={cn(
            "sticky z-30 flex min-h-14 items-center gap-3 border-b border-[var(--color-border)] bg-white/95 px-4 backdrop-blur",
            acting ? "top-10" : "top-0"
          )}
        >
          <div className="md:hidden">
            <button
              type="button"
              className="btn btn-secondary min-h-9 px-3"
              aria-expanded={mobileOpen}
              aria-label="菜单"
              onClick={() => setMobileOpen(true)}
            >
              菜单
            </button>
          </div>
          {showBack && (
            <Button
              type="button"
              variant="secondary"
              className="min-h-9 px-3"
              onClick={() => router.back()}
            >
              返回
            </Button>
          )}
          <div className="flex-1" />
          <AppLink href="/notifications" className="btn btn-secondary min-h-9 relative">
            通知
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </AppLink>
          <UserMenu />
        </header>
        <main
          className={cn(
            "flex-1 p-4 md:p-6",
            showCompanyChrome && "pb-24 md:pb-6"
          )}
        >
          {children}
        </main>
      </div>

      {showCompanyChrome && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex min-h-14 border-t border-[var(--color-border)] bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          {[
            { href: "/dashboard", label: "工作台" },
            { href: "/customers", label: "客户" },
            { href: "/pool", label: "公海" },
            { href: "/tasks", label: "待办" },
            { href: "/notifications", label: "通知" },
          ].map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <AppLink
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center min-h-14 text-xs",
                  active ? "text-[var(--color-accent)] font-semibold" : "text-[var(--color-muted)]"
                )}
              >
                {item.label}
              </AppLink>
            );
          })}
        </nav>
      )}
    </div>
    </SessionUserProvider>
  );
}
