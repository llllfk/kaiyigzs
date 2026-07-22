"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useUi } from "@/components/ui/Feedback";

const DEMO_ACCOUNTS = [
  {
    label: "超级管理员",
    hint: "平台菜单",
    email: "admin@kaiyi.local",
    phone: "13800000001",
    password: "Admin123!",
  },
  {
    label: "公司管理员",
    hint: "完整业务菜单",
    email: "company@kaiyi.local",
    phone: "13800000002",
    password: "Company123!",
  },
  {
    label: "销售经理",
    hint: "团队业务菜单",
    email: "manager@kaiyi.local",
    phone: "13800000003",
    password: "Manager123!",
  },
  {
    label: "销售",
    hint: "个人业务菜单",
    email: "sales@kaiyi.local",
    phone: "13800000004",
    password: "Sales123!",
  },
] as const;

export default function LoginPage() {
  const ui = useUi();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeEmail, setActiveEmail] = useState("");

  function fillAccount(item: (typeof DEMO_ACCOUNTS)[number]) {
    setAccount(item.phone);
    setPassword(item.password);
    setActiveEmail(item.email);
    setError("");
    ui.toast({
      kind: "info",
      title: "已填入账号",
      description: `${item.label}（也可用邮箱 ${item.email}）`,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "登录失败");
        ui.error("登录失败", json.error || "请检查账号密码");
        setLoading(false);
        return;
      }
      const role = json.data?.role;
      const next = role === "super_admin" ? "/platform" : "/dashboard";
      // 硬跳转进业务页，比软导航 + refresh 更快稳定
      window.location.assign(next);
    } catch {
      setError("网络错误");
      ui.error("网络错误", "请稍后重试");
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 10% -10%, #93c5fd55, transparent), radial-gradient(900px 500px at 100% 0%, #1e3a5f22, transparent), #f0f4f8",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-lg items-center px-4 py-8">
        <form onSubmit={onSubmit} className="surface w-full p-5 md:p-7">
          <div className="mb-5">
            <div className="text-sm font-semibold text-[var(--color-accent)]">凯艺</div>
            <h1 className="mt-1 text-2xl font-bold">销售 CRM 登录</h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              支持手机号或邮箱登录；点击下方账号可自动填入
            </p>
          </div>

          <div className="mb-5">
            <div className="mb-2 text-xs font-semibold text-[var(--color-muted)]">
              演示账号（共 4 个）
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((item) => {
                const selected = activeEmail === item.email;
                return (
                  <button
                    key={item.email}
                    type="button"
                    onClick={() => fillAccount(item)}
                    className={`rounded-lg border px-3 py-3 text-left transition ${
                      selected
                        ? "border-[var(--color-accent)] bg-[#eff6ff] ring-2 ring-[var(--color-accent)]/20"
                        : "border-[var(--color-border)] bg-white hover:border-[var(--color-accent)] hover:bg-[#eff6ff]"
                    }`}
                  >
                    <div className="text-sm font-semibold">{item.label}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--color-accent)]">
                      {item.hint}
                    </div>
                    <div className="mt-1 break-all text-xs text-[var(--color-muted)]">
                      手机：{item.phone}
                    </div>
                    <div className="text-xs text-[var(--color-muted)]">{item.email}</div>
                    <div className="text-xs text-[var(--color-muted)]">
                      密码：{item.password}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field mb-3">
            <label htmlFor="account">手机号 / 邮箱</label>
            <input
              id="account"
              className="input"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
              placeholder="手机号或邮箱"
              required
            />
          </div>
          <div className="field mb-4">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "登录中…" : "登录"}
          </Button>
        </form>
      </div>
    </div>
  );
}
