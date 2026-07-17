"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type Competitor = {
  id: number;
  name: string;
  summary: string | null;
  strengths: string | null;
  weaknesses: string | null;
  playbook: string | null;
  mention_count?: number;
};

export default function CompetitorsPage() {
  const [list, setList] = useState<Competitor[]>([]);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [playbook, setPlaybook] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/competitors");
    const json = await res.json();
    if (!res.ok) setError(json.error || "加载失败");
    else setList(json.data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/competitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, summary, playbook }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "创建失败");
      return;
    }
    setName("");
    setSummary("");
    setPlaybook("");
    await load();
  }

  async function remove(id: number) {
    const res = await fetch(`/api/competitors?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) setError(json.error || "删除失败");
    else await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">竞品库</h1>
        <p className="text-sm text-[var(--color-muted)]">
          可手工维护；AI 解析沟通记录时也会自动抽取并沉淀草稿
        </p>
      </div>

      <form onSubmit={create} className="surface grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
        <div className="field">
          <label>竞品名称</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>简介</label>
          <input className="input" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div className="field md:col-span-2">
          <label>应对话术</label>
          <textarea
            className="input textarea"
            value={playbook}
            onChange={(e) => setPlaybook(e.target.value)}
          />
        </div>
        <Button type="submit">添加竞品</Button>
      </form>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {list.map((c) => (
          <div key={c.id} className="surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="mt-1 text-xs text-[var(--color-muted)]">
                  提及 {c.mention_count || 0} 次
                </div>
              </div>
              <Button variant="danger" onClick={() => remove(c.id)}>
                删除
              </Button>
            </div>
            {c.summary && <p className="mt-2 text-sm">{c.summary}</p>}
            {c.playbook && (
              <p className="mt-2 text-sm text-[var(--color-muted)]">话术：{c.playbook}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
