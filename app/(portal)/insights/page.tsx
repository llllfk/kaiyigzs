"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STAGE_LABELS, type OpportunityStage } from "@/types";

type KV = { key: string; value: number; reason?: string };

type Summary = {
  scope: string;
  customers_by_industry: KV[];
  customers_by_source: KV[];
  opportunities_by_stage: KV[];
  follow_ups_14d: KV[];
  pain_points: KV[];
  competitors: KV[];
  reviews: KV[];
  intent_distribution: KV[];
  recent_insights: {
    id: number;
    kind: string;
    summary: string;
    customer_name?: string;
    customer_id?: number;
    created_at: string;
  }[];
  upload_stats: KV[];
};

export default function InsightsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/insights/summary")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setData(j.data);
      })
      .catch(() => setError("加载失败"));
  }, []);

  if (error) {
    return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>;
  }
  if (!data) {
    return <div className="text-[var(--color-muted)]">加载分析数据…</div>;
  }

  const stageMap = Object.fromEntries(
    data.opportunities_by_stage.map((r) => [r.key, r.value])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">分析看板</h1>
        <p className="text-sm text-[var(--color-muted)]">
          数据范围：
          {data.scope === "company"
            ? "全公司"
            : data.scope === "team"
              ? "本人+下属"
              : "仅本人"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="商机漏斗">
          {(Object.keys(STAGE_LABELS) as OpportunityStage[]).map((stage) => (
            <Bar
              key={stage}
              label={STAGE_LABELS[stage]}
              value={stageMap[stage] || 0}
              max={Math.max(1, ...Object.values(stageMap).map(Number))}
            />
          ))}
        </Panel>

        <Panel title="客户意向分布">
          {data.intent_distribution.length === 0 && <Empty />}
          {data.intent_distribution.map((r) => (
            <Bar key={r.key} label={r.key} value={r.value} max={maxOf(data.intent_distribution)} />
          ))}
        </Panel>

        <Panel title="行业分布">
          {data.customers_by_industry.map((r) => (
            <Bar key={r.key} label={r.key} value={r.value} max={maxOf(data.customers_by_industry)} />
          ))}
        </Panel>

        <Panel title="来源分布">
          {data.customers_by_source.map((r) => (
            <Bar key={r.key} label={r.key} value={r.value} max={maxOf(data.customers_by_source)} />
          ))}
        </Panel>

        <Panel title="高频痛点">
          {data.pain_points.length === 0 && <Empty tip="上传沟通记录并解析后可见" />}
          <div className="flex flex-wrap gap-2">
            {data.pain_points.map((r) => (
              <span
                key={r.key}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm"
              >
                {r.key} · {r.value}
              </span>
            ))}
          </div>
        </Panel>

        <Panel title="竞品出现频次">
          {data.competitors.length === 0 && <Empty tip="AI 抽取竞品后可见" />}
          {data.competitors.map((r) => (
            <Bar key={r.key} label={r.key} value={r.value} max={maxOf(data.competitors)} />
          ))}
        </Panel>

        <Panel title="近 14 天跟进频次">
          {data.follow_ups_14d.length === 0 && <Empty />}
          {data.follow_ups_14d.map((r) => (
            <Bar key={r.key} label={r.key.slice(5)} value={r.value} max={maxOf(data.follow_ups_14d)} />
          ))}
        </Panel>

        <Panel title="赢输复盘">
          {data.reviews.length === 0 && <Empty tip="商机成交/流失后提交复盘可见" />}
          {data.reviews.map((r, i) => (
            <div key={`${r.key}-${r.reason}-${i}`} className="flex justify-between text-sm py-1">
              <span>
                {r.key === "won" ? "成交" : "流失"} · {r.reason || "未分类"}
              </span>
              <span className="font-semibold">{r.value}</span>
            </div>
          ))}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="上传解析状态">
          {data.upload_stats.map((r) => (
            <div key={r.key} className="flex justify-between text-sm py-1">
              <span>{r.key}</span>
              <span className="font-semibold">{r.value}</span>
            </div>
          ))}
          {data.upload_stats.length === 0 && <Empty />}
        </Panel>

        <Panel title="最近 AI 洞察">
          <ul className="space-y-2">
            {data.recent_insights.map((ins) => (
              <li key={ins.id} className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
                <div className="text-xs text-[var(--color-muted)]">
                  {ins.kind} · {new Date(ins.created_at).toLocaleString("zh-CN")}
                  {ins.customer_id && (
                    <>
                      {" · "}
                      <Link
                        href={`/customers/${ins.customer_id}`}
                        className="text-[var(--color-accent)]"
                      >
                        {ins.customer_name || "客户"}
                      </Link>
                    </>
                  )}
                </div>
                <div className="mt-1">{ins.summary || "无摘要"}</div>
              </li>
            ))}
            {data.recent_insights.length === 0 && <Empty />}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface p-4 md:p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / Math.max(max, 1)) * 100);
  return (
    <div className="mb-2 flex items-center gap-3 text-sm">
      <div className="w-20 truncate text-[var(--color-muted)]" title={label}>
        {label}
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded bg-slate-100">
        <div
          className="h-full rounded bg-[var(--color-accent)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-8 text-right font-semibold">{value}</div>
    </div>
  );
}

function Empty({ tip }: { tip?: string }) {
  return <div className="text-sm text-[var(--color-muted)]">{tip || "暂无数据"}</div>;
}

function maxOf(rows: KV[]) {
  return Math.max(1, ...rows.map((r) => r.value));
}
