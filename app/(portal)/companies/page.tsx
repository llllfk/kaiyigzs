"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type Company = {
  id: number;
  name: string;
  status: string;
  user_count?: number;
  admin_name?: string;
};

export default function CompaniesPage() {
  const [list, setList] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("Admin123!");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/companies");
    const json = await res.json();
    if (!res.ok) setError(json.error || "加载失败");
    else setList(json.data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        admin_name: adminName,
        admin_email: adminEmail,
        admin_password: adminPassword,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "创建失败");
      return;
    }
    setMsg(`已创建公司，管理员 ${adminEmail}`);
    setName("");
    setAdminName("");
    setAdminEmail("");
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">公司管理</h1>
        <p className="text-sm text-[var(--color-muted)]">超级管理员创建公司并指定唯一公司管理员</p>
      </div>

      <form onSubmit={createCompany} className="surface grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
        <div className="field md:col-span-2">
          <label>公司名称</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>管理员姓名</label>
          <input className="input" value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
        </div>
        <div className="field">
          <label>管理员邮箱</label>
          <input className="input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
        </div>
        <div className="field md:col-span-2">
          <label>管理员初始密码</label>
          <input className="input" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required />
        </div>
        <Button type="submit">创建公司</Button>
      </form>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      {msg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}

      <div className="grid gap-3 md:grid-cols-2">
        {list.map((c) => (
          <div key={c.id} className="surface p-4">
            <div className="font-semibold">{c.name}</div>
            <div className="mt-1 text-sm text-[var(--color-muted)]">
              状态 {c.status} · 成员 {c.user_count ?? 0} · 管理员 {c.admin_name || "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
