"use client";

import { useAppRouter } from "@/hooks/useAppRouter";
import {
  useDelayedTooltip,
  type TooltipPlacement,
} from "@/components/ui/DelayedTooltip";
import { cn } from "@/lib/utils";

export type IconName =
  | "download"
  | "trash"
  | "pencil"
  | "plus"
  | "x"
  | "link"
  | "check"
  | "chat"
  | "clipboard"
  | "quote"
  | "review"
  | "bell"
  | "more"
  | "history";

type IconButtonProps = {
  icon: IconName;
  label: string;
  variant?: "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  href?: string;
  download?: boolean | string;
  type?: "button" | "submit";
  /** tooltip 展开方向，默认向上 */
  tipPlacement?: TooltipPlacement;
  tipDelayMs?: number;
  onClick?: React.MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
};

function IconSvg({ name }: { name: IconName }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    "aria-hidden": true as const,
  };
  switch (name) {
    case "download":
      return (
        <svg {...common}>
          <path
            d="M12 4v10m0 0 4-4m-4 4-4-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path
            d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "pencil":
      return (
        <svg {...common}>
          <path
            d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path
            d="M6 6l12 12M18 6 6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path
            d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 18.07"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path
            d="M5 12.5 10 17.5 19 7"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path
            d="M21 12a8 8 0 0 1-11.3 7.3L4 21l1.8-5.2A8 8 0 1 1 21 12Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...common}>
          <path
            d="M9 5h6M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "quote":
      return (
        <svg {...common}>
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 2v6h6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 13h8M8 17h5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "review":
      return (
        <svg {...common}>
          <path
            d="M9 5h6M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9 14.5 11 16.5 15.5 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path
            d="M6 9a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.3 21a1.7 1.7 0 0 0 3.4 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.75" fill="currentColor" />
          <circle cx="12" cy="12" r="1.75" fill="currentColor" />
          <circle cx="19" cy="12" r="1.75" fill="currentColor" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <path
            d="M3 12a9 9 0 1 0 3-6.7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 4v5h5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12 7v5l3 2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

const SIZE = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
} as const;

const VARIANT = {
  secondary:
    "border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-slate-50",
  ghost: "text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]",
  danger:
    "border border-[var(--color-border)] bg-white text-[var(--color-danger)] hover:border-red-200 hover:bg-red-50",
} as const;

export function IconButton({
  icon,
  label,
  variant = "secondary",
  size = "sm",
  className,
  disabled,
  href,
  download,
  type = "button",
  tipPlacement = "up",
  tipDelayMs = 350,
  onClick,
}: IconButtonProps) {
  const router = useAppRouter();
  const tip = useDelayedTooltip(label, tipDelayMs, {
    alwaysShow: true,
    placement: tipPlacement,
  });

  const cls = cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors",
    SIZE[size],
    VARIANT[variant],
    disabled && "pointer-events-none cursor-not-allowed opacity-45",
    className
  );

  const tipHandlers = {
    onMouseEnter: tip.onMouseEnter,
    onMouseLeave: tip.onMouseLeave,
  };

  // 仅下载保留 <a>；站内跳转用 button，避免左下角出现链接地址
  if (href && download && !disabled) {
    return (
      <>
        <a
          ref={tip.ref as React.RefObject<HTMLAnchorElement>}
          href={href}
          className={cls}
          aria-label={label}
          download={download === true ? true : download}
          onClick={onClick}
          {...tipHandlers}
        >
          <IconSvg name={icon} />
        </a>
        {tip.tip}
      </>
    );
  }

  return (
    <>
      <button
        ref={tip.ref as React.RefObject<HTMLButtonElement>}
        type={type}
        className={cls}
        aria-label={label}
        disabled={disabled}
        onClick={(e) => {
          onClick?.(e);
          if (e.defaultPrevented || disabled) return;
          if (href) router.push(href);
        }}
        {...tipHandlers}
      >
        <IconSvg name={icon} />
      </button>
      {tip.tip}
    </>
  );
}
