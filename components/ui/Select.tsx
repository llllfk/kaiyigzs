"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function Select({
  value,
  onChange,
  options,
  placeholder = "请选择",
  disabled,
  className,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    const idx = Math.max(
      0,
      options.findIndex((o) => o.value === value)
    );
    setActive(idx);
  }, [open, options, value]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const opt = options[active];
      if (opt) {
        onChange(opt.value);
        setOpen(false);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.min(options.length - 1, i + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.max(0, i - 1));
    }
  }

  const isMobile =
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="input flex items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
      >
        <span className={cn(!selected && "text-[var(--color-muted)]")}>
          {selected?.label || placeholder}
        </span>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M5.25 7.5L10 12.25L14.75 7.5" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            "z-50 overflow-auto bg-white border border-[var(--color-border)] shadow-[var(--shadow)]",
            isMobile
              ? "fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[60vh] p-2"
              : "absolute left-0 right-0 mt-1 rounded-lg max-h-60"
          )}
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-[var(--color-muted)]">暂无选项</div>
          )}
          {options.map((opt, idx) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={cn(
                "w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-[#eff6ff]",
                idx === active && "bg-[#eff6ff]",
                opt.value === value && "font-semibold text-[var(--color-accent)]"
              )}
              onMouseEnter={() => setActive(idx)}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
