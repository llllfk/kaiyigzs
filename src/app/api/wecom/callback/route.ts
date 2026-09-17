import { NextRequest, NextResponse } from 'next/server';
import {
  decryptWecomEchostr,
  getWecomCallbackConfig,
  verifyWecomSignature,
} from '@/lib/wecom-callback-crypto';
import {
  updateTemplateCardAfterClick,
  updateTemplateCardToAlarmActions,
  updateTemplateCardToConfirm,
} from '@/lib/wecom-template-card';
import {
  getTemplateCardTask,
  markTemplateCardTaskDone,
  releaseTemplateCardTask,
  tryBeginConfirm,
} from '@/lib/wecom-template-card-idempotency';
import {
  alarmButtonLabel,
  extractXmlTag,
  parseWecomXmlMessage,
} from '@/lib/wecom-xml';

/**
 * WeCom self-built app callback.
 * GET  = URL verification
 * POST = inbound messages / template card button events
 *
 * URL: https://www.kaiyigzs.cn/api/wecom/callback
 */
export async function GET(request: NextRequest) {
  const config = getWecomCallbackConfig();
  if (!config) {
    console.error(
      '[wecom-callback] missing WECOM_CORP_ID / WECOM_CALLBACK_TOKEN / WECOM_ENCODING_AES_KEY'
    );
    return new NextResponse('wecom callback env not configured', { status: 500 });
  }

  const msgSignature = request.nextUrl.searchParams.get('msg_signature') ?? '';
  const timestamp = request.nextUrl.searchParams.get('timestamp') ?? '';
  const nonce = request.nextUrl.searchParams.get('nonce') ?? '';
  const echostr = request.nextUrl.searchParams.get('echostr') ?? '';

  if (!msgSignature || !timestamp || !nonce || !echostr) {
    return new NextResponse('missing params', { status: 400 });
  }

  if (!verifyWecomSignature(config, msgSignature, timestamp, nonce, echostr)) {
    return new NextResponse('invalid signature', { status: 403 });
  }

  try {
    const plain = decryptWecomEchostr(config, echostr);
    return new NextResponse(plain, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err) {
    console.error('[wecom-callback] decrypt failed', err);
    return new NextResponse('decrypt failed', { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const config = getWecomCallbackConfig();
  if (!config) {
    console.error('[wecom-callback] env not configured');
    return new NextResponse('success');
  }

  const msgSignature = request.nextUrl.searchParams.get('msg_signature') ?? '';
  const timestamp = request.nextUrl.searchParams.get('timestamp') ?? '';
  const nonce = request.nextUrl.searchParams.get('nonce') ?? '';

  try {
    const rawBody = await request.text();
    const encrypt = extractXmlTag(rawBody, 'Encrypt');
    if (!encrypt) {
      console.error('[wecom-callback] missing Encrypt in body');
      return new NextResponse('success');
    }

    if (!verifyWecomSignature(config, msgSignature, timestamp, nonce, encrypt)) {
      console.error('[wecom-callback] invalid signature on POST');
      return new NextResponse('success');
    }

    const plainXml = decryptWecomEchostr(config, encrypt);
    const msg = parseWecomXmlMessage(plainXml);

    console.log('[wecom-callback] inbound', {
      msgType: msg.msgType,
      event: msg.event,
      eventKey: msg.eventKey,
      taskId: msg.taskId,
      fromUser: msg.fromUser,
      cardType: msg.cardType,
    });

    if (msg.msgType === 'event' && msg.event === 'template_card_event') {
      await handleTemplateCardEvent(msg);
    }
  } catch (err) {
    console.error('[wecom-callback] POST handle failed', err);
  }

  return new NextResponse('success');
}

type CardEvent = {
  eventKey: string;
  taskId: string;
  responseCode: string;
  fromUser: string;
  agentId: string;
};

function resolveAgentId(msg: CardEvent): number {
  return Number(msg.agentId) || Number(process.env.WECOM_AGENT_ID || '0') || 0;
}

function parseConfirmEventKey(eventKey: string): string | null {
  if (!eventKey.startsWith('confirm_')) return null;
  const pending = eventKey.slice('confirm_'.length);
  return pending.startsWith('alarm_') ? pending : null;
}

async function handleTemplateCardEvent(msg: CardEvent) {
  if (!msg.taskId) {
    console.warn('[wecom-callback] skip card event, missing taskId');
    return;
  }

  if (msg.eventKey === 'cancel_confirm') {
    await handleCancelConfirm(msg);
    return;
  }

  const pendingFromConfirm = parseConfirmEventKey(msg.eventKey);
  if (pendingFromConfirm) {
    await handleConfirm(msg, pendingFromConfirm);
    return;
  }

  if (msg.eventKey.startsWith('alarm_')) {
    await handlePrimaryAction(msg);
    return;
  }

  console.warn('[wecom-callback] unknown eventKey', msg.eventKey);
}

/** First click: ask for confirmation. */
async function handlePrimaryAction(msg: CardEvent) {
  const actionLabel = alarmButtonLabel(msg.eventKey);
  const agentId = resolveAgentId(msg);

  let claim: 'claimed' | 'duplicate' = 'claimed';
  try {
    claim = await tryBeginConfirm({
      taskId: msg.taskId,
      eventKey: msg.eventKey,
      fromUser: msg.fromUser || 'unknown',
      replaceText: actionLabel,
      responseCode: msg.responseCode,
      agentId: agentId || undefined,
    });
  } catch (err) {
    console.error('[wecom-callback] begin confirm failed', err);
    claim = 'claimed';
  }

  if (claim === 'duplicate') {
    console.log('[wecom-callback] primary click ignored (already in progress/done)', {
      taskId: msg.taskId,
      eventKey: msg.eventKey,
    });
    return;
  }

  if (!msg.responseCode || !msg.fromUser || !agentId) {
    console.warn('[wecom-callback] skip confirm card, missing fields');
    await releaseTemplateCardTask(msg.taskId).catch(() => undefined);
    return;
  }

  try {
    await updateTemplateCardToConfirm({
      agentId,
      responseCode: msg.responseCode,
      userId: msg.fromUser,
      taskId: msg.taskId,
      pendingEventKey: msg.eventKey,
      actionLabel,
    });
    console.log('[wecom-callback] confirm card shown', {
      taskId: msg.taskId,
      eventKey: msg.eventKey,
    });
  } catch (err) {
    console.error('[wecom-callback] show confirm failed', err);
    await releaseTemplateCardTask(msg.taskId).catch(() => undefined);
  }
}

/** Second click: confirm. */
async function handleConfirm(msg: CardEvent, pendingEventKey: string) {
  const row = await getTemplateCardTask(msg.taskId).catch(() => null);
  if (!row || row.status !== 'awaiting_confirm') {
    console.log('[wecom-callback] confirm ignored, invalid state', {
      taskId: msg.taskId,
      status: row?.status,
    });
    return;
  }

  if (row.event_key !== pendingEventKey) {
    console.log('[wecom-callback] confirm ignored, event mismatch', {
      expected: row.event_key,
      got: pendingEventKey,
    });
    return;
  }

  const agentId = resolveAgentId(msg);
  const replaceText = alarmButtonLabel(pendingEventKey);

  if (!msg.responseCode || !msg.fromUser || !agentId) {
    console.warn('[wecom-callback] confirm missing fields');
    return;
  }

  try {
    await updateTemplateCardAfterClick({
      agentId,
      responseCode: msg.responseCode,
      userId: msg.fromUser,
      replaceText,
    });
    await markTemplateCardTaskDone(msg.taskId);
    console.log('[wecom-callback] confirmed', {
      taskId: msg.taskId,
      eventKey: pendingEventKey,
      replaceText,
    });
  } catch (err) {
    console.error('[wecom-callback] confirm update failed', err);
  }
}

/** Cancel: restore original buttons and allow choosing again. */
async function handleCancelConfirm(msg: CardEvent) {
  const row = await getTemplateCardTask(msg.taskId).catch(() => null);
  if (!row || row.status !== 'awaiting_confirm') {
    console.log('[wecom-callback] cancel ignored, invalid state', {
      taskId: msg.taskId,
      status: row?.status,
    });
    return;
  }

  const agentId = resolveAgentId(msg);
  if (!msg.responseCode || !msg.fromUser || !agentId) {
    console.warn('[wecom-callback] cancel missing fields');
    return;
  }

  try {
    await updateTemplateCardToAlarmActions({
      agentId,
      responseCode: msg.responseCode,
      userId: msg.fromUser,
      taskId: msg.taskId,
    });
    await releaseTemplateCardTask(msg.taskId);
    console.log('[wecom-callback] confirm cancelled, actions restored', {
      taskId: msg.taskId,
    });
  } catch (err) {
    console.error('[wecom-callback] cancel restore failed', err);
  }
}
