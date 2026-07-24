/** 站内跳转时携带的列表筛选（不进地址栏，用 sessionStorage + 事件传递） */

export type ListNavFilters = {
  /** 目标路径，如 /customers；同页跳转时用于避免串到其它列表 */
  path?: string;
  ownerId?: number | null;
  ownerName?: string;
  /** 填入客户/商机页「搜索负责人」输入框 */
  ownerQ?: string;
  /** 商机阶段多选 */
  stages?: string[];
  /** 待办紧急程度 */
  urgency?: string;
  /** 待办状态 pending | done */
  status?: string;
  /** 商机：仅推进中（非 won/lost） */
  open?: boolean;
  /** 列表日期筛选：起始日 YYYY-MM-DD */
  createdFrom?: string;
  /** 列表日期筛选：结束日 YYYY-MM-DD */
  createdTo?: string;
  /**
   * 日期字段：默认 created_at；
   * 成交本月等场景用 updated_at
   */
  dateField?: "created_at" | "updated_at";
};

const STORAGE_KEY = "crm:list-nav-filters";
const EVENT_NAME = "crm:list-nav-filters";

type Listener = (filters: ListNavFilters) => void;

function normalizePath(href: string) {
  const path = href.split("?")[0] || href;
  return path.startsWith("/") ? path : `/${path}`;
}

export function stashListFilters(href: string, filters: ListNavFilters) {
  const payload: ListNavFilters = {
    ...filters,
    path: normalizePath(href),
  };
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  // 异步派发，避免同步监听抛错阻断 AppLink 的 router.push
  queueMicrotask(() => {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
    } catch {
      /* ignore */
    }
  });
}

/** 取出并清除；无数据时返回 null */
export function takeListFilters(expectedPath?: string): ListNavFilters | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ListNavFilters;
    if (!parsed || typeof parsed !== "object") {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (
      expectedPath &&
      parsed.path &&
      normalizePath(parsed.path) !== normalizePath(expectedPath)
    ) {
      return null;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    return parsed;
  } catch {
    return null;
  }
}

/** 同路由再次跳转时，页面未卸载也能收到筛选 */
export function subscribeListFilters(listener: Listener) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const onEvent = (e: Event) => {
    const detail = (e as CustomEvent<ListNavFilters>).detail;
    if (!detail) return;
    try {
      listener(detail);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener(EVENT_NAME, onEvent);
  return () => {
    window.removeEventListener(EVENT_NAME, onEvent);
  };
}

export { normalizePath };
