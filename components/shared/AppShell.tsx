"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { ROLE_LABELS, type SessionUser } from "@/types";

type NavItem = { href: string; label: string };

function navFor(user: SessionUser): NavItem[] {
  if (user.role === "super_admin") {
    return [
      { href: "/platform", label: "平台概况" },
      { href: "/companies", label: "公司管理" },
      { href: "/audit", label: "审计日志" },
      { href: "/settings", label: "设置" },
    ];
  }

  const base: NavItem[] = [
    { href: "/dashboard", label: "工作台" },
    { href: "/customers", label: "客户" },
    { href: "/opportunities", label: "商机" },
    { href: "/tasks", label: "待办" },
    { href: "/knowledge", label: "知识库" },
    { href: "/competitors", label: "竞品" },
    { href: "/insights", label: "分析" },
    { href: "/uploads", label: "上传解析" },
    { href: "/notifications", label: "通知" },
  ];

  if (user.role === "company_admin" || user.role === "sales_manager") {
    base.push({ href: "/team", label: "团队" });
  }
  if (user.role === "company_admin") {
    base.push({ href: "/audit", label: "审计" });
  }
  base.push({ href: "/settings", label: "设置" });
  return base;
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = navFor(user);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-white/85 hover:bg-[var(--color-sidebar-hover)]",
              active && "bg-[var(--color-sidebar-hover)] text-white"
            )}
          >
            {item.label}
            {item.href === "/notifications" && unread > 0 && (
              <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1.5 text-xs">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col bg-[var(--color-sidebar)] text-white">
        <div className="px-4 py-5 border-b border-white/10">
          <div className="text-lg font-bold tracking-tight">凯艺销售CRM</div>
          <div className="mt-1 text-xs text-white/60">{ROLE_LABELS[user.role]}</div>
        </div>
        <ScrollArea className="flex-1">{nav}</ScrollArea>
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 truncate px-2 text-sm text-white/80">{user.name}</div>
          <Button variant="ghost" className="w-full justify-start" onClick={logout}>
            退出登录
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="关闭菜单"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-72 bg-[var(--color-sidebar)] text-white shadow-xl">
            <div className="px-4 py-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <div className="text-lg font-bold">凯艺销售CRM</div>
                <div className="text-xs text-white/60">{ROLE_LABELS[user.role]}</div>
              </div>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                关闭
              </Button>
            </div>
            <ScrollArea className="h-[calc(100%-8rem)]">{nav}</ScrollArea>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-[var(--color-border)] bg-white/95 px-4 backdrop-blur">
          <button
            type="button"
            className="btn btn-secondary md:hidden min-h-10 px-3"
            onClick={() => setOpen(true)}
          >
            菜单
          </button>
          <div className="flex-1 text-sm text-[var(--color-muted)] truncate">
            {user.email}
          </div>
          <Link href="/notifications" className="btn btn-secondary min-h-10 relative">
            通知
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] text-white">
                {unread}
              </span>
            )}
          </Link>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>

      {/* Mobile bottom nav (core) */}
      {user.role !== "super_admin" && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[var(--color-border)] bg-white md:hidden">
          {[
            { href: "/dashboard", label: "工作台" },
            { href: "/customers", label: "客户" },
            { href: "/tasks", label: "待办" },
            { href: "/knowledge", label: "知识库" },
            { href: "/notifications", label: "通知" },
          ].map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center min-h-14 text-xs",
                  active ? "text-[var(--color-accent)] font-semibold" : "text-[var(--color-muted)]"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
