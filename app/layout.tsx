import type { Metadata } from "next";
import { AppProviders } from "@/components/shared/AppProviders";
import { appPublicBaseUrl } from "@/lib/temp-audio";
import "./globals.css";

const configuredBase = appPublicBaseUrl();

export const metadata: Metadata = {
  metadataBase: configuredBase ? new URL(configuredBase) : undefined,
  title: "凯艺销售 CRM",
  description: "销售客户关系管理与 AI 洞察平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  if (typeof window === 'undefined') return;
  function fixMime() {
    // 移除被平台 CDN 错误标记的 CSS link
    document.querySelectorAll('link[rel="stylesheet"][href*="/_next/static/"]').forEach(function(link) {
      var href = link.href;
      link.remove();
      var newLink = document.createElement('link');
      newLink.rel = 'stylesheet';
      newLink.type = 'text/css';
      newLink.href = href;
      document.head.appendChild(newLink);
    });
    // 移除被错误标记的 JS script
    document.querySelectorAll('script[src*="/_next/static/"]').forEach(function(script) {
      var src = script.src;
      script.remove();
      var newScript = document.createElement('script');
      newScript.src = src;
      newScript.type = 'text/javascript';
      document.head.appendChild(newScript);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixMime);
  } else {
    fixMime();
  }
})();
`,
          }}
        />
      </head>
      <body className="pb-16 md:pb-0">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
