/**
 * Node-only：勿被 Edge 打包进 instrumentation。
 * 由 instrumentation.ts 在 NEXT_RUNTIME === "nodejs" 时动态导入。
 */
export async function register() {
  try {
    const { warmPlatformEnv } = await import("@/lib/runtime-env");
    warmPlatformEnv();
  } catch (err) {
    console.warn("[instrumentation] platform env warm failed", err);
  }
}
