import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { S3Client } from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "crypto";

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

function storageConfigured() {
  return Boolean(
    process.env.COZE_STORAGE_URL &&
      process.env.COZE_STORAGE_AK &&
      process.env.COZE_STORAGE_SK &&
      BUCKET_NAME
  );
}

const LOCAL_ROOT = path.join(process.cwd(), "storage");

export async function saveObject(params: {
  companyId: number;
  folder: "crm" | "kb";
  fileName: string;
  contentType?: string;
  body: Buffer;
}): Promise<{ uri: string; size: number }> {
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
    return { uri: `s3://${BUCKET_NAME}/${key}`, size: params.body.length };
  }

  const full = path.join(LOCAL_ROOT, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, params.body);
  return { uri: `local://${key}`, size: params.body.length };
}

export async function readObject(uri: string): Promise<Buffer> {
  if (uri.startsWith("local://")) {
    const key = uri.replace("local://", "");
    return readFile(path.join(LOCAL_ROOT, key));
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

export function contentFingerprint(buf: Buffer) {
  return createHash("sha1").update(buf).digest("hex").slice(0, 12);
}
