import { cn } from "@/lib/utils";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 轻量渲染 AI 回复中的常见 Markdown，避免 ### ** 原样显示 */
export function formatAiMarkdown(raw: string): string {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  const inline = (s: string) => {
    let t = escapeHtml(s);
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1 text-[0.9em]">$1</code>');
    return t;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      html.push('<div class="h-2"></div>');
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const size =
        level <= 2 ? "text-base font-bold mt-1" : "text-sm font-semibold mt-1";
      html.push(`<div class="${size}">${inline(heading[2])}</div>`);
      continue;
    }

    const li = trimmed.match(/^[-*•]\s+(.+)$/) || trimmed.match(/^\d+[.)、]\s*(.+)$/);
    if (li) {
      if (!inList) {
        html.push('<ul class="my-1 list-disc space-y-1 pl-5">');
        inList = true;
      }
      html.push(`<li>${inline(li[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p class="leading-6">${inline(trimmed)}</p>`);
  }
  closeList();
  return html.join("");
}

export function AiMessageContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div
      className={cn("text-sm [&_strong]:font-semibold", className)}
      dangerouslySetInnerHTML={{ __html: formatAiMarkdown(content) }}
    />
  );
}
