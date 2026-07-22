"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NAVIGATION_START_EVENT } from "@/lib/navigation-events";

/** 轻量顶栏进度：点击站内链接时出现，路由变化后结束 */
function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const timers = useRef<number[]>([]);
  const activeKey = useRef(`${pathname}?${searchParams.toString()}`);
  const loading = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  const done = useCallback(() => {
    if (!loading.current) return;
    clearTimers();
    setFinishing(true);
    setWidth(100);
    timers.current.push(
      window.setTimeout(() => {
        setVisible(false);
        setFinishing(false);
        setWidth(0);
        loading.current = false;
      }, 160)
    );
  }, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    loading.current = true;
    setFinishing(false);
    setVisible(true);
    setWidth(18);
    timers.current.push(
      window.setTimeout(() => setWidth(45), 120),
      window.setTimeout(() => setWidth(70), 400),
      window.setTimeout(() => setWidth(88), 1000),
      window.setTimeout(() => {
        if (loading.current) done();
      }, 6000)
    );
  }, [clearTimers, done]);

  useEffect(() => {
    const key = `${pathname}?${searchParams.toString()}`;
    if (key !== activeKey.current) {
      activeKey.current = key;
      done();
    }
  }, [pathname, searchParams, done]);

  useEffect(() => {
    const onProgrammaticNavigation = () => start();
    window.addEventListener(NAVIGATION_START_EVENT, onProgrammaticNavigation);
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.pathname.startsWith("/api/")) return;
        const next = `${url.pathname}${url.search}`;
        const current = `${window.location.pathname}${window.location.search}`;
        if (next === current) return;
        start();
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener(
        NAVIGATION_START_EVENT,
        onProgrammaticNavigation
      );
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, [start, clearTimers]);

  if (!visible && width === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px] overflow-hidden"
    >
      <div
        className="h-full origin-left rounded-r-full"
        style={{
          width: `${width}%`,
          opacity: finishing ? 0 : 1,
          background:
            "linear-gradient(90deg, #60a5fa 0%, var(--color-accent) 55%, #1e3a5f 100%)",
          boxShadow: "0 0 10px rgba(37, 99, 235, 0.45)",
          transition: finishing
            ? "width 120ms ease-out, opacity 140ms ease"
            : "width 240ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
