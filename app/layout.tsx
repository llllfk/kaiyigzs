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
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
