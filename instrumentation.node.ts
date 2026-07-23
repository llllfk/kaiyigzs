/**
 * Node-only：勿被 Edge 打包进 instrumentation。
 * 由 instrumentation.ts 在 NEXT_RUNTIME === "nodejs" 时动态导入。
 */
export async function register() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    const secret=process.env.SESSION_SECRET||"";
    if(secret.length<32) throw new Error("生产环境 SESSION_SECRET 至少需要 32 位随机字符");
    if(!process.env.CONFIG_ENCRYPTION_KEY) throw new Error("生产环境缺少 CONFIG_ENCRYPTION_KEY");
    if(!process.env.APP_ORIGINS) throw new Error("生产环境缺少 APP_ORIGINS");
    if(!/[?&]sslmode=(require|verify-ca|verify-full)/.test(process.env.DATABASE_URL||"")) throw new Error("生产 DATABASE_URL 必须启用 sslmode=require 或更严格模式");
  }
  try {
    const { warmPlatformEnv } = await import("@/lib/runtime-env");
    warmPlatformEnv();
  } catch (err) {
    console.warn("[instrumentation] platform env warm failed", err);
  }
}
