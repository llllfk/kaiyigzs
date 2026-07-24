"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const HINTS = ["正在理解问题", "整理客户资料", "生成跟进建议", "即将回复"];

export function formatAiDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} 毫秒`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)} 秒`;
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m} 分 ${s} 秒`;
}

export function AiThinkingIndicator({
  className,
  hints = HINTS,
  startedAt,
}: {
  className?: string;
  hints?: string[];
  /** 思考开始时间戳（Date.now()），用于显示已花费时长 */
  startedAt?: number;
}) {
  const [hintIndex, setHintIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (hints.length <= 1) return;
    const t = window.setInterval(() => {
      setHintIndex((i) => (i + 1) % hints.length);
    }, 1800);
    return () => window.clearInterval(t);
  }, [hints]);

  useEffect(() => {
    const start = startedAt ?? Date.now();
    setElapsedMs(Math.max(0, Date.now() - start));
    const t = window.setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - start));
    }, 1000);
    return () => window.clearInterval(t);
  }, [startedAt]);

  return (
    <div
      className={cn(
        "ai-thinking mr-auto inline-flex max-w-[95%] flex-col gap-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm text-[var(--color-muted)]",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label="AI 思考中"
    >
      <div className="flex items-center gap-2.5">
        <span className="ai-thinking-dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="ai-thinking-hint" key={hintIndex}>
          {hints[hintIndex]}…
        </span>
      </div>
      <div className="pl-[22px] text-xs tabular-nums text-[var(--color-muted)]">
        已等待 {Math.floor(elapsedMs / 1000)} 秒
      </div>
    </div>
  );
}
