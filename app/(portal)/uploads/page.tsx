"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

type Customer = { id: number; name: string };
type Media = {
  id: number;
  kind: string;
  file_name: string;
  status: string;
  customer_id: number | null;
  customer_name?: string;
  created_at: string;
  transcript?: string;
};

export default function UploadsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [list, setList] = useState<Media[]>([]);
  const [kind, setKind] = useState("call");
  const [customerId, setCustomerId] = useState("");
  const [transcript, setTranscript] = useState("");
  const [textContent, setTextContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    const [cRes, mRes] = await Promise.all([
      fetch("/api/customers"),
      fetch("/api/uploads"),
    ]);
    const cJson = await cRes.json();
    const mJson = await mRes.json();
    if (cRes.ok) {
      setCustomers(cJson.data || []);
      if (!customerId && cJson.data?.[0]) {
        setCustomerId(String(cJson.data[0].id));
      }
    }
    if (mRes.ok) setList(mJson.data || []);
    else setError(mJson.error || "加载失败");
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("customer_id", customerId);
      form.set("analyze", "1");
      if (kind === "call") {
        form.set("transcript", transcript);
        if (file) form.set("file", file);
      } else {
        if (textContent) form.set("text_content", textContent);
        if (file) form.set("file", file);
        if (!textContent && !file) {
          setError("请上传聊天文件或粘贴文本");
          return;
        }
      }
      if (kind === "call" && !file) {
        setError("请上传通话录音文件");
        return;
      }
      if (kind === "call" && !transcript.trim()) {
        setError("请填写转写文本");
        return;
      }

      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "上传失败");
        return;
      }
      setSuccess("上传并解析成功，已生成洞察与待办");
      setTranscript("");
      setTextContent("");
      setFile(null);
      await load();
    } finally {
      setLoading(false);
    }
  }

  async function reanalyze(id: number) {
    setError("");
    const res = await fetch(`/api/uploads/${id}`, { method: "POST", body: "{}" });
    const json = await res.json();
    if (!res.ok) setError(json.error || "解析失败");
    else {
      setSuccess("重新解析完成");
      await load();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">上传解析</h1>
        <p className="text-sm text-[var(--color-muted)]">
          上传通话录音（需转写文本）或微信聊天记录，AI 自动生成洞察、待办与竞品草稿
        </p>
      </div>

      <form onSubmit={onSubmit} className="surface grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
        <div className="field">
          <label>类型</label>
          <Select
            value={kind}
            onChange={setKind}
            options={[
              { value: "call", label: "通话录音" },
              { value: "wechat", label: "微信聊天" },
            ]}
          />
        </div>
        <div className="field">
          <label>关联客户</label>
          <Select
            value={customerId}
            onChange={setCustomerId}
            options={customers.map((c) => ({
              value: String(c.id),
              label: c.name,
            }))}
            placeholder="选择客户"
          />
        </div>
        <div className="field md:col-span-2">
          <label>{kind === "call" ? "录音文件" : "聊天文件（可选）"}</label>
          <input
            className="input"
            type="file"
            accept={kind === "call" ? "audio/*,.mp3,.wav,.m4a,.aac" : ".txt,.csv,.doc,.docx,.md"}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        {kind === "call" ? (
          <div className="field md:col-span-2">
            <label>转写文本（必填）</label>
            <textarea
              className="input textarea"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="粘贴通话转写内容…"
              required
            />
          </div>
        ) : (
          <div className="field md:col-span-2">
            <label>聊天文本（上传文本文件或粘贴）</label>
            <textarea
              className="input textarea"
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="粘贴微信聊天导出内容…"
            />
          </div>
        )}
        <Button type="submit" disabled={loading} className="md:col-span-2 md:w-auto">
          {loading ? "上传解析中…" : "上传并 AI 解析"}
        </Button>
      </form>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      {success && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">最近上传</h2>
        {list.map((m) => (
          <div key={m.id} className="surface flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">
                {m.kind === "call" ? "通话" : "微信"} · {m.file_name}
              </div>
              <div className="text-xs text-[var(--color-muted)]">
                {m.customer_id ? (
                  <Link href={`/customers/${m.customer_id}`} className="text-[var(--color-accent)]">
                    {m.customer_name || `客户#${m.customer_id}`}
                  </Link>
                ) : (
                  "未关联客户"
                )}
                {" · "}
                {m.status} · {new Date(m.created_at).toLocaleString("zh-CN")}
              </div>
            </div>
            <div className="flex gap-2">
              {m.customer_id && (
                <Link href={`/customers/${m.customer_id}`} className="btn btn-secondary">
                  看客户
                </Link>
              )}
              {m.status !== "analyzed" && (
                <Button variant="secondary" onClick={() => reanalyze(m.id)}>
                  重新解析
                </Button>
              )}
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="text-sm text-[var(--color-muted)]">暂无上传记录</div>
        )}
      </section>
    </div>
  );
}
