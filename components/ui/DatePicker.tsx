"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useFloatingMenu } from "@/components/ui/useFloatingMenu";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
};

function parseYmd(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "选择日期",
  disabled,
  className,
  allowClear = true,
}: Props) {
  const selected = useMemo(() => parseYmd(value), [value]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<Date>(selected || new Date());
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pos = useFloatingMenu(open, buttonRef, { minSpace: 320 });

  useEffect(() => {
    if (selected) setCursor(selected);
  }, [selected]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const panel =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[200] w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow)]"
            style={{
              left: pos.left,
              top: pos.place === "bottom" ? pos.top : undefined,
              bottom: pos.place === "top" ? window.innerHeight - pos.top : undefined,
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                className="btn btn-secondary min-h-9 px-2"
                onClick={() => setCursor((d) => addMonths(d, -1))}
              >
                ‹
              </button>
              <div className="font-semibold">
                {format(cursor, "yyyy年M月", { locale: zhCN })}
              </div>
              <button
                type="button"
                className="btn btn-secondary min-h-9 px-2"
                onClick={() => setCursor((d) => addMonths(d, 1))}
              >
                ›
              </button>
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-[var(--color-muted)]">
              {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const inMonth = isSameMonth(day, cursor);
                const isSel = selected && isSameDay(day, selected);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={cn(
                      "min-h-10 rounded-lg text-sm",
                      !inMonth && "text-slate-300",
                      isSel && "bg-[var(--color-accent)] text-white font-semibold",
                      !isSel && inMonth && "hover:bg-[#eff6ff]"
                    )}
                    onClick={() => {
                      onChange(format(day, "yyyy-MM-dd"));
                      setOpen(false);
                    }}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between gap-2">
              <button
                type="button"
                className="btn btn-secondary min-h-10 flex-1"
                onClick={() => {
                  onChange(format(new Date(), "yyyy-MM-dd"));
                  setOpen(false);
                }}
              >
                今天
              </button>
              {allowClear && (
                <button
                  type="button"
                  className="btn btn-secondary min-h-10 flex-1"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  清空
                </button>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        className="input flex items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cn(!selected && "text-[var(--color-muted)]")}>
          {selected ? format(selected, "yyyy-MM-dd") : placeholder}
        </span>
        <span className="text-sm text-[var(--color-muted)]">日期</span>
      </button>
      {panel}
    </div>
  );
}
