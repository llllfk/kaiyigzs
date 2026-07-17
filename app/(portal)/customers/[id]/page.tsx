"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { STAGE_LABELS } from "@/types";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [followType, setFollowType] = useState("call");
  const [followContent, setFollowContent] = useState("");
  const [followDate, setFollowDate] = useState("");
  const [followTime, setFollowTime] = useState("09:00");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [oppTitle, setOppTitle] = useState("");
  const [oppStage, setOppStage] = useState("lead");
  const [oppDate, setOppDate] = useState("");

  async function load() {
    const res = await fetch(`/api/customers/${id}`);
    const json = await res.json();
    if (!res.ok) setError(json.error || "加载失败");
    else setData(json.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addFollow(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: Number(id),
        type: followType,
        content: followContent,
        date: followDate || undefined,
        time: followTime || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "跟进失败");
      return;
    }
    setFollowContent("");
    await load();
  }

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: Number(id),
        name: contactName,
        phone: contactPhone,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "创建联系人失败");
      return;
    }
    setContactName("");
    setContactPhone("");
    await load();
  }

  async function addOpp(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: Number(id),
        title: oppTitle,
        stage: oppStage,
        expected_close_date: oppDate || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "创建商机失败");
      return;
    }
    setOppTitle("");
    await load();
  }

  if (!data && !error) {
    return <div className="text-[var(--color-muted)]">加载中…</div>;
  }
  if (error && !data) {
    return <div className="text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{data.name}</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {data.industry || "未填行业"} · 负责人 {data.owner_name || "—"} · 来源{" "}
          {data.source || "—"}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="surface space-y-4 p-4 xl:col-span-2">
          <h2 className="font-semibold">跟进时间线</h2>
          <form onSubmit={addFollow} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="field">
              <label>跟进方式</label>
              <Select
                value={followType}
                onChange={setFollowType}
                options={[
                  { value: "call", label: "电话" },
                  { value: "wechat", label: "微信" },
                  { value: "visit", label: "拜访" },
                  { value: "email", label: "邮件" },
                ]}
              />
            </div>
            <div className="field">
              <label>日期</label>
              <DatePicker value={followDate} onChange={setFollowDate} />
            </div>
            <div className="field">
              <label>时间</label>
              <TimePicker value={followTime} onChange={setFollowTime} />
            </div>
            <div className="field md:col-span-2">
              <label>内容</label>
              <textarea
                className="input textarea"
                value={followContent}
                onChange={(e) => setFollowContent(e.target.value)}
                required
              />
            </div>
            <Button type="submit">添加跟进</Button>
          </form>

          <ul className="space-y-3">
            {(data.follow_ups || []).map((f: any) => (
              <li key={f.id} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="text-xs text-[var(--color-muted)]">
                  {f.type} · {f.owner_name} · {new Date(f.followed_at).toLocaleString("zh-CN")}
                </div>
                <div className="mt-1 text-sm whitespace-pre-wrap">{f.content}</div>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-4">
          <section className="surface p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">AI 画像 / 洞察</h2>
              <div className="flex gap-2 text-sm">
                <a href="/knowledge" className="text-[var(--color-accent)]">
                  知识问答
                </a>
                <a href="/uploads" className="text-[var(--color-accent)]">
                  去上传
                </a>
              </div>
            </div>
            {data.profile_json && Object.keys(data.profile_json).length > 0 ? (
              <div className="space-y-2 text-sm">
                <div>
                  意向：
                  <span className="font-semibold text-[var(--color-accent)]">
                    {String(data.profile_json.intent || "—")}
                  </span>
                  {" · "}情感 {String(data.profile_json.sentiment || "—")}
                </div>
                {data.profile_json.last_summary && (
                  <p className="text-[var(--color-muted)]">
                    {String(data.profile_json.last_summary)}
                  </p>
                )}
                {Array.isArray(data.profile_json.pain_points) &&
                  data.profile_json.pain_points.length > 0 && (
                    <div>
                      <div className="text-xs text-[var(--color-muted)]">痛点</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {data.profile_json.pain_points.map((p: string) => (
                          <span
                            key={p}
                            className="rounded-full bg-slate-100 px-2 py-1 text-xs"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                {Array.isArray(data.profile_json.competitors) &&
                  data.profile_json.competitors.length > 0 && (
                    <div>
                      <div className="text-xs text-[var(--color-muted)]">竞品</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {data.profile_json.competitors.map((p: string) => (
                          <span
                            key={p}
                            className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                {data.profile_json.stage_suggestion && (
                  <div className="text-xs text-[var(--color-muted)]">
                    阶段建议：{String(data.profile_json.stage_suggestion)}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">
                暂无画像。上传通话/微信记录后自动生成。
              </p>
            )}

            <ul className="mt-4 space-y-2 border-t border-[var(--color-border)] pt-3">
              {(data.insights || []).slice(0, 5).map((ins: any) => (
                <li key={ins.id} className="rounded border border-[var(--color-border)] p-2 text-xs">
                  <div className="text-[var(--color-muted)]">
                    {ins.kind} · {new Date(ins.created_at).toLocaleString("zh-CN")}
                  </div>
                  <div className="mt-1">{ins.summary || "无摘要"}</div>
                </li>
              ))}
            </ul>
          </section>

          <section className="surface p-4">
            <h2 className="mb-3 font-semibold">联系人</h2>
            <form onSubmit={addContact} className="mb-3 space-y-2">
              <input
                className="input"
                placeholder="姓名"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
              />
              <input
                className="input"
                placeholder="手机"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
              <Button type="submit" className="w-full" variant="secondary">
                添加联系人
              </Button>
            </form>
            <ul className="space-y-2 text-sm">
              {(data.contacts || []).map((c: any) => (
                <li key={c.id} className="rounded border border-[var(--color-border)] px-3 py-2">
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </li>
              ))}
            </ul>
          </section>

          <section className="surface p-4">
            <h2 className="mb-3 font-semibold">商机</h2>
            <form onSubmit={addOpp} className="mb-3 space-y-2">
              <input
                className="input"
                placeholder="商机标题"
                value={oppTitle}
                onChange={(e) => setOppTitle(e.target.value)}
                required
              />
              <Select
                value={oppStage}
                onChange={setOppStage}
                options={Object.entries(STAGE_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
              <DatePicker value={oppDate} onChange={setOppDate} placeholder="预计成交日" />
              <Button type="submit" className="w-full" variant="secondary">
                创建商机
              </Button>
            </form>
            <ul className="space-y-2 text-sm">
              {(data.opportunities || []).map((o: any) => (
                <li key={o.id} className="rounded border border-[var(--color-border)] px-3 py-2">
                  <div className="font-medium">{o.title}</div>
                  <div className="text-xs text-[var(--color-muted)]">
                    {STAGE_LABELS[o.stage as keyof typeof STAGE_LABELS] || o.stage}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
