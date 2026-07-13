import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '凯艺软件开发工作室 | 用技术驱动商业增长',
  description:
    '凯艺软件开发工作室 — 专注为中小企业打造高效、智能的数字化管理系统。AI原生架构，快速交付，灵活定制。',
  keywords: [
    '凯艺软件',
    '软件开发',
    'AI CRM',
    '数字化管理',
    '定制开发',
    'SaaS',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="bg-[#0a0a0a] text-zinc-400 antialiased">
        {children}
      </body>
    </html>
  );
}
