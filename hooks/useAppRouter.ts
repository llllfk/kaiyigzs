"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { startNavigationProgress } from "@/lib/navigation-events";

/** 程序化跳转：预热数据后交给 Next router（不劫持 history / 不自管骨架） */
export function useAppRouter() {
  const router = useRouter();
  return useMemo(
    () => ({
      push(href: string, options?: Parameters<typeof router.push>[1]) {
        startNavigationProgress(href);
        return router.push(href, options);
      },
      replace(href: string, options?: Parameters<typeof router.replace>[1]) {
        startNavigationProgress(href);
        return router.replace(href, options);
      },
      prefetch(href: string) {
        return router.prefetch(href);
      },
      back() {
        startNavigationProgress();
        return router.back();
      },
      forward() {
        startNavigationProgress();
        return router.forward();
      },
      refresh() {
        return router.refresh();
      },
    }),
    [router]
  );
}
