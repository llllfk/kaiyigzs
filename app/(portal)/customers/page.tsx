"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

type Customer = {
  id: number;
  name: string;
  industry: string | null;
  source: string | null;
  status: string;
  owner_name?: string;
};

export default function CustomersPage() {
  const [list, setList] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(keyword = q) {
    setLoading(true);
    const res = await fetch(`/api/customers?q=${encodeURIComponent(keyword)}`);
    const json = await res.json();
    if (!res.ok) setError(json.error || "加载失败");
    else setList(json.data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, industry, source }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "创建失败");
      return;
    }
    setName("");
    setIndustry("");
    setSource("");
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">客户</h1>
          <p className="text-sm text-[var(--color-muted)]">按权限范围查看与管理客户</p>
        </div>
        <div className="flex gap-2">
          <input
            className="input max-w-xs"
            placeholder="搜索客户"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button variant="secondary" onClick={() => load(q)}>
            搜索
          </Button>
        </div>
      </div>

      <form onSubmit={createCustomer} className="surface grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
        <div className="field md:col-span-1">
          <label>客户名称</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>行业</label>
          <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </div>
        <div className="field">
          <label>来源</label>
          <Select
            value={source}
            onChange={setSource}
            placeholder="选择来源"
            options={[
              { value: "", label: "未选择" },
              { value: "线上咨询", label: "线上咨询" },
              { value: "转介绍", label: "转介绍" },
              { value: "展会", label: "展会" },
              { value: "电话拓客", label: "电话拓客" },
            ]}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            新建客户
          </Button>
        </div>
      </form>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {/* Desktop table */}
      <div className="surface hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">行业</th>
              <th className="px-4 py-3 font-medium">来源</th>
              <th className="px-4 py-3 font-medium">负责人</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-[var(--color-muted)]">
                  加载中…
                </td>
              </tr>
            )}
            {!loading && list.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-[var(--color-muted)]">
                  暂无客户
                </td>
              </tr>
            )}
            {list.map((c) => (
              <tr key={c.id} className="border-t border-[var(--color-border)] hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link className="font-medium text-[var(--color-accent)]" href={`/customers/${c.id}`}>
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{c.industry || "—"}</td>
                <td className="px-4 py-3">{c.source || "—"}</td>
                <td className="px-4 py-3">{c.owner_name || "—"}</td>
                <td className="px-4 py-3">{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {list.map((c) => (
          <Link key={c.id} href={`/customers/${c.id}`} className="surface block p-4">
            <div className="font-semibold">{c.name}</div>
            <div className="mt-1 text-xs text-[var(--color-muted)]">
              {c.industry || "未填行业"} · {c.source || "未填来源"} · {c.owner_name || "—"}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
