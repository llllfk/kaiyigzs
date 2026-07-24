export type MobileNavStyle = "compact" | "full";

export type UiPrefs = {
  mobile_nav?: MobileNavStyle;
};

export const DEFAULT_UI_PREFS: Required<UiPrefs> = {
  mobile_nav: "compact",
};

export const MOBILE_NAV_LABELS: Record<MobileNavStyle, string> = {
  compact: "简洁导航",
  full: "完整菜单",
};

export function normalizeUiPrefs(raw: unknown): Required<UiPrefs> {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const nav = obj.mobile_nav;
  return {
    mobile_nav: nav === "full" || nav === "compact" ? nav : DEFAULT_UI_PREFS.mobile_nav,
  };
}
