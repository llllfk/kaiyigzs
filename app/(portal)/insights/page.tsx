"use client";

import { useCallback, useEffect, useState } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { INTENT_LABELS, MEDIA_KIND_LABELS, labelOf } from "@/types";
import { StatusTag } from "@/components/ui/StatusTag";
import { FollowTypeTag } from "@/components/ui/FollowTypeTag";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { pageCacheFetchJson, pageCachePeek } from "@/lib/page-cache";
import { TruncateWithDelayTip } from "@/components/ui/DelayedTooltip";

type KV = { key: string; value: number; reason?: string };

type Summary = {
  scope: string;
  customers_by_industry: KV[];
  customers_by_source: KV[];
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
    customer_public_id?: string;
    created_at: string;
  }[];
  upload_stats: KV[];
};

const INSIGHTS_SEED_URL = "/api/insights/summary";

export default function InsightsPage() {
  const seed = pageCachePeek<{ data?: Summary; error?: string }>(INSIGHTS_SEED_URL);
  const [data, setData] = useState<Summary | null>(() => seed?.data || null);
  const [error, setError] = useState("");

  const load = useCallback(async (force?: boolean) => {
    const url = INSIGHTS_SEED_URL;
    const cached = pageCachePeek<{ data?: Summary }>(url);
    if (!force && cached?.data) {
      setData(cached.data);
      setError("");
      return;
    }
    if (cached?.data) setData(cached.data);
    try {
      const { res, json } = await pageCacheFetchJson<{ data?: Summary; error?: string }>(url, {
        force: force === true,
      });
      if (!res.ok || json.error) setError(json.error || "加载失败");
      else {
        setError("");
        setData(json.data || null);
      }
    } catch {
      setError("加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>;
  }
  if (!data) {
    return <InsightsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">分析</h1>
        <p className="text-sm text-[var(--color-muted)]">
          痛点、竞品、复盘与上传等深度洞察；商机漏斗与待办请看工作台。数据范围：
          {data.scope === "company"
            ? "全公司"
            : data.scope === "team"
              ? "本人+下属"
              : "仅本人"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="客户意向分布">
          {data.intent_distribution.length === 0 && <Empty />}
          {data.intent_distribution.map((r) => (
            <Bar
              key={r.key}
              label={labelOf(INTENT_LABELS, r.key, r.key)}
              value={r.value}
              max={maxOf(data.intent_distribution)}
            />
          ))}
        </Panel>

        <Panel title="高频痛点">
          {data.pain_points.length === 0 && <Empty tip="上传沟通记录并解析后可见" />}
          <div className="flex flex-wrap gap-2">
            {data.pain_points.map((r) => {
              const label = `${r.value} · ${r.key}`;
              return (
                <TruncateWithDelayTip
                  key={r.key}
                  text={label}
                  delayMs={280}
                  placement="up"
                  tabIndex={0}
                  className="inline-block max-w-[14rem] rounded-md bg-slate-100 px-2.5 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/35"
                />
              );
            })}
          </div>
        </Panel>

        <Panel title="竞品出现频次">
          {data.competitors.length === 0 && <Empty tip="智能抽取竞品后可见" />}
          {data.competitors.map((r) => (
            <Bar key={r.key} label={r.key} value={r.value} max={maxOf(data.competitors)} />
          ))}
          {data.competitors.length > 0 && (
            <div className="mt-2 text-right">
              <AppLink href="/competitors" className="text-sm text-[var(--color-accent)]">
                打开竞品库
              </AppLink>
            </div>
          )}
        </Panel>

        <Panel title="赢输复盘">
          {data.reviews.length === 0 && <Empty tip="商机成交/流失后提交复盘可见" />}
          {data.reviews.map((r, i) => (
            <div
              key={`${r.key}-${r.reason}-${i}`}
              className="flex justify-between gap-2 py-1 text-sm"
            >
              <span className="flex flex-wrap items-center gap-2">
                <StatusTag kind="stage" value={r.key} />
                <span>{r.reason || "未分类"}</span>
              </span>
              <span className="shrink-0 font-semibold">{r.value}</span>
            </div>
          ))}
        </Panel>

        <Panel title="行业分布">
          {data.customers_by_industry.length === 0 && <Empty />}
          {data.customers_by_industry.map((r) => (
            <Bar
              key={r.key}
              label={r.key}
              value={r.value}
              max={maxOf(data.customers_by_industry)}
            />
          ))}
        </Panel>

        <Panel title="来源分布">
          {data.customers_by_source.length === 0 && <Empty />}
          {data.customers_by_source.map((r) => (
            <Bar
              key={r.key}
              label={r.key}
              value={r.value}
              max={maxOf(data.customers_by_source)}
            />
          ))}
        </Panel>

        <Panel title="近 14 天跟进频次">
          {data.follow_ups_14d.length === 0 && <Empty />}
          {data.follow_ups_14d.map((r) => (
            <Bar
              key={r.key}
              label={r.key.slice(5)}
              value={r.value}
              max={maxOf(data.follow_ups_14d)}
            />
          ))}
        </Panel>

        <Panel title="上传解析状态">
          {data.upload_stats.length === 0 && <Empty />}
          {data.upload_stats.map((r) => (
            <div key={r.key} className="flex justify-between py-1 text-sm">
              <StatusTag kind="media" value={r.key} />
              <span className="font-semibold">{r.value}</span>
            </div>
          ))}
        </Panel>
      </div>

      <Panel title="最近洞察">
        <ul className="space-y-2">
          {data.recent_insights.map((ins) => (
            <li
              key={ins.id}
              className="rounded-lg border border-[var(--color-border)] p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
                <FollowTypeTag type={ins.kind} labels={MEDIA_KIND_LABELS} />
                <span>{new Date(ins.created_at).toLocaleString("zh-CN")}</span>
                {ins.customer_id && (
                  <AppLink
                    href={`/customers/${ins.customer_public_id || ins.customer_id}`}
                    className="font-medium text-[var(--color-accent)]"
                  >
                    {ins.customer_name || "客户"}
                  </AppLink>
                )}
              </div>
              <div className="mt-1">{ins.summary || "无摘要"}</div>
            </li>
          ))}
          {data.recent_insights.length === 0 && <Empty />}
        </ul>
      </Panel>
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
