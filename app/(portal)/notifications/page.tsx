"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

type Notice = {
  id: number;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export default function NotificationsPage() {
  const [list, setList] = useState<Notice[]>([]);

  async function load() {
    const res = await fetch("/api/notifications");
    const json = await res.json();
    if (res.ok) setList(json.data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function markAll() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    await load();
  }

  async function markOne(id: number) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">通知</h1>
          <p className="text-sm text-[var(--color-muted)]">站内通知中心</p>
        </div>
        <Button variant="secondary" onClick={markAll}>
          全部已读
        </Button>
      </div>
      <ul className="space-y-2">
        {list.map((n) => (
          <li
            key={n.id}
            className={`surface p-4 ${!n.read_at ? "border-[var(--color-accent)]" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{n.title}</div>
                {n.body && <div className="mt-1 text-sm text-[var(--color-muted)]">{n.body}</div>}
                <div className="mt-1 text-xs text-[var(--color-muted)]">
                  {new Date(n.created_at).toLocaleString("zh-CN")}
                </div>
              </div>
              <div className="flex gap-2">
                {!n.read_at && (
                  <Button variant="secondary" onClick={() => markOne(n.id)}>
                    已读
                  </Button>
                )}
                {n.link && (
                  <Link href={n.link} className="btn btn-primary">
                    查看
                  </Link>
                )}
              </div>
            </div>
          </li>
        ))}
        {list.length === 0 && (
          <li className="text-sm text-[var(--color-muted)]">暂无通知</li>
        )}
      </ul>
    </div>
  );
}
