import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CloudBase Run / Docker standalone runtime
  output: "standalone",
  // pg 依赖 Node fs/net，勿打进 Edge / 浏览器包
  serverExternalPackages: [
    "pg",
    "pg-connection-string",
    "pg-pool",
    "pgpass",
    "@volcengine/openapi",
  ],
  // Coze sandbox — add images.remotePatterns if needed
};

export default nextConfig;
