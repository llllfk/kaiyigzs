import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { readObject } from "@/lib/storage";
import { handleApiError, jsonError } from "@/lib/api";
import { isRemoteDocumentUri } from "@/lib/coze-knowledge";
import { resolvePublicRecordId } from "@/lib/public-id";
import { verifyKbDownloadToken } from "@/lib/kb-download-token";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const token = request.nextUrl.searchParams.get("token")?.trim() || "";
    const tokenPayload = token ? verifyKbDownloadToken(token) : null;

    const resolved = await resolvePublicRecordId("kb_files", (await params).id);
    if (!resolved) return jsonError("未找到", 404);
    const id = String(resolved.id);

    const result = await pool.query(`SELECT * FROM kb_files WHERE id = $1`, [id]);
    const file = result.rows[0];
    if (!file) return jsonError("未找到", 404);

    if (tokenPayload) {
      if (Number(tokenPayload.fileId) !== Number(resolved.id)) {
        return jsonError("下载链接无效", 403);
      }
      // 令牌绑定公司时校验租户；超管（companyId 为空）仅校验 fileId
      if (
        tokenPayload.companyId != null &&
        Number(file.company_id) !== Number(tokenPayload.companyId)
      ) {
        return jsonError("无权下载", 403);
      }
    } else {
      const user = await requireSession();
      if (
        user.role !== "super_admin" &&
        Number(file.company_id) !== Number(user.company_id)
      ) {
        return jsonError("无权下载", 403);
      }
    }

    if (isRemoteDocumentUri(file.uri)) {
      return jsonError(
        "该文件仅存在于知识库（如在后台导入的表格），本系统无本地副本，无法下载。请到知识库后台查看或导出。",
        400
      );
    }

    const buf = await readObject(file.uri);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": file.mime || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
        "Content-Length": String(buf.length),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
