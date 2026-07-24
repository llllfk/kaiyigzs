import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isRemoteDocumentUri } from "@/lib/coze-knowledge";
import { resolvePublicRecordId } from "@/lib/public-id";
import {
  createKbDownloadToken,
  publicAppOrigin,
} from "@/lib/kb-download-token";

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

    const token = createKbDownloadToken({
      fileId: Number(file.id),
      companyId: user.company_id,
      userId: user.id,
      ttlSec: 120,
    });
    const origin = publicAppOrigin(
      request.nextUrl,
      request.headers.get("origin")
    );
    const url = `${origin}/api/knowledge/files/${encodeURIComponent(
      String(file.public_id || file.id)
    )}/download?token=${encodeURIComponent(token)}`;

    return jsonOk({
      url,
      file_name: file.file_name,
      expires_in: 120,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
