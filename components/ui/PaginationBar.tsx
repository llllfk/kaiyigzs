"use client";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { PAGE_SIZE_OPTIONS, type PageMeta } from "@/lib/pagination";

type Props = {
  meta: PageMeta;
  pageSize: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

function ChevronLeftIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M15 6 9 12l6 6"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PaginationBar({
  meta,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  const summary =
    meta.total > 0 ? `第 ${from}-${to} 条，共 ${meta.total} 条` : "共 0 条";
  const prevDisabled = loading || meta.page <= 1;
  const nextDisabled = loading || meta.page >= meta.totalPages;

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted)] sm:flex-none sm:text-sm">
        {summary}
      </span>
      <div className="w-[6.75rem] shrink-0 sm:w-32">
        <Select
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v) || 10)}
          options={[...PAGE_SIZE_OPTIONS]}
          placement="up"
        />
      </div>
      <Button
        variant="secondary"
        className="h-10 w-10 shrink-0 px-0"
        disabled={prevDisabled}
        aria-label="上一页"
        title="上一页"
        onClick={() => onPageChange(Math.max(1, meta.page - 1))}
      >
        <ChevronLeftIcon />
      </Button>
      <span className="shrink-0 min-w-[3rem] text-center text-sm tabular-nums sm:min-w-20">
        {meta.page} / {meta.totalPages}
      </span>
      <Button
        variant="secondary"
        className="h-10 w-10 shrink-0 px-0"
        disabled={nextDisabled}
        aria-label="下一页"
        title="下一页"
        onClick={() => onPageChange(Math.min(meta.totalPages, meta.page + 1))}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
