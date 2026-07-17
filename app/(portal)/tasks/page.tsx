"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";

type Task = {
  id: number;
  title: string;
  status: string;
  source: string;
  due_at: string | null;
  customer_name?: string;
};

export default function TasksPage() {
  const [list, setList] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/tasks");
    const json = await res.json();
    if (!res.ok) setError(json.error || "加载失败");
    else setList(json.data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    const due_at = date ? `${date}T${time || "18:00"}:00` : null;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, due_at }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "创建失败");
      return;
    }
    setTitle("");
    await load();
  }

  async function markDone(id: number) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "done" }),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">待办</h1>
        <p className="text-sm text-[var(--color-muted)]">手动待办；P1 起 AI 解析将自动生成</p>
      </div>

      <form onSubmit={createTask} className="surface grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
        <div className="field md:col-span-2">
          <label>标题</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="field">
          <label>截止日期</label>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div className="field">
          <label>截止时间</label>
          <TimePicker value={time} onChange={setTime} />
        </div>
        <Button type="submit" className="md:col-span-4 md:w-auto md:justify-self-start">
          新建待办
        </Button>
      </form>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      <ul className="space-y-2">
        {list.map((t) => (
          <li key={t.id} className="surface flex items-center justify-between gap-3 p-4">
            <div>
              <div className="font-medium">
                {t.title}
                {t.source === "ai" && (
                  <span className="ml-2 text-xs text-[var(--color-accent)]">AI</span>
                )}
              </div>
              <div className="text-xs text-[var(--color-muted)]">
                {t.status} · {t.customer_name || "未关联客户"} ·{" "}
                {t.due_at ? new Date(t.due_at).toLocaleString("zh-CN") : "无截止"}
              </div>
            </div>
            {t.status !== "done" && (
              <Button variant="secondary" onClick={() => markDone(t.id)}>
                完成
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
