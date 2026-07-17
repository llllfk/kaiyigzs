"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@kaiyi.local");
  const [password, setPassword] = useState("Admin123!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "登录失败");
        return;
      }
      const role = json.data?.role;
      router.replace(role === "super_admin" ? "/platform" : "/dashboard");
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
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
      <div className="relative mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
        <form onSubmit={onSubmit} className="surface w-full p-6 md:p-8">
          <div className="mb-6">
            <div className="text-sm font-semibold text-[var(--color-accent)]">凯艺</div>
            <h1 className="mt-1 text-2xl font-bold">销售 CRM 登录</h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              支持电脑 / 平板 / 手机访问
            </p>
          </div>
          <div className="field mb-4">
            <label htmlFor="email">邮箱</label>
            <input
              id="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
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
          <p className="mt-4 text-xs text-[var(--color-muted)]">
            初始化后默认超管：admin@kaiyi.local / Admin123!
          </p>
        </form>
      </div>
    </div>
  );
}
