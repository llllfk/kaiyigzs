import { ensureProjectEnv } from '@/lib/env';

type UpdateCardBase = {
  agentId: number;
  responseCode: string;
  userId: string;
};

type ReplaceButtonInput = UpdateCardBase & {
  replaceText: string;
};

type ConfirmCardInput = UpdateCardBase & {
  taskId: string;
  pendingEventKey: string;
  actionLabel: string;
};

type RestoreAlarmCardInput = UpdateCardBase & {
  taskId: string;
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

async function postUpdateTemplateCard(body: Record<string, unknown>): Promise<void> {
  const accessToken = await getAccessToken();
  const api = `https://qyapi.weixin.qq.com/cgi-bin/message/update_template_card?access_token=${accessToken}`;
  const res = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json()) as { errcode?: number; errmsg?: string };
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`update_template_card failed: ${data.errcode} ${data.errmsg}`);
  }
}

/** Final state: gray unclickable button text. */
export async function updateTemplateCardAfterClick(
  input: ReplaceButtonInput
): Promise<void> {
  await postUpdateTemplateCard({
    userids: [input.userId],
    agentid: input.agentId,
    response_code: input.responseCode,
    button: {
      replace_name: input.replaceText,
    },
  });
}

/** Step 1 result: ask user to confirm/cancel the chosen action. */
export async function updateTemplateCardToConfirm(
  input: ConfirmCardInput
): Promise<void> {
  await postUpdateTemplateCard({
    userids: [input.userId],
    agentid: input.agentId,
    response_code: input.responseCode,
    template_card: {
      card_type: 'button_interaction',
      main_title: {
        title: '请确认操作',
        desc: `将执行：${input.actionLabel}`,
      },
      sub_title_text: '确认后不可撤销，取消可返回重新选择。',
      task_id: input.taskId,
      button_list: [
        {
          text: '确认',
          style: 1,
          key: `confirm_${input.pendingEventKey}`,
        },
        {
          text: '取消',
          style: 2,
          key: 'cancel_confirm',
        },
      ],
    },
  });
}

/** Cancel confirm: restore the original alarm action buttons. */
export async function updateTemplateCardToAlarmActions(
  input: RestoreAlarmCardInput
): Promise<void> {
  await postUpdateTemplateCard({
    userids: [input.userId],
    agentid: input.agentId,
    response_code: input.responseCode,
    template_card: {
      card_type: 'button_interaction',
      source: {
        desc: '凯艺报警',
        desc_color: 0,
      },
      main_title: {
        title: '设备报警待处理',
        desc: '请选择处理方式',
      },
      task_id: input.taskId,
      button_list: [
        { text: '已接手', style: 1, key: 'alarm_accept' },
        { text: '已处理', style: 1, key: 'alarm_done' },
        { text: '误报', style: 2, key: 'alarm_false' },
        { text: '升级', style: 2, key: 'alarm_escalate' },
      ],
    },
  });
}
