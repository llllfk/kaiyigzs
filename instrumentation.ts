/** 服务端启动时预热平台环境变量（注入 process.env） */
export async function register() {
  // 必须先判断 runtime，避免 Edge 编译拉入 pg（依赖 Node fs）
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { register: registerNode } = await import("./instrumentation.node");
    await registerNode();
  }
}
