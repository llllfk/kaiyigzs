"use client";

import { useEffect, useState } from "react";

export type ViewMode = "table" | "card";

export function useViewMode(storageKey: string, defaultMode: ViewMode = "table") {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultMode);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "table" || saved === "card") {
        setViewMode(saved);
        return;
      }
      if (window.matchMedia("(max-width: 767px)").matches) {
        setViewMode("card");
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem(storageKey, mode);
    } catch {
      /* ignore */
    }
  }

  return [viewMode, changeViewMode] as const;
}

export function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-[var(--color-border)] bg-white p-0.5"
      role="group"
      aria-label="展示方式"
    >
      <button
        type="button"
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
          value === "table"
            ? "bg-slate-900 text-white shadow-sm"
            : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
        }`}
        aria-pressed={value === "table"}
        onClick={() => onChange("table")}
      >
        表格
      </button>
      <button
        type="button"
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
          value === "card"
            ? "bg-slate-900 text-white shadow-sm"
            : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
        }`}
        aria-pressed={value === "card"}
        onClick={() => onChange("card")}
      >
        卡片
      </button>
    </div>
  );
}
