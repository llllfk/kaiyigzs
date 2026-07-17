"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type Log = {
  id: number;
  action: string;
  summary: string | null;
  actor_name?: string;
  created_at: string;
  target_type?: string;
  target_id?: string;
};

export default function AuditPage() {
  const [list, setList] = useState<Log[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  async function load(keyword = q) {
    const res = await fetch(`/api/audit-logs?q=${encodeURIComponent(keyword)}`);
    const json = await res.json();
    if (!res.ok) setError(json.error || "加载失败");
    else setList(json.data || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">审计日志</h1>
          <p className="text-sm text-[var(--color-muted)]">关键写操作可追溯</p>
        </div>
        <div className="flex gap-2">
          <input className="input max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索动作/摘要" />
          <Button variant="secondary" onClick={() => load(q)}>
            搜索
          </Button>
        </div>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      <ul className="space-y-2">
        {list.map((l) => (
          <li key={l.id} className="surface p-4 text-sm">
            <div className="font-medium">{l.action}</div>
            <div className="mt-1 text-[var(--color-muted)]">
              {l.actor_name || "系统"} · {new Date(l.created_at).toLocaleString("zh-CN")}
              {l.target_type ? ` · ${l.target_type}#${l.target_id}` : ""}
            </div>
            {l.summary && <div className="mt-1">{l.summary}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
