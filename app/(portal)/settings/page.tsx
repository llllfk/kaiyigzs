"use client";

import { useEffect, useState } from "react";
import { ROLE_LABELS, type SessionUser } from "@/types";

export default function SettingsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setUser(j.data || null));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-sm text-[var(--color-muted)]">个人与公司基础信息</p>
      </div>
      <div className="surface max-w-xl space-y-3 p-5">
        {user ? (
          <>
            <Row label="姓名" value={user.name} />
            <Row label="邮箱" value={user.email} />
            <Row label="角色" value={ROLE_LABELS[user.role]} />
            <Row label="公司 ID" value={user.company_id ? String(user.company_id) : "平台"} />
          </>
        ) : (
          <div className="text-[var(--color-muted)]">加载中…</div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] py-2 last:border-0">
      <span className="text-sm text-[var(--color-muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
