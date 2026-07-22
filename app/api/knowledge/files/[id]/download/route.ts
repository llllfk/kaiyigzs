import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { readObject } from "@/lib/storage";
import { handleApiError, jsonError } from "@/lib/api";
import { isRemoteDocumentUri } from "@/lib/coze-knowledge";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const result = await pool.query(`SELECT * FROM kb_files WHERE id = $1`, [id]);
    const file = result.rows[0];
    if (!file) return jsonError("未找到", 404);
    if (user.role !== "super_admin" && file.company_id !== user.company_id) {
      return jsonError("无权下载", 403);
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
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
