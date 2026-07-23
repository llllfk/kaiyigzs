import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
function encryptionKey() {
  const raw = process.env.CONFIG_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new Error("CONFIG_ENCRYPTION_KEY 必须是 32 字节 Base64");
  return bytes;
}
export function encryptSecret(value: string) {
  if (!value || value.startsWith(PREFIX)) return value;
  const key=encryptionKey(); if(!key) return value;
  const iv=randomBytes(12); const cipher=createCipheriv("aes-256-gcm",key,iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}
export function decryptSecret(value: unknown) {
  const text=String(value||""); if(!text.startsWith(PREFIX)) return text;
  const key=encryptionKey(); if(!key) throw new Error("缺少 CONFIG_ENCRYPTION_KEY，无法读取加密配置");
  const [iv,tag,data]=text.slice(PREFIX.length).split(":");
  const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(iv,"base64url"));
  decipher.setAuthTag(Buffer.from(tag,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data,"base64url")),decipher.final()]).toString("utf8");
}
export function encryptCompanyConfig<T extends Record<string, any>>(input:T):T { return transform(input,encryptSecret); }
export function decryptCompanyConfig<T extends Record<string, any>>(input:T):T { return transform(input,decryptSecret); }
function transform<T extends Record<string, any>>(input:T,fn:(v:string)=>string):T {
  const out=structuredClone(input||{}) as any;
  for(const [section,fields] of [["coze",["api_key"]],["volc_asr",["api_key","access_token"]]] as const){
    if(!out[section]) continue; for(const field of fields) if(out[section][field]) out[section][field]=fn(String(out[section][field]));
  }
  return out;
}
