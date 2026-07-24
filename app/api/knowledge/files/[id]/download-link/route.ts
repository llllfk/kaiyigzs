import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isRemoteDocumentUri } from "@/lib/coze-knowledge";
import { resolvePublicRecordId } from "@/lib/public-id";
import {
  createKbDownloadToken,
  publicAppOrigin,
} from "@/lib/kb-download-token";
import {
  getPresignedGetUrl,
  publicUrlForObjectUri,
} from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/** 签发短时下载链接，供 App 用系统浏览器打开（不依赖 WebView Cookie） */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const resolved = await resolvePublicRecordId("kb_files", (await params).id);
    if (!resolved) return jsonError("未找到", 404);
    const id = String(resolved.id);
    const result = await pool.query(`SELECT * FROM kb_files WHERE id = $1`, [id]);
    const file = result.rows[0];
    if (!file) return jsonError("未找到", 404);

    if (
      user.role !== "super_admin" &&
      Number(file.company_id) !== Number(user.company_id)
    ) {
      return jsonError("无权下载", 403);
    }

    if (isRemoteDocumentUri(file.uri)) {
      return jsonError(
        "该文件仅存在于知识库（如在后台导入的表格），本系统无本地副本，无法下载。请到知识库后台查看或导出。",
        400
      );
    }

    const fileName = String(file.file_name || "download");
    const mime = file.mime ? String(file.mime) : undefined;

    // 优先直链：系统浏览器直接拉对象存储，避免经 API 代理读文件失败变成 500 JSON
    const publicUrl = publicUrlForObjectUri(String(file.uri));
    if (publicUrl) {
      return jsonOk({
        url: publicUrl,
        file_name: fileName,
        expires_in: 3600,
        mode: "public",
      });
    }

    const signed = await getPresignedGetUrl(String(file.uri), 300, {
      fileName,
      contentType: mime,
    });
    if (signed) {
      return jsonOk({
        url: signed,
        file_name: fileName,
        expires_in: 300,
        mode: "presigned",
      });
    }

    const token = createKbDownloadToken({
      fileId: Number(file.id),
      companyId: user.company_id,
      userId: user.id,
      ttlSec: 120,
    });
    // 优先当前访问 Origin，避免 PUBLIC_APP_BASE_URL 与自定义域名不一致
    const origin =
      request.headers.get("origin")?.replace(/\/$/, "") ||
      publicAppOrigin(request.nextUrl, null);
    const url = `${origin}/api/knowledge/files/${encodeURIComponent(
      String(file.public_id || file.id)
    )}/download?token=${encodeURIComponent(token)}`;

    return jsonOk({
      url,
      file_name: fileName,
      expires_in: 120,
      mode: "token",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
