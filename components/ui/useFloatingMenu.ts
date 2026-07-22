"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export type FloatingPos = {
  top: number;
  left: number;
  width: number;
  place: "bottom" | "top";
};

export function useFloatingMenu(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
  opts?: { minSpace?: number; offset?: number }
) {
  const minSpace = opts?.minSpace ?? 200;
  const offset = opts?.offset ?? 4;
  const [pos, setPos] = useState<FloatingPos | null>(null);

  const updatePos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const preferBottom = spaceBelow >= minSpace || spaceBelow >= spaceAbove;
    setPos({
      top: preferBottom ? rect.bottom + offset : rect.top - offset,
      left: Math.min(rect.left, window.innerWidth - Math.min(rect.width, 320) - 8),
      width: rect.width,
      place: preferBottom ? "bottom" : "top",
    });
  }, [anchorRef, minSpace, offset]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePos();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePos]);

  return pos;
}
