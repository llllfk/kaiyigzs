import { ensureProjectEnv } from '@/lib/env';

type UpdateTemplateCardInput = {
  agentId: number;
  responseCode: string;
  userId: string;
  replaceText: string;
};

async function getAccessToken(): Promise<string> {
  ensureProjectEnv();
  const corpId = process.env.WECOM_CORP_ID?.trim();
  const secret = process.env.WECOM_SECRET?.trim();
  if (!corpId || !secret) {
    throw new Error('missing WECOM_CORP_ID or WECOM_SECRET');
  }

  const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken');
  url.searchParams.set('corpid', corpId);
  url.searchParams.set('corpsecret', secret);

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = (await res.json()) as {
    errcode?: number;
    errmsg?: string;
    access_token?: string;
  };
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`gettoken failed: ${data.errcode} ${data.errmsg}`);
  }
  if (!data.access_token) {
    throw new Error('gettoken missing access_token');
  }
  return data.access_token;
}

/**
 * After a button click callback, disable buttons and show custom text.
 * Uses the minimal "button.replace_name" payload (avoids 41016 missing title).
 * response_code can only be used once within 72 hours.
 */
export async function updateTemplateCardAfterClick(
  input: UpdateTemplateCardInput
): Promise<void> {
  const accessToken = await getAccessToken();
  const api = `https://qyapi.weixin.qq.com/cgi-bin/message/update_template_card?access_token=${accessToken}`;

  const res = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userids: [input.userId],
      agentid: input.agentId,
      response_code: input.responseCode,
      button: {
        replace_name: input.replaceText,
      },
    }),
    signal: AbortSignal.timeout(8000),
  });

  const data = (await res.json()) as { errcode?: number; errmsg?: string };
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`update_template_card failed: ${data.errcode} ${data.errmsg}`);
  }
}
