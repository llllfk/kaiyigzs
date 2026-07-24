/** Capacitor / 原生壳检测与系统浏览器打开（仅客户端） */

type CapBrowser = { open: (opts: { url: string }) => Promise<void> };
type CapBridge = {
  isNativePlatform?: () => boolean;
  Plugins?: { Browser?: CapBrowser };
};

function capacitor(): CapBridge | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { Capacitor?: CapBridge }).Capacitor || null
  );
}

export function isNativeApp() {
  try {
    return Boolean(capacitor()?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** App 内用系统浏览器打开；普通网页返回 false 由调用方走 blob 下载 */
export async function openInSystemBrowser(url: string): Promise<boolean> {
  if (!url || typeof window === "undefined") return false;
  const Cap = capacitor();
  if (!Cap?.isNativePlatform?.()) return false;

  try {
    const Browser = Cap.Plugins?.Browser;
    if (Browser?.open) {
      await Browser.open({ url });
      return true;
    }
  } catch {
    /* fall through */
  }

  // 无 Browser 插件时的兜底：多数 Capacitor 会把 _blank 外链交给系统浏览器
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (w) return true;

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
