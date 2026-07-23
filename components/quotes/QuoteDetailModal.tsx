"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatusTag } from "@/components/ui/StatusTag";
import { useUi } from "@/components/ui/Feedback";
import { formatDateTime } from "@/lib/utils";

type QuoteItem = {
  id?: number;
  name: string;
  spec?: string | null;
  qty: number | string;
  unit_price: number | string;
  discount_pct: number | string;
  amount?: number;
};

type QuoteDetail = {
  id: number;
  version: number;
  status: string;
  title?: string | null;
  note?: string | null;
  valid_until?: string | null;
  total?: number | string | null;
  list_total?: number | string | null;
  reject_reason?: string | null;
  customer_name?: string | null;
  opportunity_title?: string | null;
  owner_name?: string | null;
  submitter_name?: string | null;
  approver_name?: string | null;
  submitted_at?: string | null;
  decided_at?: string | null;
  created_at?: string;
  updated_at?: string;
  items?: QuoteItem[];
};

function money(n: number | string | null | undefined) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `¥${v.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function lineAmount(it: QuoteItem) {
  if (it.amount != null && Number.isFinite(Number(it.amount))) {
    return Number(it.amount);
  }
  const qty = Number(it.qty) || 0;
  const price = Number(it.unit_price) || 0;
  const disc = Math.min(100, Math.max(0, Number(it.discount_pct) || 0));
  return Math.round(qty * price * (1 - disc / 100) * 100) / 100;
}

function lineListAmount(it: QuoteItem) {
  const qty = Number(it.qty) || 0;
  const price = Number(it.unit_price) || 0;
  return Math.round(qty * price * 100) / 100;
}

export function QuoteDetailModal({
  quoteId,
  open,
  onClose,
}: {
  quoteId: string | number | null;
  open: boolean;
  onClose: () => void;
}) {
  const ui = useUi();
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<QuoteDetail | null>(null);

  useEffect(() => {
    if (!open || quoteId == null) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setQuote(null);
    void (async () => {
      try {
        const res = await fetch(`/api/quotes/${quoteId}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          ui.error("加载报价失败", json.error || res.statusText);
          onClose();
          return;
        }
        setQuote(json.data as QuoteDetail);
      } catch {
        if (!cancelled) {
          ui.error("加载报价失败");
          onClose();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随 open/quoteId 拉取
  }, [open, quoteId]);

  const items = quote?.items || [];
  const total =
    quote?.total != null
      ? Number(quote.total)
      : items.reduce((s, it) => s + lineAmount(it), 0);
  const listTotal =
    quote?.list_total != null
      ? Number(quote.list_total)
      : items.reduce((s, it) => s + lineListAmount(it), 0);

  return (
    <Modal
      open={open}
      title={
        quote
          ? `${quote.title?.trim() || "报价"} · V${quote.version}`
          : "报价详情"
      }
      description={
        quote?.status === "rejected" && quote.reject_reason
          ? `驳回原因：${quote.reject_reason}`
          : undefined
      }
      onClose={onClose}
      size="xl"
      portalClassName="!z-[140]"
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          关闭
        </Button>
      }
    >
      {loading || !quote ? (
        <div className="py-10 text-center text-sm text-[var(--color-muted)]">
          加载中…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <StatusTag kind="quote" value={quote.status} />
            <span className="text-[var(--color-muted)]">
              {quote.customer_name || "客户"}
              {quote.opportunity_title ? ` · ${quote.opportunity_title}` : ""}
            </span>
            {quote.submitter_name || quote.owner_name ? (
              <span className="text-[var(--color-muted)]">
                · 提交人 {quote.submitter_name || quote.owner_name}
                {quote.submitted_at
                  ? `（${formatDateTime(quote.submitted_at)}）`
                  : ""}
              </span>
            ) : null}
            {(quote.status === "approved" ||
              quote.status === "confirmed" ||
              quote.status === "rejected") &&
            (quote.approver_name || quote.decided_at) ? (
              <span className="text-[var(--color-muted)]">
                · {quote.status === "rejected" ? "驳回人" : "审批人"}{" "}
                {quote.approver_name || "—"}
                {quote.decided_at
                  ? `（${formatDateTime(quote.decided_at)}）`
                  : ""}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field">
              <label>标题</label>
              <div className="rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-sm">
                {quote.title?.trim() || "—"}
              </div>
            </div>
            <div className="field">
              <label>报价有效期至</label>
              <div className="rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-sm">
                {quote.valid_until
                  ? String(quote.valid_until).slice(0, 10)
                  : "—"}
              </div>
            </div>
          </div>

          {quote.note ? (
            <div className="field">
              <label>备注</label>
              <div className="whitespace-pre-wrap rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-sm">
                {quote.note}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium">明细</label>
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-[var(--color-muted)]">
                  <tr>
                    <th className="px-2 py-2">名称</th>
                    <th className="px-2 py-2">规格</th>
                    <th className="px-2 py-2 w-20">数量</th>
                    <th className="px-2 py-2 w-24">单价</th>
                    <th className="px-2 py-2 w-24">折前金额</th>
                    <th className="px-2 py-2 w-20">折扣%</th>
                    <th className="px-2 py-2 w-24">小计</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-2 py-6 text-center text-[var(--color-muted)]"
                      >
                        暂无明细
                      </td>
                    </tr>
                  ) : (
                    items.map((it, idx) => (
                      <tr
                        key={it.id ?? idx}
                        className="border-t border-[var(--color-border)]"
                      >
                        <td className="px-2 py-2">{it.name || "—"}</td>
                        <td className="px-2 py-2 text-[var(--color-muted)]">
                          {it.spec || "—"}
                        </td>
                        <td className="px-2 py-2 tabular-nums">{it.qty}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {money(it.unit_price)}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-[var(--color-muted)]">
                          {money(lineListAmount(it))}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {Number(it.discount_pct) || 0}
                        </td>
                        <td className="px-2 py-2 tabular-nums font-medium">
                          {money(lineAmount(it))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-end gap-0.5 text-sm">
              <div className="text-[var(--color-muted)]">
                折前合计 {money(listTotal)}
              </div>
              <div className="font-semibold">合计 {money(total)}</div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
