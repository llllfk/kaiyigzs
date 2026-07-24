"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type TipPos = { left: number; top: number; transform: string };

export type TooltipPlacement = "up" | "down" | "left" | "right";

/** 触屏 / 无悬停设备：无法依赖 mouseleave，需自动收起 */
function isTouchLikeUi() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none)").matches;
}

function placeTip(
  rect: DOMRect,
  placement: TooltipPlacement,
  gap = 6
): TipPos {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  switch (placement) {
    case "down":
      return {
        left: cx,
        top: rect.bottom + gap,
        transform: "translate(-50%, 0)",
      };
    case "left":
      return {
        left: rect.left - gap,
        top: cy,
        transform: "translate(-100%, -50%)",
      };
    case "right":
      return {
        left: rect.right + gap,
        top: cy,
        transform: "translate(0, -50%)",
      };
    case "up":
    default:
      return {
        left: cx,
        top: rect.top - gap,
        transform: "translate(-50%, -100%)",
      };
  }
}

/** 悬停 / 聚焦 delayMs 后显示 tip；placement 默认向上。触屏约 1.8s 后自动消失。 */
export function useDelayedTooltip(
  text: string,
  delayMs = 400,
  options?: { alwaysShow?: boolean; placement?: TooltipPlacement }
) {
  const ref = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<TipPos | null>(null);
  const timerRef = useRef<number | null>(null);
  const alwaysShow = options?.alwaysShow ?? false;
  const placement = options?.placement ?? "up";

  const clearTip = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPos(null);
  }, []);

  const scheduleTip = useCallback(() => {
    clearTip();
    const el = ref.current;
    if (!el || !text) return;
    if (
      !alwaysShow &&
      el.scrollWidth <= el.clientWidth + 1 &&
      el.scrollHeight <= el.clientHeight + 1
    ) {
      return;
    }
    const rect = el.getBoundingClientRect();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setPos(placeTip(rect, placement));
    }, delayMs);
  }, [alwaysShow, clearTip, delayMs, placement, text]);

  useEffect(() => () => clearTip(), [clearTip]);

  // 显示中：触屏定时收起；滚动 / 点到外部立即收起
  useEffect(() => {
    if (!pos) return;

    const touchLike = isTouchLikeUi();
    let autoHide: number | null = null;
    if (touchLike) {
      autoHide = window.setTimeout(() => clearTip(), 1800);
    }

    function onScrollOrMove() {
      clearTip();
    }

    function onOutsidePointer(e: Event) {
      const el = ref.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      clearTip();
    }

    window.addEventListener("scroll", onScrollOrMove, true);
    window.addEventListener("touchmove", onScrollOrMove, { passive: true });

    // 延后绑定，避免打开 tip 的同一次点击立刻清掉
    const bindId = window.setTimeout(() => {
      document.addEventListener("pointerdown", onOutsidePointer, true);
    }, 50);

    return () => {
      if (autoHide != null) window.clearTimeout(autoHide);
      window.clearTimeout(bindId);
      window.removeEventListener("scroll", onScrollOrMove, true);
      window.removeEventListener("touchmove", onScrollOrMove);
      document.removeEventListener("pointerdown", onOutsidePointer, true);
    };
  }, [pos, clearTip]);

  const tip =
    pos && typeof document !== "undefined"
      ? createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[300] max-w-[min(22rem,calc(100vw-1rem))] rounded-md bg-slate-900 px-2.5 py-1.5 text-xs leading-snug text-white shadow-lg"
            style={{
              left: pos.left,
              top: pos.top,
              transform: pos.transform,
            }}
          >
            {text}
          </div>,
          document.body
        )
      : null;

  return {
    ref: ref as RefObject<HTMLElement | null>,
    tip,
    onMouseEnter: scheduleTip,
    onMouseLeave: clearTip,
    onFocus: scheduleTip,
    onBlur: clearTip,
  };
}

/** 文本被截断时，悬停/聚焦 delayMs 后显示完整内容 */
export function useDelayedTruncateTip(
  text: string,
  delayMs = 500,
  options?: { alwaysShow?: boolean; placement?: TooltipPlacement }
) {
  return useDelayedTooltip(text, delayMs, {
    alwaysShow: options?.alwaysShow ?? false,
    placement: options?.placement ?? "down",
  });
}

export function TruncateWithDelayTip({
  text,
  delayMs = 500,
  className,
  children,
  alwaysShowTip,
  placement = "down",
  tabIndex,
  role,
  title,
  onClick,
  onKeyDown,
}: {
  text: string;
  delayMs?: number;
  className?: string;
  children?: ReactNode;
  /** Show tip even when visible text is not CSS-truncated (e.g. shortened copy) */
  alwaysShowTip?: boolean;
  placement?: TooltipPlacement;
  tabIndex?: number;
  role?: string;
  title?: string;
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLSpanElement>) => void;
}) {
  const { ref, tip, onMouseEnter, onMouseLeave, onFocus, onBlur } =
    useDelayedTruncateTip(text, delayMs, {
      alwaysShow: alwaysShowTip,
      placement,
    });

  return (
    <>
      <span
        ref={ref as RefObject<HTMLSpanElement>}
        className={cn("min-w-0 truncate", className)}
        tabIndex={tabIndex}
        role={role}
        title={title}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        {children ?? text}
      </span>
      {tip}
    </>
  );
}

const TAG_CHIP_TONE = {
  amber:
    "bg-amber-50 text-amber-900 ring-1 ring-amber-600/15",
  rose: "bg-rose-50 text-rose-800 ring-1 ring-rose-600/15",
  neutral: "bg-white/80 text-[var(--color-text)] ring-1 ring-[var(--color-border)]",
} as const;

/** 痛点/竞品等标签：超长省略，悬停或聚焦显示全文 */
export function TagChip({
  text,
  tone = "amber",
  className,
  maxWidthClass = "max-w-[9rem]",
}: {
  text: string;
  tone?: keyof typeof TAG_CHIP_TONE;
  className?: string;
  maxWidthClass?: string;
}) {
  return (
    <TruncateWithDelayTip
      text={text}
      delayMs={280}
      placement="up"
      tabIndex={0}
      className={cn(
        "inline-block rounded-md px-1.5 py-0.5 text-xs leading-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/35",
        maxWidthClass,
        TAG_CHIP_TONE[tone],
        className
      )}
    />
  );
}
