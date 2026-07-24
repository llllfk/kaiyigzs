export const PAGE_SIZE_OPTIONS = [
  { value: "10", label: "10 条/页" },
  { value: "20", label: "20 条/页" },
  { value: "50", label: "50 条/页" },
];

export const PAGE_SIZES = new Set([10, 20, 50]);

export type PageMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const EMPTY_PAGE_META: PageMeta = {
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

/** Parse page/pageSize; when either is present (or always=true), pagination is enabled. */
export function parsePageParams(
  sp: URLSearchParams,
  opts?: { defaultSize?: number; always?: boolean }
) {
  const always = opts?.always ?? false;
  const paginate = always || sp.has("page") || sp.has("pageSize");
  const page = Math.max(1, Number(sp.get("page") || 1) || 1);
  const rawSize = Number(sp.get("pageSize") || opts?.defaultSize || 10);
  const pageSize = PAGE_SIZES.has(rawSize) ? rawSize : opts?.defaultSize || 10;
  return { paginate, page, pageSize };
}

export function resolvePagination(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;
  return {
    meta: {
      total,
      page: safePage,
      pageSize,
      totalPages,
    } satisfies PageMeta,
    offset,
    limit: pageSize,
  };
}

/** 1-based row number across pages (index is 0-based within current page) */
export function pageRowNo(
  meta: Pick<PageMeta, "page" | "pageSize">,
  index: number
) {
  return (meta.page - 1) * meta.pageSize + index + 1;
}
