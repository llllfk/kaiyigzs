"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { stashListFilters, type ListNavFilters } from "@/lib/nav-filters";
import { prefetchNavPath } from "@/lib/page-cache";
import { cn } from "@/lib/utils";

type AppLinkProps = {
  href: string;
  replace?: boolean;
  role?: React.AriaRole;
  className?: string;
  children?: React.ReactNode;
  /** 跳转前写入 sessionStorage，目标页 take 后应用；不会出现在地址栏 */
  navFilters?: ListNavFilters;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLAnchorElement>) => void;
  onPointerDown?: (e: React.PointerEvent<HTMLAnchorElement>) => void;
};

/**
 * 站内链接：Next Link 预取 + 列表接口预热，交给 App Router 正常跳转。
 */
export function AppLink({
  href,
  className,
  children,
  replace,
  role,
  navFilters,
  onClick,
  onMouseEnter,
  onFocus,
  onPointerDown,
}: AppLinkProps) {
  const router = useRouter();

  return (
    <Link
      href={href}
      replace={replace}
      role={role}
      prefetch={false}
      className={cn(
        "cursor-pointer text-inherit no-underline outline-none",
        className
      )}
      onMouseEnter={(e) => {
        prefetchNavPath(router, href);
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        prefetchNavPath(router, href);
        onFocus?.(e);
      }}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        try {
          if (navFilters) stashListFilters(href, navFilters);
        } catch {
          /* ignore */
        }
      }}
    >
      {children}
    </Link>
  );
}
