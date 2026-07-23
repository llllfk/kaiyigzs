"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 手机：默认只显示 primary（通常是搜索框），其余筛选项收进「展开筛选」。
 * 电脑：primary + secondary 同一行换行展示。
 */
export function CollapsibleListFilters({
  primary,
  secondary,
  activeCount = 0,
  className,
}: {
  primary: ReactNode;
  secondary: ReactNode;
  /** 次要筛选项已生效数量，用于按钮角标，并在从 0→有值时自动展开 */
  activeCount?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const prevCount = useRef(activeCount);

  useEffect(() => {
    if (activeCount > 0 && prevCount.current === 0) setOpen(true);
    prevCount.current = activeCount;
  }, [activeCount]);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex w-full min-w-0 items-center gap-2 md:contents">
        <div className="min-w-0 flex-1 md:contents">{primary}</div>
        <button
          type="button"
          className="btn btn-secondary shrink-0 px-3 text-sm md:hidden"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open
            ? "收起筛选"
            : activeCount > 0
              ? `展开筛选 (${activeCount})`
              : "展开筛选"}
        </button>
      </div>
      <div
        className={cn(
          open ? "flex w-full flex-wrap items-center gap-2" : "hidden",
          "md:contents"
        )}
      >
        {secondary}
      </div>
    </div>
  );
}
