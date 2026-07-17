"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ROLE_LABELS, type UserRole } from "@/types";

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  manager_id: number | null;
};

export default function TeamPage() {
  const [list, setList] = useState<UserRow[]>([]);
  const [me, setMe] = useState<{ role: UserRole } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("sales");
  const [password, setPassword] = useState("Sales123!");
  const [error, setError] = useState("");

  async function load() {
    const [usersRes, meRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/auth/me"),
    ]);
    const usersJson = await usersRes.json();
    const meJson = await meRes.json();
    if (!usersRes.ok) setError(usersJson.error || "加载失败");
    else setList(usersJson.data || []);
    if (meRes.ok) setMe(meJson.data);
  }

  useEffect(() => {
    load();
  }, []);

  const roleOptions =
    me?.role === "company_admin"
      ? [
          { value: "sales_manager", label: "销售经理" },
          { value: "sales", label: "销售" },
        ]
      : [{ value: "sales", label: "销售" }];

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role, password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "创建失败");
      return;
    }
    setName("");
    setEmail("");
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">团队</h1>
        <p className="text-sm text-[var(--color-muted)]">
          公司管理员可创建经理与销售；销售经理可创建下属销售
        </p>
      </div>

      <form onSubmit={createUser} className="surface grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
        <div className="field">
          <label>姓名</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>邮箱</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>角色</label>
          <Select value={role} onChange={setRole} options={roleOptions} />
        </div>
        <div className="field">
          <label>初始密码</label>
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" className="md:col-span-2 md:w-auto md:justify-self-start">
          创建账号
        </Button>
      </form>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      <div className="surface overflow-hidden">
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3">姓名</th>
                <th className="px-4 py-3">邮箱</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3">{ROLE_LABELS[u.role]}</td>
                  <td className="px-4 py-3">{u.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 p-3 md:hidden">
          {list.map((u) => (
            <div key={u.id} className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-[var(--color-muted)]">
                {u.email} · {ROLE_LABELS[u.role]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
