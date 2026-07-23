"use client";

import { AppLink } from "@/components/ui/AppLink";
import { FeatureGridIcon } from "@/components/nav/FeatureGridIcon";
import { useSessionUser } from "@/components/shared/SessionUserContext";
import { compactExtraNavLinks } from "@/lib/portal-nav";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

export default function AppsPage() {
  const user = useSessionUser();
  const pathname = usePathname();
  const links = useMemo(() => compactExtraNavLinks(user), [user]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">功能</h1>
        <p className="text-sm text-[var(--color-muted)]">
          按你的权限显示全部快捷入口
        </p>
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">暂无可用功能</p>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {links.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <AppLink
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-2 py-4 text-center transition",
                  "hover:border-[var(--color-accent)]/35 hover:bg-slate-50",
                  active && "border-[var(--color-accent)]/40 bg-sky-50"
                )}
              >
                <span
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-[var(--color-text)]",
                    active && "bg-sky-100 text-[var(--color-accent)]"
                  )}
                >
                  <FeatureGridIcon href={item.href} />
                </span>
                <span
                  className={cn(
                    "line-clamp-2 text-xs font-medium leading-snug text-[var(--color-text)]",
                    active && "text-[var(--color-accent)]"
                  )}
                >
                  {item.label}
                </span>
              </AppLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
