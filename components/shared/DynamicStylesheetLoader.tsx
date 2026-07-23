"use client";

import { useEffect } from "react";

/**
 * 动态加载 Next.js 静态样式表
 * 解决平台 CDN 返回错误 MIME type (text/plain) 的问题
 * 移除原始 link 标签，通过 JavaScript 重新创建并显式设置 type="text/css"
 */
export function DynamicStylesheetLoader() {
  useEffect(() => {
    // 移除所有 Next.js CSS link 标签（它们会被浏览器因 MIME type 错误而拒绝）
    const styleSheets = document.querySelectorAll('link[rel="stylesheet"]');
    const cssUrls: string[] = [];

    styleSheets.forEach((link) => {
      const href = link.getAttribute("href");
      if (href && href.includes("/_next/static/css/")) {
        cssUrls.push(href);
        link.remove(); // 移除原始标签
      }
    });

    // 通过 JavaScript 重新加载，显式指定 type="text/css"
    cssUrls.forEach((href) => {
      const newLink = document.createElement("link");
      newLink.rel = "stylesheet";
      newLink.type = "text/css";
      newLink.href = href;
      document.head.appendChild(newLink);
    });
  }, []);

  return null;
}
