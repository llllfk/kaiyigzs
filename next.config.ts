<<<<<<< HEAD
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),  // Uncomment and add 'import path from "path"' if needed
  /* config options here */
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
=======
import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/** Coze：CDN / 字体；各源之间必须空格分隔。不要启用 standalone。 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://lf-cdn.coze.cn https://apm.volccdn.com",
  "style-src 'self' 'unsafe-inline' https://fonts.bytedance.com",
  "font-src 'self' data: https://fonts.bytedance.com",
  isProduction ? "upgrade-insecure-requests" : "",
]
  .filter(Boolean)
  .join("; ");

const nextConfig: NextConfig = {
  // 禁止 output: "standalone"（Coze 上易导致 /_next/static 404 / MIME text/plain）
  serverExternalPackages: [
    "pg",
    "pg-connection-string",
    "pg-pool",
    "pgpass",
  ],
  async headers() {
    return [
      {
        source: "/og-quote-share.png",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, immutable" },
          { key: "Content-Type", value: "image/png" },
        ],
      },
      {
        source: "/q/:path*",
        headers: [
          // 允许微信等预览服务缓存短时 HTML，便于生成链接卡片
          { key: "Cache-Control", value: "public, max-age=60, s-maxage=300" },
          { key: "Referrer-Policy", value: "no-referrer-when-downgrade" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
>>>>>>> b8cb24a19c9260d652cdaac1ea3585b029169db3
  },
};

export default nextConfig;
