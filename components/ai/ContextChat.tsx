"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useUi } from "@/components/ui/Feedback";
import { AiMessageContent } from "@/components/ai/AiMessageContent";
import {
  AiThinkingIndicator,
  formatAiDuration,
} from "@/components/ai/AiThinkingIndicator";
import { cn } from "@/lib/utils";

type Msg = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  id?: number;
  duration_ms?: number | null;
};

type SessionRow = {
  id: number;
  title: string | null;
  updated_at: string;
  message_count?: number;
};

type Props = {
  customerId?: number | null;
  opportunityId?: number | null;
  title?: string;
  description?: string;
  className?: string;
  /** false 时不套 surface 卡片（用于弹窗内） */
  framed?: boolean;
  /** 更紧凑的高度与间距（客户详情等） */
  compact?: boolean;
  /** 嵌在侧栏时去掉外层 surface */
  embedded?: boolean;
  /** 预置快捷问题 */
  suggestions?: string[];
  /** 空对话时的引导文案 */
  emptyHint?: string;
  /** 解析成功等状态提示 */
  bannerHint?: string | null;
  onDismissBanner?: () => void;
  /** 外部预填问题（写入输入框，不自动发送） */
  draftQuestion?: string | null;
  /** 每次预填递增，便于重复点击同一问题也能再次填入 */
  draftTick?: number;
  onDraftConsumed?: () => void;
};

const DEFAULT_CUSTOMER_SUGGESTIONS = [
  "下一步该怎么跟进？",
  "帮我写一段跟进话术",
  "这个客户有哪些风险？",
];

const DEFAULT_OPP_SUGGESTIONS = [
  "如何推进到下一阶段？",
  "帮我准备异议处理话术",
  "成交的关键卡点是什么？",
];

