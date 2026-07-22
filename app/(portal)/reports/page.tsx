"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { useSessionUser } from "@/components/shared/SessionUserContext";
import { useUi } from "@/components/ui/Feedback";
import { downloadBlob } from "@/lib/download-export";

type History = {
  id: number;
  period_type: string;
  period_key: string;
  scope: string;
  file_name: string;
  file_size: number;
  created_at: string;
  owner_name?: string;
  creator_name?: string;
};

type Person = { id: number; name: string };

function currentKey(type: "month" | "quarter") {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return type === "month"
    ? `${y}-${String(m).padStart(2, "0")}`
    : `${y}-Q${Math.ceil(m / 3)}`;
}

export default function ReportsPage() {
  const me = useSessionUser();
  const ui = useUi();
  const manager =
    me.role === "company_admin" ||
    me.role === "sales_manager" ||
    Boolean(me.act_as_company_id);

  const [type, setType] = useState<"month" | "quarter">("month");
  const [key, setKey] = useState(currentKey("month"));
  const [owner, setOwner] = useState(manager ? "all" : String(me.id));
  const [people, setPeople] = useState<Person[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        fetch("/api/reports/people"),
        fetch("/api/reports"),
      ]);
      const aj = await a.json();
      const bj = await b.json();
      if (!a.ok || !b.ok) {
        throw new Error(aj.error || bj.error || "加载失败");
      }
      setPeople(aj.data || []);
      setHistory(bj.data || []);
    } catch (e) {
      ui.error("加载失败", e instanceof Error ? e.message : "");
    } finally {
      setLoading(false);
    }
  }, [ui]);

  useEffect(() => {
    void load();
  }, [load]);

  const periods = useMemo(() => {
    const rows: { value: string; label: string }[] = [];
    const now = new Date();
    if (type === "month") {
      for (let i = 0; i < 36; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        rows.push({ value: v, label: `${d.getFullYear()}年${d.getMonth() + 1}月` });
      }
    } else {
      let y = now.getFullYear();
      let q = Math.ceil((now.getMonth() + 1) / 3);
      for (let i = 0; i < 16; i++) {
        rows.push({ value: `${y}-Q${q}`, label: `${y}年第${q}季度` });
        q -= 1;
        if (q === 0) {
          q = 4;
          y -= 1;
        }
      }
    }
    return rows;
  }, [type]);

  function changeType(next: "month" | "quarter") {
    setType(next);
    setKey(currentKey(next));
  }

  async function generate() {
    setGenerating(true);
    try {
      const r = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_type: type,
          period_key: key,
          owner_id: owner === "all" ? null : Number(owner),
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "生成失败");
      }
      const blob = await r.blob();
      const cd = r.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const rawName = match?.[1] || match?.[2] || "";
      const fileName = rawName
        ? decodeURIComponent(rawName)
        : `经营报表-${key}.xlsx`;
      downloadBlob(blob, fileName);
      ui.success("报表已生成", "已开始下载，并已写入生成记录");
      await load();
    } catch (e) {
      ui.error("生成失败", e instanceof Error ? e.message : "");
    } finally {
      setGenerating(false);
    }
  }

  const ownerOptions = [
    ...(manager ? [{ value: "all", label: "全公司" }] : []),
    ...people.map((p) => ({ value: String(p.id), label: p.name })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">经营报表</h1>
        <p className="text-sm text-[var(--color-muted)]">
          按月或季度生成经营数据 Excel；生成后直接下载，本地仅保留生成记录。
        </p>
      </div>

      <section className="surface p-4 md:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="field w-full sm:w-auto">
            <label>报表类型</label>
            <div
              className="inline-flex rounded-lg border border-[var(--color-border)] bg-white p-0.5"
              role="group"
              aria-label="报表类型"
            >
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  type === "month"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                }`}
                aria-pressed={type === "month"}
                onClick={() => changeType("month")}
              >
                月度
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  type === "quarter"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                }`}
                aria-pressed={type === "quarter"}
                onClick={() => changeType("quarter")}
              >
                季度
              </button>
            </div>
          </div>

          <div className="field w-44 max-w-full shrink-0">
            <label>统计周期</label>
            <Select value={key} onChange={setKey} options={periods} />
          </div>

          {manager && (
            <div className="field w-44 max-w-full shrink-0">
              <label>数据范围</label>
              <Select
                value={owner}
                onChange={setOwner}
                options={ownerOptions}
              />
            </div>
          )}

          <Button onClick={() => void generate()} disabled={generating || loading}>
            {generating ? "正在生成…" : "生成 Excel"}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">生成记录</h2>
        {loading && history.length === 0 ? (
          <TableSkeleton rows={6} cols={4} />
        ) : (
          <div className="surface overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">文件</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">范围</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">生成人</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">生成时间</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-[var(--color-muted)]"
                    >
                      暂无生成记录
                    </td>
                  </tr>
                )}
                {history.map((x) => (
                  <tr
                    key={x.id}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{x.file_name}</div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {(Number(x.file_size) / 1024).toFixed(1)} KB
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {x.owner_name || "全公司"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {x.creator_name || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {new Date(x.created_at).toLocaleString("zh-CN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
