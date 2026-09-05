type WecomNotifyPayload = {
  name: string;
  contact: string;
  message: string;
  ip: string;
  ipLocation?: string;
};

/** Escape characters that break WeCom markdown rendering. */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+.!|-])/g, '\\$1');
}

/**
 * Notify a WeCom group robot after form submission.
 * Requires WECOM_WEBHOOK_URL (e.g. https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...).
 * Failures are logged and swallowed so form submission is not blocked.
 */
export async function notifyWecomContactSubmission(
  payload: WecomNotifyPayload
): Promise<void> {
  const webhookUrl = process.env.WECOM_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn('[wecom] WECOM_WEBHOOK_URL is not set, skip notification');
    return;
  }

  const location = payload.ipLocation
    ? ` (${escapeMarkdown(payload.ipLocation)})`
    : '';

  const content = [
    '### 官网联系表单新留言',
    `> **姓名**：${escapeMarkdown(payload.name)}`,
    `> **联系方式**：${escapeMarkdown(payload.contact)}`,
    `> **留言**：${escapeMarkdown(payload.message)}`,
    `> **IP**：${escapeMarkdown(payload.ip)}${location}`,
  ].join('\n');

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { content },
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[wecom] webhook HTTP error', res.status, body);
      return;
    }

    const result = (await res.json()) as { errcode?: number; errmsg?: string };
    if (result.errcode !== 0) {
      console.error('[wecom] webhook API error', result);
    }
  } catch (err) {
    console.error('[wecom] notify failed', err);
  }
}
