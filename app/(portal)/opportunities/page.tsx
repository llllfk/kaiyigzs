"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { STAGE_LABELS } from "@/types";

type Opp = {
  id: number;
  title: string;
  stage: string;
  amount: number | null;
  customer_name?: string;
  customer_id: number;
  owner_name?: string;
  expected_close_date?: string | null;
  stage_suggestion_json?: {
    stage?: string;
    reason?: string;
  } | null;
};

const REASON_OPTIONS = [
  { value: "价格", label: "价格" },
  { value: "功能", label: "功能" },
  { value: "竞品", label: "竞品" },
  { value: "关系", label: "关系/信任" },
  { value: "时机", label: "时机/预算周期" },
  { value: "服务", label: "服务交付" },
  { value: "其他", label: "其他" },
];

export default function OpportunitiesPage() {
  const [list, setList] = useState<Opp[]>([]);
  const [error, setError] = useState("");
  const [reviewOppId, setReviewOppId] = useState<number | null>(null);
  const [outcome, setOutcome] = useState("won");
  const [reason, setReason] = useState("价格");
  const [detail, setDetail] = useState("");
  const [lessons, setLessons] = useState("");

  async function load() {
    const res = await fetch("/api/opportunities");
    const json = await res.json();
    if (!res.ok) setError(json.error || "加载失败");
    else setList(json.data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function changeStage(id: number, stage: string) {
    const res = await fetch(`/api/opportunities/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error || "更新失败");
    else {
      if (stage === "won" || stage === "lost") {
        setReviewOppId(id);
        setOutcome(stage);
      }
      await load();
    }
  }

  async function acceptSuggestion(id: number) {
    const res = await fetch(`/api/opportunities/${id}/stage-suggestion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error || "采纳失败");
    else {
      const stage = json.data?.stage;
      if (stage === "won" || stage === "lost") {
        setReviewOppId(id);
        setOutcome(stage);
      }
      await load();
    }
  }

  async function dismissSuggestion(id: number) {
    await fetch(`/api/opportunities/${id}/stage-suggestion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
    await load();
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewOppId) return;
    const res = await fetch("/api/opportunity-reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opportunity_id: reviewOppId,
        outcome,
        reason_category: reason,
        detail,
        lessons,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "复盘提交失败");
      return;
    }
    setReviewOppId(null);
    setDetail("");
    setLessons("");
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">商机</h1>
        <p className="text-sm text-[var(--color-muted)]">
          漏斗管理、AI 阶段建议与成交/流失复盘
        </p>
      </div>
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {reviewOppId && (
        <form onSubmit={submitReview} className="surface grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          <div className="md:col-span-2 font-semibold">成交复盘（商机 #{reviewOppId}）</div>
          <div className="field">
            <label>结果</label>
            <Select
              value={outcome}
              onChange={setOutcome}
              options={[
                { value: "won", label: "成交" },
                { value: "lost", label: "流失" },
              ]}
            />
          </div>
          <div className="field">
            <label>原因分类</label>
            <Select value={reason} onChange={setReason} options={REASON_OPTIONS} />
          </div>
          <div className="field md:col-span-2">
            <label>详情</label>
            <textarea
              className="input textarea"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              required
            />
          </div>
          <div className="field md:col-span-2">
            <label>可复用经验</label>
            <textarea
              className="input textarea"
              value={lessons}
              onChange={(e) => setLessons(e.target.value)}
            />
          </div>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit">提交复盘</Button>
            <Button type="button" variant="secondary" onClick={() => setReviewOppId(null)}>
              稍后
            </Button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {list.map((o) => (
          <div key={o.id} className="surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{o.title}</div>
                <div className="mt-1 text-sm text-[var(--color-muted)]">
                  <Link href={`/customers/${o.customer_id}`} className="text-[var(--color-accent)]">
                    {o.customer_name || `客户#${o.customer_id}`}
                  </Link>
                  {" · "}
                  {o.owner_name || "—"}
                  {o.amount != null ? ` · ¥${o.amount}` : ""}
                </div>
              </div>
              {(o.stage === "won" || o.stage === "lost") && (
                <Button variant="secondary" onClick={() => {
                  setReviewOppId(o.id);
                  setOutcome(o.stage);
                }}>
                  复盘
                </Button>
              )}
            </div>

            {o.stage_suggestion_json?.stage && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <div className="font-medium text-amber-900">
                  AI 建议阶段：
                  {STAGE_LABELS[o.stage_suggestion_json.stage as keyof typeof STAGE_LABELS] ||
                    o.stage_suggestion_json.stage}
                </div>
                {o.stage_suggestion_json.reason && (
                  <div className="mt-1 text-amber-800/80">{o.stage_suggestion_json.reason}</div>
                )}
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => acceptSuggestion(o.id)}>采纳</Button>
                  <Button variant="secondary" onClick={() => dismissSuggestion(o.id)}>
                    忽略
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                className="flex-1"
                value={o.stage}
                onChange={(v) => changeStage(o.id, v)}
                options={Object.entries(STAGE_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
              <Button variant="secondary" onClick={() => load()}>
                刷新
              </Button>
            </div>
          </div>
        ))}
      </div>
      {list.length === 0 && (
        <div className="text-sm text-[var(--color-muted)]">暂无商机，可在客户详情中创建。</div>
      )}
    </div>
  );
}
