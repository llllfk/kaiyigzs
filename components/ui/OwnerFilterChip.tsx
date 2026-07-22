/** 负责人筛选标签（由 URL owner_id 驱动，可一键清除） */
export function OwnerFilterChip({
  ownerId,
  ownerName,
  onClear,
}: {
  ownerId: number | null;
  ownerName?: string | null;
  onClear: () => void;
}) {
  if (ownerId == null) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-sm text-sky-800 ring-1 ring-sky-200/80">
      <span className="truncate">
        负责人：{ownerName?.trim() || `#${ownerId}`}
      </span>
      <button
        type="button"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-sky-600 hover:bg-sky-100"
        aria-label="清除负责人筛选"
        title="清除"
        onClick={onClear}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 6l12 12M18 6 6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}
