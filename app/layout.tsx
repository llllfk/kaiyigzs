import type { Metadata } from "next";
import { AppProviders } from "@/components/shared/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
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
                var links = document.querySelectorAll('link[rel="stylesheet"]');
                var cssUrls = [];
                for (var i = 0; i < links.length; i++) {
                  var href = links[i].getAttribute('href');
                  if (href && href.indexOf('/_next/static/css/') !== -1) {
                    cssUrls.push(href);
                    links[i].remove();
                  }
                }
                function loadCSS() {
                  cssUrls.forEach(function(href) {
                    var link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.type = 'text/css';
                    link.href = href;
                    document.head.appendChild(link);
                  });
                }
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', loadCSS);
                } else {
                  loadCSS();
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
