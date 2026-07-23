import { DeleteObjectCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { S3Client } from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";

export const s3Client = new S3Client({
  endpoint: process.env.COZE_STORAGE_URL,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.COZE_STORAGE_AK || "",
    secretAccessKey: process.env.COZE_STORAGE_SK || "",
  },
});

export const BUCKET_NAME = process.env.COZE_STORAGE_BUCKET || "";

export function storageConfigured() {
  return Boolean(
    process.env.COZE_STORAGE_URL &&
      process.env.COZE_STORAGE_AK &&
      process.env.COZE_STORAGE_SK &&
      BUCKET_NAME
  );
}

const LOCAL_ROOT = path.join(process.cwd(), "storage");
function safeLocalPath(key: string) {
  const root=path.resolve(LOCAL_ROOT); const full=path.resolve(root,key);
  if(full!==root && !full.startsWith(root+path.sep)) throw new Error("非法存储路径");
  return full;
}

export async function saveObject(params: {
  companyId: number;
  folder: "crm" | "kb" | "voice";
  fileName: string;
  contentType?: string;
  body: Buffer;
}): Promise<{ uri: string; size: number; key: string }> {
  const safeName = params.fileName.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
  const key = `${params.companyId}/${params.folder}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;

  if (storageConfigured()) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: params.body,
        ContentType: params.contentType || "application/octet-stream",
      })
    );
    return { uri: `s3://${BUCKET_NAME}/${key}`, size: params.body.length, key };
  }

  const full = safeLocalPath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, params.body);
  return { uri: `local://${key}`, size: params.body.length, key };
}

/** 对象存储公网基址（桶可读时）→ 拼出 https URL */
export function publicUrlForObjectUri(uri: string): string | null {
  const base = process.env.COZE_STORAGE_PUBLIC_BASE?.trim().replace(/\/$/, "");
  if (!base || !uri.startsWith("s3://")) return null;
  const without = uri.replace("s3://", "");
  const slash = without.indexOf("/");
  if (slash < 0) return null;
  const key = without.slice(slash + 1);
  return `${base}/${key}`;
}

/** S3 预签名下载地址（火山可拉取） */
export async function getPresignedGetUrl(
  uri: string,
  expiresIn = 3600
): Promise<string | null> {
  if (!uri.startsWith("s3://") || !storageConfigured()) return null;
  try {
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const without = uri.replace("s3://", "");
    const slash = without.indexOf("/");
    const bucket = without.slice(0, slash);
    const key = without.slice(slash + 1);
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: bucket || BUCKET_NAME, Key: key }),
      { expiresIn }
    );
  } catch (err) {
    console.error("[storage.getPresignedGetUrl]", err);
    return null;
  }
}

export async function readObject(uri: string): Promise<Buffer> {
  if (uri.startsWith("local://")) {
    const key = uri.replace("local://", "");
    return readFile(safeLocalPath(key));
  }
  if (uri.startsWith("s3://")) {
    const without = uri.replace("s3://", "");
    const slash = without.indexOf("/");
    const bucket = without.slice(0, slash);
    const key = without.slice(slash + 1);
    const res = await s3Client.send(
      new GetObjectCommand({ Bucket: bucket || BUCKET_NAME, Key: key })
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error("空文件");
    return Buffer.from(bytes);
  }
  throw new Error("不支持的 URI");
}

/** Best-effort cleanup when upload/analyze fails — never throws. */
export async function deleteObject(uri: string): Promise<void> {
  try {
    if (!uri) return;
    if (uri.startsWith("local://")) {
      const key = uri.replace("local://", "");
      await unlink(safeLocalPath(key)).catch(() => undefined);
      return;
    }
    if (uri.startsWith("s3://") && storageConfigured()) {
      const without = uri.replace("s3://", "");
      const slash = without.indexOf("/");
      const bucket = without.slice(0, slash);
      const key = without.slice(slash + 1);
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket || BUCKET_NAME,
          Key: key,
        })
      );
    }
  } catch (err) {
    console.error("[storage.deleteObject]", uri, err);
  }
}

export function contentFingerprint(buf: Buffer) {
  return createHash("sha1").update(buf).digest("hex").slice(0, 12);
}
