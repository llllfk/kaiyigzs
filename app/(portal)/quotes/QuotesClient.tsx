"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { DatePicker } from "@/components/ui/DatePicker";
import { Modal } from "@/components/ui/Modal";
import { StatusTag } from "@/components/ui/StatusTag";
import { useUi } from "@/components/ui/Feedback";
import { formatDateTime } from "@/lib/utils";
import type { SessionUser } from "@/types";

type QuoteItem = {
  id?: number;
  name: string;
  spec?: string | null;
  qty: number | string;
  unit_price: number | string;
  discount_pct: number | string;
  amount?: number;
};

type Quote = {
  id: number;
  version: number;
  status: string;
  title: string | null;
  total: number;
  list_total: number;
  max_discount_pct: number;
  valid_until: string | null;
  note: string | null;
  reject_reason: string | null;
  opportunity_id: number;
  opportunity_title?: string;
  customer_name?: string;
  owner_name?: string;
  approver_name?: string;
  submitted_at?: string | null;
  items?: QuoteItem[];
};

type OppOpt = { id: number; title: string; customer_name?: string };

const emptyItem = (): QuoteItem => ({
  name: "",
  spec: "",
  qty: 1,
  unit_price: 0,
  discount_pct: 0,
});

function lineAmount(it: QuoteItem) {
  const qty = Number(it.qty) || 0;
  const price = Number(it.unit_price) || 0;
  const disc = Math.min(100, Math.max(0, Number(it.discount_pct) || 0));
  return Math.round(qty * price * (1 - disc / 100) * 100) / 100;
}

