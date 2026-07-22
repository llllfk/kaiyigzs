/** 站内列表/详情短缓存：菜单预取 + 二次进入复用；超时后下次打开再拉 */

const TTL_MS = 120_000;

type Entry = { at: number; payload: unknown };

const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();

/** 导航预热并发上限，避免进站同时打爆 DB */
const WARM_CONCURRENCY = 2;
let warmActive = 0;
const warmQueue: Array<() => void> = [];

function enqueueWarm(run: () => Promise<void>) {
  return new Promise<void>((resolve) => {
    const start = () => {
      warmActive += 1;
      void run().finally(() => {
        warmActive -= 1;
        const next = warmQueue.shift();
        if (next) next();
        resolve();
      });
    };
    if (warmActive < WARM_CONCURRENCY) start();
    else warmQueue.push(start);
  });
}

export type PageCacheFetchInit = RequestInit & {
  /** 为 true 时忽略缓存，强制请求并覆盖 */
  force?: boolean;
};

function normalize(url: string) {
  try {
    if (url.startsWith("http")) {
      const u = new URL(url);
      return `${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return url;
}

export function pageCachePeek<T = unknown>(url: string): T | null {
  const key = normalize(url);
  const hit = mem.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    mem.delete(key);
    return null;
  }
  return hit.payload as T;
}

export function pageCachePut(url: string, payload: unknown) {
  mem.set(normalize(url), { at: Date.now(), payload });
}

export function pageCacheInvalidate(prefix?: string) {
  if (!prefix) {
    mem.clear();
    inflight.clear();
    return;
  }
  const p = normalize(prefix);
  for (const key of mem.keys()) {
    if (key === p || key.startsWith(p)) mem.delete(key);
  }
}

function stripForce(init?: PageCacheFetchInit): {
  force: boolean;
  fetchInit: RequestInit | undefined;
} {
  if (!init) return { force: false, fetchInit: undefined };
  const { force, ...rest } = init;
  const keys = Object.keys(rest);
  return {
    force: Boolean(force),
    fetchInit: keys.length > 0 ? (rest as RequestInit) : undefined,
  };
}

/** GET JSON：默认复用会话缓存；force 时强制拉网并覆盖 */
export async function pageCacheFetchJson<T = Record<string, unknown>>(
  url: string,
  init?: PageCacheFetchInit
): Promise<{ res: Response; json: T }> {
  const { force, fetchInit } = stripForce(init);
  const method = String(fetchInit?.method || "GET").toUpperCase();
  const key = normalize(url);

  if (!force && method === "GET" && !fetchInit) {
    const cached = pageCachePeek<T>(url);
    if (cached) {
      return {
        res: new Response(JSON.stringify(cached), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
        json: cached,
      };
    }
    const pending = inflight.get(key);
    if (pending) {
      await pending.catch(() => undefined);
      const after = pageCachePeek<T>(url);
      if (after) {
        return {
          res: new Response(JSON.stringify(after), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
          json: after,
        };
      }
    }
  }

  const res = await fetch(url, fetchInit);
  const json = (await res.json().catch(() => ({}))) as T;
  if (method === "GET" && res.ok) {
    pageCachePut(url, json);
  }
  return { res, json };
}

function defaultApisForPath(pathname: string): string[] {
  const path = pathname.split("?")[0] || pathname;
  switch (path) {
    case "/customers":
      return ["/api/customers?q=&page=1&pageSize=10"];
    case "/pool":
      return ["/api/pool?page=1&pageSize=10"];
    case "/opportunities":
      return ["/api/opportunities?page=1&pageSize=10"];
    case "/quotes":
      return ["/api/quotes?page=1&pageSize=10"];
    case "/tasks":
      return ["/api/tasks?page=1&pageSize=10"];
    case "/competitors":
      return ["/api/competitors?page=1&pageSize=10"];
    case "/uploads":
      return ["/api/uploads?page=1&pageSize=10"];
    case "/insights":
      return ["/api/insights/summary"];
    case "/reports":
      return ["/api/reports/people", "/api/reports"];
    case "/notifications":
      return ["/api/notifications?page=1&pageSize=10"];
    case "/team":
      return ["/api/users?page=1&pageSize=10"];
    case "/companies":
      return ["/api/companies?page=1&pageSize=10"];
    case "/audit": {
      // 与审计页默认近 7 天筛选对齐，避免预热 URL 对不上
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 6);
      const ymd = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return [
        `/api/audit-logs?page=1&pageSize=10&from=${ymd(from)}&to=${ymd(to)}`,
      ];
    }
    case "/knowledge":
      return ["/api/knowledge/folders"];
    default:
      break;
  }
  const customer = path.match(/^\/customers\/(\d+)$/);
  if (customer) {
    const id = customer[1];
    return [`/api/customers/${id}`, `/api/tasks?customer_id=${id}`];
  }
  const company = path.match(/^\/companies\/(\d+)$/);
  if (company) {
    return [`/api/companies/${company[1]}`];
  }
  return [];
}

/** 预热某路由默认接口（悬停 / 点击）；已缓存则跳过；并发受限 */
export function warmNavPath(pathname: string) {
  if (typeof window === "undefined") return;
  let path = pathname;
  try {
    if (pathname.startsWith("http")) {
      path = new URL(pathname).pathname;
    } else if (pathname.startsWith("/")) {
      path = pathname.split("?")[0] || pathname;
    }
  } catch {
    path = pathname.split("?")[0] || pathname;
  }

  for (const url of defaultApisForPath(path)) {
    if (pageCachePeek(url)) continue;
    const key = normalize(url);
    if (inflight.has(key)) continue;
    const job = enqueueWarm(async () => {
      try {
        const res = await fetch(url);
        const json = await res.json().catch(() => ({}));
        if (res.ok) pageCachePut(url, json);
      } catch {
        /* ignore */
      }
    }).finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, job);
  }
}

type PrefetchableRouter = {
  prefetch?: (href: string) => void | Promise<void>;
};

/** 预取 RSC 路由 + 默认 API，缩短点击后「提交路由」等待 */
export function prefetchNavPath(
  router: PrefetchableRouter | null | undefined,
  href: string
) {
  if (typeof window === "undefined" || !href) return;
  const path = normalize(href).split("?")[0] || href;
  try {
    const p = router?.prefetch?.(path);
    if (p && typeof (p as Promise<void>).then === "function") {
      void (p as Promise<void>).catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
  warmNavPath(path);
}

export function prefetchNavPaths(
  router: PrefetchableRouter | null | undefined,
  hrefs: string[]
) {
  const seen = new Set<string>();
  for (const href of hrefs) {
    const path = normalize(href).split("?")[0] || href;
    if (!path || seen.has(path)) continue;
    seen.add(path);
    prefetchNavPath(router, path);
  }
}
