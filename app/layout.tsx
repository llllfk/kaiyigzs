import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "凯艺销售CRM",
  description: "销售客户关系管理与 AI 洞察平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="pb-16 md:pb-0">{children}</body>
    </html>
  );
}
