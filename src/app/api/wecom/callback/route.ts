import { NextRequest, NextResponse } from 'next/server';
import {
  decryptWecomEchostr,
  getWecomCallbackConfig,
  verifyWecomSignature,
} from '@/lib/wecom-callback-crypto';
import { updateTemplateCardAfterClick } from '@/lib/wecom-template-card';
import {
  markTemplateCardTaskDone,
  releaseTemplateCardTask,
  tryClaimTemplateCardTask,
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

  // Always ack quickly so WeCom does not retry endlessly
  return new NextResponse('success');
}

async function handleTemplateCardEvent(msg: {
  eventKey: string;
  taskId: string;
  responseCode: string;
  fromUser: string;
  agentId: string;
}) {
  if (!msg.taskId) {
    console.warn('[wecom-callback] skip card event, missing taskId');
    return;
  }

  const replaceText = alarmButtonLabel(msg.eventKey);
  const agentId =
    Number(msg.agentId) || Number(process.env.WECOM_AGENT_ID || '0') || 0;

  let claim: 'claimed' | 'duplicate' = 'claimed';
  try {
    claim = await tryClaimTemplateCardTask({
      taskId: msg.taskId,
      eventKey: msg.eventKey,
      fromUser: msg.fromUser || 'unknown',
      replaceText,
      responseCode: msg.responseCode,
      agentId: agentId || undefined,
    });
  } catch (err) {
    console.error('[wecom-callback] claim task failed', err);
    // If DB is down, still try update once to avoid stuck clickable buttons
    claim = 'claimed';
  }

  if (claim === 'duplicate') {
    console.log('[wecom-callback] duplicate click ignored', {
      taskId: msg.taskId,
      eventKey: msg.eventKey,
      fromUser: msg.fromUser,
    });
    return;
  }

  if (!msg.responseCode || !msg.fromUser || !agentId) {
    console.warn('[wecom-callback] skip card update, missing fields', {
      hasResponseCode: Boolean(msg.responseCode),
      fromUser: msg.fromUser,
      agentId,
    });
    return;
  }

  try {
    await updateTemplateCardAfterClick({
      agentId,
      responseCode: msg.responseCode,
      userId: msg.fromUser,
      replaceText,
    });
    await markTemplateCardTaskDone(msg.taskId).catch((err) => {
      console.error('[wecom-callback] mark done failed', err);
    });
    console.log('[wecom-callback] card updated', {
      eventKey: msg.eventKey,
      replaceText,
      taskId: msg.taskId,
    });
  } catch (err) {
    console.error('[wecom-callback] update card failed', err);
    await releaseTemplateCardTask(msg.taskId).catch((releaseErr) => {
      console.error('[wecom-callback] release claim failed', releaseErr);
    });
  }
}
