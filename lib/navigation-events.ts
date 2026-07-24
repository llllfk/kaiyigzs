export const NAVIGATION_START_EVENT = "crm:navigation-start";

export function startNavigationProgress(href?: string) {
  if (typeof window === "undefined") return;
  if (href) {
    try {
      const target = new URL(href, window.location.origin);
      if (target.origin !== window.location.origin) return;
      const next = `${target.pathname}${target.search}`;
      const current = `${window.location.pathname}${window.location.search}`;
      if (next === current) return;
    } catch {
      return;
    }
  }
  window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
}
