import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-slate-200/80",
        className
      )}
    />
  );
}

export function PageHeaderSkeleton({ withAction = true }: { withAction?: boolean }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
      {withAction && <Skeleton className="h-10 w-28" />}
    </div>
  );
}

export function TableSkeleton({
  rows = 6,
  cols = 6,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="surface hidden overflow-x-auto md:block">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <Skeleton className="h-3.5 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-t border-[var(--color-border)]">
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-4 py-3.5">
                  <Skeleton
                    className={cn(
                      "h-4",
                      c === 0 ? "w-8" : c === 1 ? "w-28" : "w-20"
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CardListSkeleton({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-40 max-w-full" />
              <Skeleton className="h-3.5 w-56 max-w-full" />
            </div>
            <Skeleton className="h-6 w-14 shrink-0 rounded-full" />
          </div>
          <Skeleton className="h-3 w-[75%] max-w-full" />
        </div>
      ))}
    </div>
  );
}

export function ListRowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="surface flex items-center justify-between gap-3 p-4"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-48 max-w-full" />
            <Skeleton className="h-3.5 w-36 max-w-full" />
          </div>
          <Skeleton className="h-9 w-16 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/** Customer / company detail — mirrors hero + workbench layout */
export function DetailPageSkeleton() {
  return (
    <div className="space-y-4" aria-busy aria-label="加载中">
      <header className="customer-hero space-y-5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-48 max-w-full" />
              <Skeleton className="h-6 w-14 rounded-full" />
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-border)]/80 pt-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
        <div className="space-y-3 border-t border-[var(--color-border)]/80 pt-4">
          <Skeleton className="h-3 w-16" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-14 w-20" />
            <Skeleton className="h-14 w-20" />
            <Skeleton className="h-14 w-24" />
          </div>
          <Skeleton className="h-12 w-full" />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <section className="surface space-y-3 p-4 sm:p-5">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </section>
          <section className="surface space-y-3 p-4 sm:p-5">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </section>
        </div>
        <section className="surface min-h-[20rem] space-y-3 p-4 sm:p-5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-full min-h-[16rem] w-full" />
        </section>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="加载中">
      <div className="space-y-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface space-y-3 p-4">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <section key={i} className="surface space-y-3 p-4 md:p-5">
            <Skeleton className="h-5 w-24" />
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-14" />
                <Skeleton className="h-2 flex-1" />
                <Skeleton className="h-3.5 w-6" />
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

/** Generic portal page skeleton for route `loading.tsx` */
export function PortalPageSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="加载中">
      <PageHeaderSkeleton />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-10 w-20" />
      </div>
      <TableSkeleton rows={8} cols={6} />
      <CardListSkeleton count={4} className="md:hidden" />
    </div>
  );
}

export function InsightsSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="加载中">
      <div className="space-y-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <section key={i} className="surface space-y-3 p-4 md:p-5">
            <Skeleton className="h-5 w-24" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-2 flex-1" />
                <Skeleton className="h-3.5 w-8" />
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

/** 知识库：目录 + 文件 + 问答三栏 */
export function KnowledgeSkeleton() {
  return (
    <div
      className="flex flex-col gap-4 xl:h-[calc(100dvh-6.5rem)]"
      aria-busy
      aria-label="加载中"
    >
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_22rem]">
        <section className="surface space-y-3 p-4">
          <Skeleton className="h-5 w-16" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </section>
        <section className="surface space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-9 w-20" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-3"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-32 max-w-full" />
              </div>
              <Skeleton className="h-8 w-16 shrink-0" />
            </div>
          ))}
        </section>
        <section className="surface flex flex-col gap-3 p-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="min-h-[12rem] flex-1 w-full" />
          <Skeleton className="h-10 w-full" />
        </section>
      </div>
    </div>
  );
}
