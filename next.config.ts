import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const contentSecurityPolicy = `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://lf-cdn.coze.cn; style-src 'self' 'unsafe-inline'; font-src 'self' data:${isProduction ? "; upgrade-insecure-requests" : ""}`;

const nextConfig: NextConfig = {
  // CloudBase Run / Docker standalone runtime
  output: "standalone",
  // pg 依赖 Node fs/net，勿打进 Edge / 浏览器包
  serverExternalPackages: [
    "pg",
    "pg-connection-string",
    "pg-pool",
    "pgpass",
  ],
  async headers() {
    return [{ source:"/:path*", headers:[
      { key:"X-Content-Type-Options", value:"nosniff" },
      { key:"Referrer-Policy", value:"no-referrer" },
      { key:"X-Frame-Options", value:"DENY" },
      { key:"Permissions-Policy", value:"camera=(), geolocation=(), payment=(), usb=()" },
      { key:"Content-Security-Policy", value:contentSecurityPolicy },
      ...(isProduction ? [{ key:"Strict-Transport-Security", value:"max-age=31536000; includeSubDomains" }] : []),
    ] }];
  },
  // Coze sandbox — add images.remotePatterns if needed
};

export default nextConfig;