export function ContextChat({
  customerId,
  opportunityId,
  title = "AI 助手",
  description = "结合当前资料给出跟进建议；对话会自动保存",
  className,
  framed = true,
  compact = false,
  embedded = false,
  suggestions,
  emptyHint,
  bannerHint,
  onDismissBanner,
  draftQuestion,
  draftTick = 0,
  onDraftConsumed,
}: Props) {
  const ui = useUi();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);
  const [booting, setBooting] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onDraftConsumedRef = useRef(onDraftConsumed);
  onDraftConsumedRef.current = onDraftConsumed;

  const quickTips =
    suggestions ??
    (opportunityId ? DEFAULT_OPP_SUGGESTIONS : DEFAULT_CUSTOMER_SUGGESTIONS);

  const emptyText =
    emptyHint ||
    (customerId
      ? "可先上传通话或微信记录丰富画像，再问跟进策略、话术或风险点。"
      : "可以问我跟进策略、话术或风险点。发送后会自动保存。");

  // 仅填入输入框并聚焦，绝不自动发送
  useEffect(() => {
    if (!draftQuestion || draftTick <= 0) return;
    setInput(draftQuestion);
    onDraftConsumedRef.current?.();
    const t = window.setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }, 0);
    return () => window.clearTimeout(t);
  }, [draftQuestion, draftTick]);

  const scopeQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (customerId) params.set("customer_id", String(customerId));
    if (opportunityId) params.set("opportunity_id", String(opportunityId));
    return params;
  }, [customerId, opportunityId]);

  const loadLatest = useCallback(async () => {
    if (!customerId && !opportunityId) {
      setBooting(false);
      return;
    }
    setBooting(true);
    try {
      const res = await fetch(`/api/ai/chat?${scopeQuery()}`);
      const json = await res.json();
      if (!res.ok) {
        ui.error("加载对话记录失败", json.error);
        return;
      }
      setSessions(json.data?.sessions || []);
      setSessionId(json.data?.session?.id ?? null);
      setMessages(json.data?.messages || []);
    } finally {
      setBooting(false);
    }
  }, [customerId, opportunityId, scopeQuery, ui]);

  async function loadSession(id: number) {
    setBooting(true);
    try {
      const res = await fetch(`/api/ai/chat?session_id=${id}`);
      const json = await res.json();
      if (!res.ok) {
        ui.error("加载会话失败", json.error);
        return;
      }
      setSessionId(json.data?.session?.id ?? id);
      setMessages(json.data?.messages || []);
    } finally {
      setBooting(false);
    }
  }

  useEffect(() => {
    setMessages([]);
    setSessionId(null);
    setSessions([]);
    setInput("");
    void loadLatest();
  }, [customerId, opportunityId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // 只滚聊天列表内部，避免带动整页滚到最下方
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  function startNewChat() {
    setSessionId(null);
    setMessages([]);
    setInput("");
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    if (!customerId && !opportunityId) {
      ui.error("缺少客户或商机上下文");
      return;
    }

    const nextHistory = [...messages, { role: "user" as const, content: question }];
    setMessages(nextHistory);
    setInput("");
    setThinkingStartedAt(Date.now());
    setLoading(true);
    const ac = new AbortController();
    // 比服务端略长，优先展示服务端超时文案
    const timer = window.setTimeout(() => ac.abort(), 160_000);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          message: question,
          customer_id: customerId || undefined,
          opportunity_id: opportunityId || undefined,
          session_id: sessionId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("对话失败", json.error);
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      const newSessionId = json.data?.session_id as number | undefined;
      if (newSessionId) setSessionId(newSessionId);
      setMessages([
        ...nextHistory,
        {
          role: "assistant",
          content: json.data?.answer || "暂无回答",
          duration_ms: json.data?.duration_ms ?? null,
        },
      ]);
      const listRes = await fetch(`/api/ai/chat?${scopeQuery()}&list=1`);
      const listJson = await listRes.json();
      if (listRes.ok) setSessions(listJson.data || []);
    } catch (err) {
      setMessages((prev) => prev.slice(0, -1));
      if (err instanceof Error && err.name === "AbortError") {
        ui.error("对话超时", "已等待较久未返回，请稍后重试");
      } else {
        ui.error("对话失败", err instanceof Error ? err.message : "网络异常");
      }
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
      setThinkingStartedAt(null);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  const sessionOptions = [
    { value: "", label: sessionId ? "当前对话" : "新对话" },
    ...sessions.map((s) => {
      const when = new Date(s.updated_at).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return {
        value: String(s.id),
        label: `${when} · ${s.title || "未命名"}`,
      };
    }),
  ];

  return (
    <section
      className={cn(
        "flex flex-col",
        !embedded && framed && (compact ? "surface p-3" : "surface p-4"),
        embedded && "min-h-0 flex-1",
        className
      )}
    >
      <div
        className={cn(
          "flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
          compact ? "mb-2" : "mb-3"
        )}
      >
        <div className="min-w-0">
          <h2 className={cn("font-semibold", compact && "text-sm")}>{title}</h2>
          {!compact && (
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">{description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn("min-w-0", compact || embedded ? "flex-1" : "w-56")}>
            <Select
              value={sessionId ? String(sessionId) : ""}
              onChange={(v) => {
                if (!v) startNewChat();
                else void loadSession(Number(v));
              }}
              options={sessionOptions}
              placeholder="对话记录"
              className="w-full"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            className={compact ? "min-h-8 shrink-0 px-2 text-xs" : undefined}
            onClick={startNewChat}
          >
            新对话
          </Button>
        </div>
      </div>

      {bannerHint && (
        <div className="mb-2 flex items-start justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900">
          <span className="min-w-0 leading-relaxed">{bannerHint}</span>
          {onDismissBanner && (
            <button
              type="button"
              className="shrink-0 text-emerald-700/80 hover:text-emerald-900"
              onClick={onDismissBanner}
              aria-label="关闭提示"
            >
              ×
            </button>
          )}
        </div>
      )}

      <div
        ref={listRef}
        className={cn(
          "flex flex-col gap-2 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-slate-50/60",
          embedded
            ? "mb-2 min-h-0 max-h-full flex-1 p-2"
            : compact
              ? "mb-2 max-h-[min(40vh,280px)] min-h-[110px] p-2"
              : "mb-3 max-h-[min(50vh,420px)] min-h-[180px] p-3"
        )}
      >
        {booting && (
          <div className="text-sm text-[var(--color-muted)]">加载对话记录…</div>
        )}
        {!booting && messages.length === 0 && !loading && (
          <div className="space-y-2 text-sm text-[var(--color-muted)]">
            <p>{emptyText}</p>
            <div className="flex flex-wrap gap-2">
              {quickTips.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs text-[var(--color-text)] hover:border-[var(--color-accent)]/40"
                  onClick={() => void send(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id ?? `${m.role}-${i}`} className={cn("max-w-[95%]", m.role === "user" ? "ml-auto" : "mr-auto")}>
            <div
              className={cn(
                "rounded-lg px-3 py-2",
                m.role === "user"
                  ? "bg-[var(--color-accent)] text-white whitespace-pre-wrap text-sm"
                  : "border border-[var(--color-border)] bg-white text-[var(--color-text)]"
              )}
            >
              {m.role === "user" ? m.content : <AiMessageContent content={m.content} />}
            </div>
            {m.role === "assistant" && m.duration_ms != null && m.duration_ms > 0 && (
              <div className="mt-1 px-1 text-[10px] tabular-nums text-[var(--color-muted)]">
                用时 {formatAiDuration(m.duration_ms)}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <AiThinkingIndicator startedAt={thinkingStartedAt ?? undefined} />
        )}
      </div>

      <form onSubmit={onSubmit} className="flex shrink-0 flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          className="input flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入问题，例如：下一步怎么跟？"
          disabled={loading || booting}
        />
        <Button type="submit" disabled={loading || booting || !input.trim()}>
          {loading ? "发送中…" : "发送"}
        </Button>
      </form>
    </section>
  );
}
