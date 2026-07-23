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
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="pb-16 md:pb-0">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
