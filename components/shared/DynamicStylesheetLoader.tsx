"use client";

import { useEffect } from "react";

/**
 * 动态加载 Next.js 静态样式表
 * 解决平台 CDN 返回错误 MIME type (text/plain) 的问题
 * 通过 JavaScript 创建 link 元素并显式设置 type="text/css"
 */
export function DynamicStylesheetLoader() {
  useEffect(() => {
    // 查找所有被浏览器拒绝的 CSS 文件（因为 MIME type 错误）
    // 并重新用 JavaScript 加载它们
    const styleSheets = document.querySelectorAll('link[rel="stylesheet"]');
    const failedSheets: string[] = [];

    styleSheets.forEach((link) => {
      const href = link.getAttribute("href");
      if (href && href.includes("/_next/static/css/")) {
        // 检查是否加载失败
        const sheet = (link as HTMLLinkElement).sheet;
        if (!sheet) {
          failedSheets.push(href);
        }
      }
    });

    // 重新加载失败的样式表
    failedSheets.forEach((href) => {
      const newLink = document.createElement("link");
      newLink.rel = "stylesheet";
      newLink.type = "text/css"; // 显式指定 MIME type
      newLink.href = href;
      document.head.appendChild(newLink);
    });
  }, []);

  return null;
}
