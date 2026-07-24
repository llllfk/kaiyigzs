import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import {
  getPresignedGetUrl,
  publicUrlForObjectUri,
  readObject,
} from "@/lib/storage";
import { handleApiError, jsonError } from "@/lib/api";
import { isRemoteDocumentUri } from "@/lib/coze-knowledge";
import { resolvePublicRecordId } from "@/lib/public-id";
import { verifyKbDownloadToken } from "@/lib/kb-download-token";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const token = request.nextUrl.searchParams.get("token")?.trim() || "";
    const tokenPayload = token ? verifyKbDownloadToken(token) : null;

    // 带了 token 但校验失败：不要回落到 Session（系统浏览器通常无 Cookie）
    if (token && !tokenPayload) {
      return jsonError("下载链接无效或已过期，请返回 App 重新点击下载", 403);
    }

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

    const fileName = String(file.file_name || "download");
    const mime = file.mime ? String(file.mime) : "application/octet-stream";
    const uri = String(file.uri || "");

    // 对象存储：302 到预签名/公网地址，避免把整文件读进 Node 再转发
    const publicUrl = publicUrlForObjectUri(uri);
    if (publicUrl) {
      return NextResponse.redirect(publicUrl, 302);
    }
    const signed = await getPresignedGetUrl(uri, 300, {
      fileName,
      contentType: mime,
    });
    if (signed) {
      return NextResponse.redirect(signed, 302);
    }

    let buf: Buffer;
    try {
      buf = await readObject(uri);
    } catch (err) {
      console.error("[kb-download] readObject failed", uri, err);
      if (uri.startsWith("local://")) {
        return jsonError(
          "本地存档在当前服务器上不存在（可能已更换环境或未配置对象存储）。请重新上传文件后再下载。",
          404
        );
      }
      return jsonError("读取文件失败，请稍后重试或联系管理员检查对象存储配置", 502);
    }

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(buf.length),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