function money(n: number | string | null | undefined) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `¥${v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function QuotesClient() {
  const ui = useUi();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"mine" | "pending">("mine");
  const [list, setList] = useState<Quote[]>([]);
  const [pending, setPending] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [opps, setOpps] = useState<OppOpt[]>([]);
  const [oppId, setOppId] = useState("");
  const [title, setTitle] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const canApprove =
    me?.role === "company_admin" ||
    me?.role === "sales_manager" ||
    Boolean(me?.act_as_company_id);

  const totalPreview = useMemo(
    () => items.reduce((s, it) => s + lineAmount(it), 0),
    [items]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mineRes, pendRes] = await Promise.all([
        fetch("/api/quotes"),
        canApprove ? fetch("/api/quotes?scope=pending") : Promise.resolve(null),
      ]);
      const mineJson = await mineRes.json();
      if (!mineRes.ok) {
        ui.error("加载失败", mineJson.error);
        return;
      }
      setList(mineJson.data || []);
      if (pendRes) {
        const pj = await pendRes.json();
        if (pendRes.ok) setPending(pj.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [canApprove, ui]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/auth/me");
      const json = await res.json();
      if (res.ok) setMe(json.data);
    })();
  }, []);

  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  async function loadOpps() {
    const res = await fetch("/api/opportunities?page=1&pageSize=100");
    const json = await res.json();
    if (!res.ok) return;
    setOpps(
      (json.data || []).map((o: { id: number; title: string; customer_name?: string }) => ({
        id: o.id,
        title: o.title,
        customer_name: o.customer_name,
      }))
    );
  }

  async function openById(id: number) {
    const res = await fetch(`/api/quotes/${id}`);
    const json = await res.json();
    if (!res.ok) {
      ui.error("打开报价失败", json.error);
      return;
    }
    const q = json.data as Quote;
    setEditing(q);
    setOppId(String(q.opportunity_id));
    setTitle(q.title || "");
    setValidUntil(q.valid_until ? String(q.valid_until).slice(0, 10) : "");
    setNote(q.note || "");
    setItems(
      (q.items || []).map((it) => ({
        name: it.name,
        spec: it.spec || "",
        qty: Number(it.qty),
        unit_price: Number(it.unit_price),
        discount_pct: Number(it.discount_pct),
      }))
    );
    setOpen(true);
  }

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      void openById(Number(id));
      return;
    }
    const oid = searchParams.get("opportunity_id");
    if (oid) {
      setEditing(null);
      setOppId(oid);
      setTitle("");
      setValidUntil("");
      setNote("");
      setItems([emptyItem()]);
      void loadOpps();
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openCreate() {
    setEditing(null);
    setOppId("");
    setTitle("");
    setValidUntil("");
    setNote("");
    setItems([emptyItem()]);
    void loadOpps();
    setOpen(true);
  }

  const editable =
    !editing || editing.status === "draft" || editing.status === "rejected";

  async function saveQuote(andSubmit = false) {
    if (!editable && editing) {
      ui.error("当前状态不可编辑");
      return;
    }
    if (!editing && !oppId) {
      ui.error("请选择商机");
      return;
    }
    const payloadItems = items
      .map((it) => ({
        name: String(it.name || "").trim(),
        spec: String(it.spec || "").trim(),
        qty: Number(it.qty),
        unit_price: Number(it.unit_price),
        discount_pct: Number(it.discount_pct) || 0,
      }))
      .filter((it) => it.name);
    if (!payloadItems.length) {
      ui.error("请至少填写一行明细");
      return;
    }

    setSaving(true);
    try {
      let quoteId = editing?.id;
      if (!editing) {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            opportunity_id: Number(oppId),
            title,
            valid_until: validUntil || null,
            note,
            items: payloadItems,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("创建失败", json.error);
          return;
        }
        quoteId = json.data.id;
        ui.success("报价已创建");
      } else {
        const res = await fetch(`/api/quotes/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            valid_until: validUntil || null,
            note,
            items: payloadItems,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("保存失败", json.error);
          return;
        }
        ui.success("已保存");
        quoteId = json.data.id;
      }

      if (andSubmit && quoteId) {
        const res = await fetch(`/api/quotes/${quoteId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "submit" }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("提交失败", json.error);
          await load();
          if (quoteId) await openById(quoteId);
          return;
        }
        if (json.data.auto_approved) {
          ui.success("未超审批阈值，已自动通过");
        } else {
          ui.success("已提交审批");
        }
      }

      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function runAction(id: number, action: string, extra?: Record<string, unknown>) {
    const res = await fetch(`/api/quotes/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = await res.json();
    if (!res.ok) {
      ui.error("操作失败", json.error);
      return;
    }
    ui.success(
      action === "approve"
        ? "已通过"
        : action === "reject"
          ? "已驳回"
          : action === "revise"
            ? "已生成新版本草稿"
            : action === "withdraw"
              ? "已撤回"
              : "完成"
    );
    if (action === "revise" && json.data?.id) {
      await load();
      await openById(json.data.id);
      return;
    }
    setOpen(false);
    setRejectOpen(false);
    await load();
  }

  const rows = tab === "pending" ? pending : list;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">报价</h1>
          <p className="text-sm text-[var(--color-muted)]">
            多版本报价与审批；未超公司阈值可自动通过
          </p>
        </div>
        <Button onClick={openCreate}>新建报价</Button>
      </div>

      <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-white p-0.5">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "mine" ? "bg-slate-900 text-white" : "text-[var(--color-muted)]"
          }`}
          onClick={() => setTab("mine")}
        >
          我的报价
        </button>
        {canApprove ? (
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === "pending" ? "bg-slate-900 text-white" : "text-[var(--color-muted)]"
            }`}
            onClick={() => setTab("pending")}
          >
            待我审批{pending.length ? ` (${pending.length})` : ""}
          </button>
        ) : null}
      </div>

      <div className="surface overflow-x-auto">
        {loading ? (
          <div className="p-6 text-sm text-[var(--color-muted)]">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-[var(--color-muted)]">暂无报价</div>
        ) : (
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">报价</th>
                <th className="px-4 py-3 font-medium">客户 / 商机</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">更新</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <div className="font-medium">{q.title || "未命名"}</div>
                    <div className="text-xs text-[var(--color-muted)]">V{q.version}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{q.customer_name || "—"}</div>
                    <span className="text-xs text-[var(--color-muted)]">
                      {q.opportunity_title || `商机 #${q.opportunity_id}`}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{money(q.total)}</td>
                  <td className="px-4 py-3">
                    <StatusTag kind="quote" value={q.status} />
                    {q.reject_reason ? (
                      <div className="mt-1 max-w-[12rem] truncate text-xs text-rose-600">
                        {q.reject_reason}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {formatDateTime(q.submitted_at || undefined)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="!px-2 !py-1 text-xs"
                        onClick={() => void openById(q.id)}
                      >
                        打开
                      </Button>
                      {tab === "pending" && q.status === "pending_approval" ? (
                        <>
                          <Button
                            type="button"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => void runAction(q.id, "approve")}
                          >
                            通过
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => {
                              setRejectId(q.id);
                              setRejectReason("");
                              setRejectOpen(true);
                            }}
                          >
                            驳回
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={open}
        title={editing ? `报价 V${editing.version}` : "新建报价"}
        description={
          editing?.status === "rejected" && editing.reject_reason
            ? `驳回原因：${editing.reject_reason}`
            : "填写明细后保存；提交时若未超公司阈值将自动通过"
        }
        onClose={() => setOpen(false)}
        size="xl"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              关闭
            </Button>
            {editing && editing.status === "pending_approval" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => void runAction(editing.id, "withdraw")}
              >
                撤回
              </Button>
            ) : null}
            {editing &&
            (editing.status === "approved" ||
              editing.status === "rejected" ||
              editing.status === "void") ? (
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => void runAction(editing.id, "revise")}
              >
                修订为新版本
              </Button>
            ) : null}
            {editing && canApprove && editing.status === "pending_approval" ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setRejectId(editing.id);
                    setRejectReason("");
                    setRejectOpen(true);
                  }}
                >
                  驳回
                </Button>
                <Button type="button" onClick={() => void runAction(editing.id, "approve")}>
                  通过
                </Button>
              </>
            ) : null}
            {editable ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => void saveQuote(false)}
                >
                  {saving ? "保存中…" : "保存草稿"}
                </Button>
                <Button type="button" disabled={saving} onClick={() => void saveQuote(true)}>
                  {saving ? "提交中…" : "保存并提交"}
                </Button>
              </>
            ) : null}
          </>
        }
      >
        <div className="space-y-4">
          {!editing ? (
            <div className="field">
              <label>关联商机</label>
              <Select
                value={oppId}
                onChange={setOppId}
                searchable
                placeholder="选择商机"
                options={opps.map((o) => ({
                  value: String(o.id),
                  label: `${o.title}${o.customer_name ? ` · ${o.customer_name}` : ""}`,
                }))}
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusTag kind="quote" value={editing.status} />
              <span className="text-[var(--color-muted)]">
                {editing.customer_name} · {editing.opportunity_title}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field">
              <label>标题</label>
              <input
                className="input"
                value={title}
                disabled={!editable}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：星河 CRM 标准版报价"
              />
            </div>
            <div className="field">
              <label>报价有效期至</label>
              <DatePicker
                value={validUntil}
                onChange={setValidUntil}
                allowClear
                disabled={!editable}
              />
            </div>
          </div>

          <div className="field">
            <label>备注</label>
            <textarea
              className="input textarea"
              rows={2}
              value={note}
              disabled={!editable}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">明细</label>
              {editable ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="!px-2 !py-1 text-xs"
                  onClick={() => setItems((prev) => [...prev, emptyItem()])}
                >
                  加一行
                </Button>
              ) : null}
            </div>
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-[var(--color-muted)]">
                  <tr>
                    <th className="px-2 py-2">名称</th>
                    <th className="px-2 py-2">规格</th>
                    <th className="px-2 py-2 w-20">数量</th>
                    <th className="px-2 py-2 w-24">单价</th>
                    <th className="px-2 py-2 w-20">折扣%</th>
                    <th className="px-2 py-2 w-24">小计</th>
                    {editable ? <th className="px-2 py-2 w-14" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-1.5">
                        <input
                          className="input !py-1"
                          value={it.name}
                          disabled={!editable}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, name: e.target.value } : row
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className="input !py-1"
                          value={it.spec || ""}
                          disabled={!editable}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, spec: e.target.value } : row
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className="input !py-1"
                          type="number"
                          min={0}
                          step="0.01"
                          value={it.qty}
                          disabled={!editable}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, qty: e.target.value } : row
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className="input !py-1"
                          type="number"
                          min={0}
                          step="0.01"
                          value={it.unit_price}
                          disabled={!editable}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, unit_price: e.target.value } : row
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className="input !py-1"
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          value={it.discount_pct}
                          disabled={!editable}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, discount_pct: e.target.value } : row
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-[var(--color-muted)]">
                        {money(lineAmount(it))}
                      </td>
                      {editable ? (
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            className="text-xs text-rose-600"
                            disabled={items.length <= 1}
                            onClick={() =>
                              setItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                          >
                            删
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-right text-sm font-semibold">
              合计 {money(editable ? totalPreview : editing?.total)}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={rejectOpen}
        title="驳回报价"
        onClose={() => setRejectOpen(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setRejectOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!rejectId) return;
                if (!rejectReason.trim()) {
                  ui.error("请填写驳回原因");
                  return;
                }
                void runAction(rejectId, "reject", { reason: rejectReason.trim() });
              }}
            >
              确认驳回
            </Button>
          </>
        }
      >
        <div className="field">
          <label>驳回原因</label>
          <textarea
            className="input textarea"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="例如：折扣过高，请调整后重提"
          />
        </div>
      </Modal>
    </div>
  );
}
