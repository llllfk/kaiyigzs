import { createDecipheriv, createHash } from 'crypto';
import { ensureProjectEnv } from '@/lib/env';

export type WecomCallbackConfig = {
  corpId: string;
  token: string;
  encodingAesKey: string;
};

export function getWecomCallbackConfig(): WecomCallbackConfig | null {
  ensureProjectEnv();

  const corpId = process.env.WECOM_CORP_ID?.trim();
  const token = process.env.WECOM_CALLBACK_TOKEN?.trim();
  const encodingAesKey = process.env.WECOM_ENCODING_AES_KEY?.trim();

  if (!corpId || !token || !encodingAesKey) {
    return null;
  }

  if (encodingAesKey.length !== 43) {
    throw new Error('WECOM_ENCODING_AES_KEY must be 43 characters');
  }

  return { corpId, token, encodingAesKey };
}

function sha1Signature(token: string, timestamp: string, nonce: string, encrypt: string): string {
  const raw = [token, timestamp, nonce, encrypt].sort().join('');
  return createHash('sha1').update(raw, 'utf8').digest('hex');
}

export function verifyWecomSignature(
  config: WecomCallbackConfig,
  msgSignature: string,
  timestamp: string,
  nonce: string,
  encrypt: string
): boolean {
  return sha1Signature(config.token, timestamp, nonce, encrypt) === msgSignature;
}

/**
 * Decrypt WeCom echostr / message body (AES-256-CBC).
 * Layout after decrypt: 16-byte random + 4-byte big-endian msg_len + msg + receiveid
 */
export function decryptWecomEchostr(config: WecomCallbackConfig, encryptText: string): string {
  const aesKey = Buffer.from(`${config.encodingAesKey}=`, 'base64');
  const decipher = createDecipheriv('aes-256-cbc', aesKey, aesKey.subarray(0, 16));
  decipher.setAutoPadding(true);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptText, 'base64')),
    decipher.final(),
  ]);

  const msgLen = decrypted.readUInt32BE(16);
  const msg = decrypted.subarray(20, 20 + msgLen).toString('utf8');
  const receiveId = decrypted.subarray(20 + msgLen).toString('utf8');

  if (receiveId !== config.corpId) {
    throw new Error(`receiveId mismatch: expected ${config.corpId}, got ${receiveId}`);
  }

  return msg;
}
