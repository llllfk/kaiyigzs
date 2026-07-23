"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { DatePicker } from "@/components/ui/DatePicker";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { TruncateWithDelayTip } from "@/components/ui/DelayedTooltip";
import { VoicesWorkspace } from "@/components/voices/VoicesWorkspace";
import { EMPTY_PAGE_META, pageRowNo, type PageMeta } from "@/lib/pagination";
import { auditActionLabel, lastNDaysRange } from "@/lib/audit-labels";
import { canViewAllCompanyVoiceLogs } from "@/lib/role-access";
import { cn, formatDateTime, formatSynthDurationSec } from "@/lib/utils";
import { useSessionUser } from "@/components/shared/SessionUserContext";
import { CollapsibleListFilters } from "@/components/ui/CollapsibleListFilters";

type TabKey = "voices" | "synth" | "train";

type SynthRow = {
  id: number;
  user_name?: string | null;
  source: string;
  source_label: string;
  speaker_label?: string | null;
  official_speaker_id?: string | null;
  text_content: string;
  context_text?: string | null;
  status: string;
  error_message?: string | null;
  duration_sec?: number | null;
  saved: boolean;
  created_at: string;
};

type TrainRow = {
  id: number;
  action: string;
  summary: string | null;
  actor_name?: string | null;
  created_at: string;
};

type ActorOption = { id: number; name: string };

function SummaryCell({ text }: { text: string | null | undefined }) {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return <span>—</span>;
  return <TruncateWithDelayTip text={t} className="block max-w-full" />;
}

function defaultRange() {
  return lastNDaysRange(7);
}

const TRAIN_ACTION_OPTIONS = [
  { value: "", label: "全部动作" },
  { value: "voice.train", label: "训练复刻音色" },
  { value: "voice.platform_assign", label: "平台分配 Speaker" },
  { value: "voice.platform_update", label: "平台更新配置" },
  { value: "voice.delete", label: "删除复刻音色" },
  { value: "voice.create", label: "创建复刻音色" },
];

