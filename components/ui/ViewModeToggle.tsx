"use client";

import { useEffect, useState } from "react";

export type ViewMode = "table" | "card";

const MOBILE_MQ = "(max-width: 767px)";

export function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches;
}

/** 手机 / 电脑分开记偏好，避免电脑选「表格」后手机也被带到表格 */
export function viewModeStorageKey(base: string) {
  return isMobileViewport() ? `${base}:m` : `${base}:d`;
}

export function resolveViewMode(
  storageKey: string,
  defaultMode: ViewMode = "table"
): ViewMode {
  if (typeof window === "undefined") return defaultMode;
  try {
    const scoped = localStorage.getItem(viewModeStorageKey(storageKey));
    if (scoped === "table" || scoped === "card") return scoped;

    // 手机未设过偏好：一律默认卡片（不继承旧的全局 table）
    if (isMobileViewport()) return "card";

    const legacy = localStorage.getItem(storageKey);
    if (legacy === "table" || legacy === "card") return legacy;
  } catch {
    /* ignore */
  }
  return isMobileViewport() ? "card" : defaultMode;
}

export function persistViewMode(storageKey: string, mode: ViewMode) {
  try {
    localStorage.setItem(viewModeStorageKey(storageKey), mode);
  } catch {
    /* ignore */
  }
}

export function useViewMode(storageKey: string, defaultMode: ViewMode = "table") {
  // 首屏用桌面默认，挂载后再按视口纠正，避免 SSR/水合不一致
  const [viewMode, setViewMode] = useState<ViewMode>(defaultMode);

  useEffect(() => {
    setViewMode(resolveViewMode(storageKey, defaultMode));
  }, [storageKey, defaultMode]);

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    persistViewMode(storageKey, mode);
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
