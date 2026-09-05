import { ensureProjectEnv } from '@/lib/env';

type WecomNotifyPayload = {
  name: string;
  contact: string;
  message: string;
  ip: string;
  ipLocation?: string;
};

function formatShanghaiTime(date = new Date()): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function clip(text: string, max: number): string {
  const value = text.trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function buildTemplateCard(payload: WecomNotifyPayload) {
  const submittedAt = formatShanghaiTime();
  const ipText = payload.ipLocation
    ? `${payload.ip}（${payload.ipLocation}）`
    : payload.ip;

  return {
    card_type: 'text_notice' as const,
    source: {
      desc: '凯艺官网',
      desc_color: 0,
    },
    main_title: {
      title: '收到新的联系留言',
      desc: '官网表单提交，请及时跟进',
    },
    quote_area: {
      type: 0,
      title: '留言内容',
      quote_text: clip(payload.message, 200),
    },
    horizontal_content_list: [
      { keyname: '姓名', value: clip(payload.name, 30) },
      { keyname: '联系方式', value: clip(payload.contact, 40) },
      { keyname: '提交时间', value: submittedAt },
      { keyname: '来源 IP', value: clip(ipText, 40) },
    ],
    card_action: {
      type: 1,
      // Required by WeCom; no dedicated detail page yet
      url: 'https://work.weixin.qq.com/',
    },
  };
}

/**
 * Notify a WeCom group robot after form submission.
 * Requires WECOM_WEBHOOK_URL in `.env.local` or process env.
 * Failures are logged and swallowed so form submission is not blocked.
 */
export async function notifyWecomContactSubmission(
  payload: WecomNotifyPayload
): Promise<void> {
  ensureProjectEnv();

  const webhookUrl = process.env.WECOM_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn(
      '[wecom] WECOM_WEBHOOK_URL is not set, skip notification. Put it in .env.local and restart the server.'
    );
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'template_card',
        template_card: buildTemplateCard(payload),
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[wecom] webhook HTTP error', res.status, body);
      return;
    }

    const result = (await res.json()) as { errcode?: number; errmsg?: string };
    if (result.errcode !== 0) {
      console.error('[wecom] webhook API error', result);
      return;
    }

    console.log('[wecom] card notification sent');
  } catch (err) {
    console.error('[wecom] notify failed', err);
  }
}