export default function VoiceRecordsPage() {
  const me = useSessionUser();
  const range0 = useMemo(() => defaultRange(), []);
  const [tab, setTab] = useState<TabKey>("voices");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [synthList, setSynthList] = useState<SynthRow[]>([]);
  const [trainList, setTrainList] = useState<TrainRow[]>([]);
  const [actors, setActors] = useState<ActorOption[]>([]);

  const viewAll = canViewAllCompanyVoiceLogs(me || "sales");

  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [saved, setSaved] = useState("");
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(range0.from);
  const [to, setTo] = useState(range0.to);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_PAGE_META);

  const actorOptions = useMemo(
    () => [
      { value: "", label: "全部人员" },
      { value: "system", label: "系统" },
      ...actors.map((a) => ({ value: String(a.id), label: a.name })),
    ],
    [actors]
  );

  const loadActors = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) {
        setActors(
          json.data.map((u: { id: number; name: string }) => ({
            id: Number(u.id),
            name: u.name,
          }))
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (viewAll) void loadActors();
  }, [viewAll, loadActors]);

  const load = useCallback(
    async (opts?: {
      tab?: TabKey;
      page?: number;
      pageSize?: number;
      source?: string;
      status?: string;
      saved?: string;
      action?: string;
      actorId?: string;
      q?: string;
      from?: string;
      to?: string;
    }) => {
      const t = opts?.tab ?? tab;
      if (t === "voices") return;

      const p = opts?.page ?? page;
      const size = opts?.pageSize ?? pageSize;
      const f = opts?.from ?? from;
      const end = opts?.to ?? to;
      const keyword = opts?.q ?? q;

      setLoading(true);
      try {
        if (f && end && f > end) {
          setError("开始日期不能晚于结束日期");
          return;
        }

        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(size),
        });
        if (f) params.set("from", f);
        if (end) params.set("to", end);
        if (keyword.trim()) params.set("q", keyword.trim());

        if (t === "synth") {
          const src = opts?.source ?? source;
          const st = opts?.status ?? status;
          const sv = opts?.saved ?? saved;
          if (src) params.set("source", src);
          if (st) params.set("status", st);
          if (sv) params.set("saved", sv);
          const res = await fetch(`/api/voices/synth-logs?${params}`);
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(json.error || "加载失败");
            return;
          }
          setError("");
          setSynthList(json.data || []);
          if (json.meta) {
            const nextMeta: PageMeta = {
              total: Number(json.meta.total) || 0,
              page: Number(json.meta.page) || p,
              pageSize: Number(json.meta.pageSize) || size,
              totalPages: Math.max(1, Number(json.meta.totalPages) || 1),
            };
            setMeta(nextMeta);
            if (nextMeta.page !== p) setPage(nextMeta.page);
          }
        } else {
          const act = opts?.action ?? action;
          const aid = opts?.actorId ?? actorId;
          if (act) params.set("action", act);
          if (aid) params.set("actor_id", aid);
          const res = await fetch(`/api/voices/train-logs?${params}`);
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(json.error || "加载失败");
            return;
          }
          setError("");
          setTrainList(json.data || []);
          if (json.meta) {
            const nextMeta: PageMeta = {
              total: Number(json.meta.total) || 0,
              page: Number(json.meta.page) || p,
              pageSize: Number(json.meta.pageSize) || size,
              totalPages: Math.max(1, Number(json.meta.totalPages) || 1),
            };
            setMeta(nextMeta);
            if (nextMeta.page !== p) setPage(nextMeta.page);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [
      tab,
      page,
      pageSize,
      from,
      to,
      q,
      source,
      status,
      saved,
      action,
      actorId,
    ]
  );

  useEffect(() => {
    if (tab === "voices") return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, pageSize]);

  function switchTab(next: TabKey) {
    if (next === tab) return;
    setTab(next);
    setPage(1);
    setError("");
  }

  function onSearch() {
    if (page === 1) void load({ page: 1 });
    else setPage(1);
  }

  function resetFilters() {
    const r = defaultRange();
    setSource("");
    setStatus("");
    setSaved("");
    setAction("");
    setActorId("");
    setQ("");
    setFrom(r.from);
    setTo(r.to);
    if (page === 1) {
      void load({
        page: 1,
        source: "",
        status: "",
        saved: "",
        action: "",
        actorId: "",
        q: "",
        from: r.from,
        to: r.to,
      });
    } else setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">声音合成</h1>
        <p className="text-sm text-[var(--color-muted)]">
          {viewAll
            ? "管理本公司复刻音色，查看全员合成明细与训练 / 分配记录"
            : "试听与合成本公司音色，查看本人合成与操作记录"}
        </p>
      </div>

      <div
        className="inline-flex rounded-lg border border-[var(--color-border)] bg-white p-0.5"
        role="tablist"
        aria-label="声音合成分类"
      >
        {(
          [
            { key: "voices", label: "我的音色" },
            { key: "synth", label: "合成明细" },
            { key: "train", label: "训练 / 分配" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition",
              tab === item.key
                ? "bg-slate-900 text-white shadow-sm"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            )}
            onClick={() => switchTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "voices" && <VoicesWorkspace />}

      {tab !== "voices" && (
        <>
          <CollapsibleListFilters
            activeCount={
              tab === "synth"
                ? (source ? 1 : 0) + (status ? 1 : 0) + (saved ? 1 : 0)
                : (action ? 1 : 0) + (viewAll && actorId ? 1 : 0)
            }
            primary={
              <div className="w-full min-w-0 md:w-52 md:min-w-[12rem] md:flex-1 md:max-w-md">
                <input
                  className="input w-full"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={
                    tab === "synth"
                      ? "文案 / 语气 / 音色 / 人员"
                      : "动作 / 摘要 / 人员"
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSearch();
                  }}
                />
              </div>
            }
            secondary={
              <>
                {tab === "synth" ? (
                  <>
                    <div className="field w-36 min-w-[8rem]">
                      <label>来源</label>
                      <Select
                        value={source}
                        onChange={setSource}
                        options={[
                          { value: "", label: "全部来源" },
                          { value: "clone", label: "声音复刻" },
                          { value: "official", label: "官方音色" },
                        ]}
                        placement="auto"
                      />
                    </div>
                    <div className="field w-36 min-w-[8rem]">
                      <label>状态</label>
                      <Select
                        value={status}
                        onChange={setStatus}
                        options={[
                          { value: "", label: "全部状态" },
                          { value: "success", label: "成功" },
                          { value: "failed", label: "失败" },
                        ]}
                        placement="auto"
                      />
                    </div>
                    <div className="field w-36 min-w-[8rem]">
                      <label>已保存</label>
                      <Select
                        value={saved}
                        onChange={setSaved}
                        options={[
                          { value: "", label: "全部" },
                          { value: "1", label: "已保存" },
                          { value: "0", label: "未保存" },
                        ]}
                        placement="auto"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field w-44 min-w-[10rem]">
                      <label>动作</label>
                      <Select
                        value={action}
                        onChange={setAction}
                        options={[...TRAIN_ACTION_OPTIONS]}
                        placement="auto"
                      />
                    </div>
                    {viewAll && (
                      <div className="field w-40 min-w-[9rem]">
                        <label>人员</label>
                        <Select
                          value={actorId}
                          onChange={setActorId}
                          options={actorOptions}
                          searchable
                          placement="auto"
                        />
                      </div>
                    )}
                  </>
                )}
                <div className="field w-40 min-w-[9rem]">
                  <label>开始日期</label>
                  <DatePicker value={from} onChange={setFrom} placeholder="开始" />
                </div>
                <div className="field w-40 min-w-[9rem]">
                  <label>结束日期</label>
                  <DatePicker value={to} onChange={setTo} placeholder="结束" />
                </div>
                <div className="flex flex-wrap items-end gap-2 pb-0.5">
                  <Button variant="secondary" onClick={onSearch}>
                    查询
                  </Button>
                  <Button variant="secondary" onClick={resetFilters}>
                    重置
                  </Button>
                </div>
              </>
            }
          />

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          {loading && (
            <TableSkeleton rows={8} cols={tab === "synth" ? 9 : 5} />
          )}

          {!loading && tab === "synth" && (
            <div className="surface overflow-x-auto">
              <table className="w-full min-w-[64rem] text-sm">
                <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
                  <tr>
                    <th className="w-14 px-4 py-3 font-medium">序号</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      时间
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      操作人
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      来源
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      音色
                    </th>
                    <th className="px-4 py-3 font-medium">文案</th>
                    <th className="px-4 py-3 font-medium">语气</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      状态
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      时长
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      已保存
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {synthList.length === 0 && (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-6 text-[var(--color-muted)]"
                      >
                        暂无合成记录
                      </td>
                    </tr>
                  )}
                  {synthList.map((row, i) => (
                    <tr
                      key={row.id}
                      className="border-t border-[var(--color-border)] align-top"
                    >
                      <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">
                        {pageRowNo(meta, i)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[var(--color-muted)]">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {row.user_name || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {row.source_label}
                      </td>
                      <td className="max-w-[10rem] px-4 py-3">
                        <SummaryCell
                          text={
                            row.speaker_label ||
                            row.official_speaker_id ||
                            null
                          }
                        />
                      </td>
                      <td className="max-w-[14rem] px-4 py-3 text-[var(--color-muted)]">
                        <SummaryCell text={row.text_content} />
                      </td>
                      <td className="max-w-[10rem] px-4 py-3 text-[var(--color-muted)]">
                        <SummaryCell text={row.context_text} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {row.status === "success" ? (
                          <span className="text-emerald-700">成功</span>
                        ) : (
                          <span className="text-red-600">失败</span>
                        )}
                        {row.error_message ? (
                          <div className="mt-1 max-w-[10rem] text-xs text-red-600">
                            <SummaryCell text={row.error_message} />
                          </div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {formatSynthDurationSec(row.duration_sec)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {row.saved ? "是" : "否"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && tab === "train" && (
            <div className="surface overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
                  <tr>
                    <th className="w-14 px-4 py-3 font-medium">序号</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      时间
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      人员
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      动作
                    </th>
                    <th className="px-4 py-3 font-medium">摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {trainList.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-[var(--color-muted)]"
                      >
                        暂无训练 / 分配记录
                      </td>
                    </tr>
                  )}
                  {trainList.map((row, i) => (
                    <tr
                      key={row.id}
                      className="border-t border-[var(--color-border)] align-top"
                    >
                      <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">
                        {pageRowNo(meta, i)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[var(--color-muted)]">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {row.actor_name || "系统"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        {auditActionLabel(row.action)}
                      </td>
                      <td className="max-w-[20rem] px-4 py-3 text-[var(--color-muted)]">
                        <SummaryCell text={row.summary} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <PaginationBar
            meta={meta}
            pageSize={pageSize}
            loading={loading}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}
