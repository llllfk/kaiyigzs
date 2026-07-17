"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

export function TimePicker({
  value,
  onChange,
  placeholder = "选择时间",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [h, m] = (value || "09:00").split(":");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        className="input flex items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cn(!value && "text-[var(--color-muted)]")}>
          {value || placeholder}
        </span>
        <span className="text-[var(--color-muted)] text-sm">时间</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 flex w-[220px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow)]">
          <div className="max-h-56 flex-1 overflow-y-auto">
            {HOURS.map((hour) => (
              <button
                key={hour}
                type="button"
                className={cn(
                  "w-full min-h-10 px-3 text-left hover:bg-[#eff6ff]",
                  hour === (h || "09") && "bg-[#eff6ff] font-semibold text-[var(--color-accent)]"
                )}
                onClick={() => onChange(`${hour}:${(m || "00").padStart(2, "0")}`)}
              >
                {hour}
              </button>
            ))}
          </div>
          <div className="max-h-56 flex-1 overflow-y-auto border-l border-[var(--color-border)]">
            {MINUTES.filter((_, i) => i % 5 === 0).map((minute) => (
              <button
                key={minute}
                type="button"
                className={cn(
                  "w-full min-h-10 px-3 text-left hover:bg-[#eff6ff]",
                  minute === (m || "00") &&
                    "bg-[#eff6ff] font-semibold text-[var(--color-accent)]"
                )}
                onClick={() =>
                  onChange(`${(h || "09").padStart(2, "0")}:${minute}`)
                }
              >
                {minute}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
