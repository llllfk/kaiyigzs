import { NextRequest, NextResponse } from 'next/server';
import {
  decryptWecomEchostr,
  getWecomCallbackConfig,
  verifyWecomSignature,
} from '@/lib/wecom-callback-crypto';

/**
 * WeCom self-built app "接收消息" URL verification + future message push.
 * Configure in WeCom as:
 *   https://crm.kaiyigzs.cn/api/wecom/callback
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
    // WeCom requires raw plaintext body (no JSON quotes)
    return new NextResponse(plain, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err) {
    console.error('[wecom-callback] decrypt failed', err);
    return new NextResponse('decrypt failed', { status: 400 });
  }
}

export async function POST() {
  // URL verification only for now; extend later to handle inbound messages.
  return new NextResponse('ok', { status: 200 });
}
