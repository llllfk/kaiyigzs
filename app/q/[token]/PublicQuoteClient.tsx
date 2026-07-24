"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/utils";

type QuoteItem = {
  name: string;
  spec?: string | null;
  qty: number;
  unit_price: number;
  discount_pct: number;
  amount: number;
};

type PublicQuote = {
  id: number;
  version: number;
  status: string;
  title: string | null;
  list_total: number;
  total: number;
  max_discount_pct: number;
  valid_until: string | null;
  note: string | null;
  customer_name?: string;
  opportunity_title?: string;
  company_name?: string;
  items: QuoteItem[];
};

type PublicShare = {
  expires_at: string;
  max_views: number;
  view_count: number;
  last_viewed_at: string | null;
  view_times?: string[];
  views?: { id: number; viewed_at: string; duration_ms: number | null }[];
  confirmed_at: string | null;
  confirmer_name: string | null;
  confirmer_note: string | null;
  views_exhausted?: boolean;
};

/** 单次查看停留时长上限：页签一直开着也不会无限涨 */
const MAX_VIEW_DURATION_MS = 1 * 60 * 60 * 1000;

function money(n: number | string | null | undefined) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `¥${v.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 进程内防抖，配合 sessionStorage，避免 Strict Mode 双请求 */
const viewClaimed = new Set<string>();

function claimThisSessionView(token: string): boolean {
  if (viewClaimed.has(token)) return false;
  const key = `crm:q-viewed:${token}`;
  try {
    const cur = sessionStorage.getItem(key);
    if (cur === "1" || cur === "pending") return false;
    sessionStorage.setItem(key, "pending");
  } catch {
    /* private mode 等 */
  }
  viewClaimed.add(token);
  return true;
}

function markViewRecorded(token: string) {
  try {
    sessionStorage.setItem(`crm:q-viewed:${token}`, "1");
  } catch {
    /* ignore */
  }
}

function releaseViewClaim(token: string) {
  viewClaimed.delete(token);
  try {
    const key = `crm:q-viewed:${token}`;
    if (sessionStorage.getItem(key) === "pending") {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

function reportViewDuration(token: string, viewId: number, durationMs: number) {
  const ms = Math.min(MAX_VIEW_DURATION_MS, Math.max(0, Math.floor(durationMs)));
  if (!token || !viewId || ms < 500) return;
  const payload = JSON.stringify({
    action: "view_duration",
    view_id: viewId,
    duration_ms: ms,
  });
  const url = `/api/public/quotes/${encodeURIComponent(token)}`;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch {
    /* fall through */
  }
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

export default function PublicQuoteClient({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [share, setShare] = useState<PublicShare | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");
  const [activeViewId, setActiveViewId] = useState<number | null>(null);

  /** 仅累计页签可见时间；切走/挂后台暂停 */
  const accumulatedMsRef = useRef(0);
  const segmentStartedAtRef = useRef<number | null>(null);
  const cappedRef = useRef(false);

  function currentDurationMs() {
    let ms = accumulatedMsRef.current;
    if (segmentStartedAtRef.current != null) {
      ms += Date.now() - segmentStartedAtRef.current;
    }
    return Math.min(MAX_VIEW_DURATION_MS, Math.max(0, ms));
  }

  function pauseVisibleSegment() {
    if (segmentStartedAtRef.current == null) return;
    accumulatedMsRef.current += Date.now() - segmentStartedAtRef.current;
    segmentStartedAtRef.current = null;
    if (accumulatedMsRef.current >= MAX_VIEW_DURATION_MS) {
      accumulatedMsRef.current = MAX_VIEW_DURATION_MS;
      cappedRef.current = true;
    }
  }

  function resumeVisibleSegment() {
    if (cappedRef.current) return;
    if (document.visibilityState !== "visible") return;
    if (segmentStartedAtRef.current != null) return;
    segmentStartedAtRef.current = Date.now();
  }

  const load = useCallback(async () => {
    if (!token) {
      setError("链接无效");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setWarn("");
    try {
      const res = await fetch(`/api/public/quotes/${encodeURIComponent(token)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "无法打开报价");
        setQuote(null);
        setShare(null);
        return;
      }
      setQuote(json.data.quote);
      setShare(json.data.share);
      if (json.data.share?.confirmed_at) {
        setDoneMsg("您已确认该报价");
      }

      // 加载成功后再记 1 次查看；同一会话只记一次
      if (!json.data.share?.confirmed_at && claimThisSessionView(token)) {
        try {
          const viewRes = await fetch(
            `/api/public/quotes/${encodeURIComponent(token)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "view" }),
            }
          );
          const viewJson = await viewRes.json().catch(() => ({}));
          if (viewRes.ok && viewJson.data?.share) {
            setShare(viewJson.data.share);
            markViewRecorded(token);
            const vid = Number(viewJson.data.view_id);
            if (Number.isFinite(vid) && vid > 0) {
              accumulatedMsRef.current = 0;
              segmentStartedAtRef.current =
                document.visibilityState === "visible" ? Date.now() : null;
              cappedRef.current = false;
              setActiveViewId(vid);
            }
          } else if (viewRes.status === 410) {
            setWarn(viewJson.error || "查看次数已用完");
            markViewRecorded(token);
          } else {
            releaseViewClaim(token);
          }
        } catch {
          releaseViewClaim(token);
        }
      } else if (json.data.views_exhausted && !json.data.share?.confirmed_at) {
        setWarn("查看次数已用完");
      }
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // 可见时间累计：切后台暂停；满 1 小时停止回写
  useEffect(() => {
    if (!token || !activeViewId) return;

    const flush = () => {
      const ms = currentDurationMs();
      reportViewDuration(token, activeViewId, ms);
      if (ms >= MAX_VIEW_DURATION_MS) {
        cappedRef.current = true;
        pauseVisibleSegment();
      }
    };

    const timer = window.setInterval(() => {
      if (cappedRef.current) {
        window.clearInterval(timer);
        return;
      }
      flush();
    }, 15000);

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        pauseVisibleSegment();
        flush();
      } else {
        resumeVisibleSegment();
      }
    }

    function onPageHide() {
      pauseVisibleSegment();
      flush();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      pauseVisibleSegment();
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeViewId]);

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setConfirming(true);
    setError("");
    try {
      const res = await fetch(`/api/public/quotes/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          confirmer_name: name.trim() || undefined,
          confirmer_note: note.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "确认失败");
        return;
      }
      setQuote(json.data.quote);
      setShare(json.data.share);
      setDoneMsg(json.data.already ? "您已确认过该报价" : "确认成功，感谢您的回复");
      if (activeViewId) {
        pauseVisibleSegment();
        reportViewDuration(token, activeViewId, currentDurationMs());
      }
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setConfirming(false);
    }
  }

  const confirmed = Boolean(share?.confirmed_at || quote?.status === "confirmed");

  return (
    <div className="min-h-screen bg-[#eef2f7]">
      <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 sm:py-12">
        <div className="mb-5 text-center sm:mb-6">
          <div className="text-base font-bold tracking-tight text-[#1e3a5f] sm:text-lg">
            {quote?.company_name || "凯艺销售CRM"}
          </div>
          <div className="mt-1 text-sm text-slate-500">报价确认</div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            加载中…
          </div>
        ) : error && !quote ? (
          <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
            <div className="text-base font-semibold text-rose-700">无法打开</div>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
          </div>
        ) : quote ? (
          <div className="space-y-4">
            {warn ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {warn}
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="break-words text-lg font-bold text-slate-900 sm:text-xl">
                    {quote.title || "报价单"}
                  </h1>
                  <p className="mt-1 break-words text-sm text-slate-500">
                    V{quote.version}
                    {quote.customer_name ? ` · ${quote.customer_name}` : ""}
                    {quote.opportunity_title ? ` · ${quote.opportunity_title}` : ""}
                  </p>
                </div>
                <div className="min-w-0 text-left">
                  <div className="text-2xl font-bold tabular-nums text-[#1e3a5f]">
                    {money(quote.total)}
                  </div>
                  <div className="text-xs text-slate-500">
                    目录价 {money(quote.list_total)}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-1">
                {quote.valid_until ? (
                  <span>报价有效至 {String(quote.valid_until).slice(0, 10)}</span>
                ) : null}
                {share?.expires_at ? (
                  <span>链接有效至 {formatDateTime(share.expires_at)}</span>
                ) : null}
                {share ? (
                  <span>
                    已查看 {share.view_count}/{share.max_views} 次
                  </span>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
                明细
              </div>

              {/* 手机：卡片列表，避免宽表被裁切 */}
              <div className="divide-y divide-slate-100 sm:hidden">
                {quote.items.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-slate-400">暂无明细</div>
                ) : (
                  quote.items.map((it, i) => (
                    <div key={i} className="space-y-2 px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="break-words font-medium text-slate-900">{it.name}</div>
                          {it.spec ? (
                            <div className="mt-0.5 break-words text-xs text-slate-500">
                              {it.spec}
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0 tabular-nums font-semibold text-slate-900">
                          {money(it.amount)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>
                          数量 <span className="tabular-nums text-slate-700">{it.qty}</span>
                        </span>
                        <span>
                          单价{" "}
                          <span className="tabular-nums text-slate-700">
                            {money(it.unit_price)}
                          </span>
                        </span>
                        <span>
                          折扣{" "}
                          <span className="tabular-nums text-slate-700">
                            {Number(it.discount_pct) || 0}%
                          </span>
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* 桌面：表格 */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">名称</th>
                      <th className="px-4 py-2.5 font-medium">规格</th>
                      <th className="px-4 py-2.5 font-medium">数量</th>
                      <th className="px-4 py-2.5 font-medium">单价</th>
                      <th className="px-4 py-2.5 font-medium">折扣%</th>
                      <th className="px-4 py-2.5 font-medium">金额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quote.items.map((it, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{it.name}</td>
                        <td className="px-4 py-2.5 text-slate-500">{it.spec || "—"}</td>
                        <td className="px-4 py-2.5 tabular-nums">{it.qty}</td>
                        <td className="px-4 py-2.5 tabular-nums">{money(it.unit_price)}</td>
                        <td className="px-4 py-2.5 tabular-nums">{Number(it.discount_pct) || 0}</td>
                        <td className="px-4 py-2.5 tabular-nums font-medium">{money(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {confirmed ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 shadow-sm">
                <div className="font-semibold">{doneMsg || "您已确认该报价"}</div>
                {share?.confirmer_name ? (
                  <div className="mt-1 text-sm">确认人：{share.confirmer_name}</div>
                ) : null}
                {share?.confirmed_at ? (
                  <div className="mt-1 text-sm">
                    时间：{formatDateTime(share.confirmed_at)}
                  </div>
                ) : null}
                {share?.confirmer_note ? (
                  <div className="mt-2 text-sm">备注：{share.confirmer_note}</div>
                ) : null}
              </div>
            ) : (
              <form
                onSubmit={onConfirm}
                className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
              >
                <div>
                  <h2 className="text-base font-semibold text-slate-900">确认报价</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    确认后销售将收到通知。姓名与备注选填。
                  </p>
                </div>
                {error ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}
                <div className="field">
                  <label>您的姓名（选填）</label>
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="如：张经理"
                    maxLength={100}
                  />
                </div>
                <div className="field">
                  <label>备注（选填）</label>
                  <textarea
                    className="input min-h-20"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="如有补充说明可填写"
                    maxLength={500}
                  />
                </div>
                <Button type="submit" disabled={confirming} className="w-full sm:w-auto">
                  {confirming ? "提交中…" : "确认接受此报价"}
                </Button>
              </form>
            )}
          </div>
        ) : null}

        <p className="mt-8 text-center text-xs text-slate-400">
          本页面由凯艺销售CRM生成，仅供报价确认使用
        </p>
      </div>
    </div>
  );
}
