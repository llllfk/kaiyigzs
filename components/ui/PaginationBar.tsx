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

export function PaginationBar({
  meta,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-sm text-[var(--color-muted)]">
        {meta.total > 0 ? `第 ${from}-${to} 条，共 ${meta.total} 条` : "共 0 条"}
      </span>
      <div className="w-32">
        <Select
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v) || 10)}
          options={[...PAGE_SIZE_OPTIONS]}
          placement="up"
        />
      </div>
      <Button
        variant="secondary"
        className="min-h-9 px-3"
        disabled={loading || meta.page <= 1}
        onClick={() => onPageChange(Math.max(1, meta.page - 1))}
      >
        上一页
      </Button>
      <span className="min-w-20 text-center text-sm tabular-nums">
        {meta.page} / {meta.totalPages}
      </span>
      <Button
        variant="secondary"
        className="min-h-9 px-3"
        disabled={loading || meta.page >= meta.totalPages}
        onClick={() => onPageChange(Math.min(meta.totalPages, meta.page + 1))}
      >
        下一页
      </Button>
    </div>
  );
}
