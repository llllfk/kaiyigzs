import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { canManageFolders } from "@/lib/permissions";
import { saveObject } from "@/lib/storage";
import { writeAuditLog, createNotification } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const folderId = request.nextUrl.searchParams.get("folder_id");
    if (!folderId) return jsonError("缺少 folder_id");

    const result = await pool.query(
      `SELECT f.*, u.name AS uploader_name
       FROM kb_files f
       LEFT JOIN users u ON u.id = f.uploader_id
       WHERE f.company_id = $1 AND f.folder_id = $2
       ORDER BY f.created_at DESC`,
      [user.company_id, Number(folderId)]
    );
    return jsonOk(result.rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const form = await request.formData();
    const folderId = Number(form.get("folder_id") || 0);
    const file = form.get("file");
    if (!folderId) return jsonError("请选择目录");
    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      return jsonError("请选择文件");
    }

    const folder = await pool.query(
      `SELECT id FROM kb_folders WHERE id = $1 AND company_id = $2`,
      [folderId, user.company_id]
    );
    if (!folder.rows[0]) return jsonError("目录不存在", 404);

    const blob = file as File;
    const buf = Buffer.from(await blob.arrayBuffer());
    if (buf.length > 200 * 1024 * 1024) return jsonError("单文件不能超过 200MB");

    const saved = await saveObject({
      companyId: user.company_id,
      folder: "kb",
      fileName: blob.name,
      contentType: blob.type || undefined,
      body: buf,
    });

    const result = await pool.query(
      `INSERT INTO kb_files
        (company_id, folder_id, file_name, uri, mime, size_bytes, uploader_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        user.company_id,
        folderId,
        blob.name,
        saved.uri,
        blob.type || null,
        saved.size,
        user.id,
      ]
    );

    await writeAuditLog({
      user,
      action: "kb.file.upload",
      targetType: "kb_file",
      targetId: result.rows[0].id,
      summary: `上传知识库文件 ${blob.name}`,
    });

    // notify company admins / managers lightly via uploader skip; notify managers optional
    const managers = await pool.query(
      `SELECT id FROM users
       WHERE company_id = $1 AND status='active'
         AND role IN ('company_admin','sales_manager')
         AND id != $2
       LIMIT 20`,
      [user.company_id, user.id]
    );
    for (const m of managers.rows) {
      await createNotification({
        companyId: user.company_id,
        userId: m.id,
        type: "kb",
        title: "知识库有新文件",
        body: `${user.name} 上传了 ${blob.name}`,
        link: "/knowledge",
      });
    }

    return jsonOk(result.rows[0], 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!id) return jsonError("缺少文件 id");

    const fileRes = await pool.query(
      `SELECT * FROM kb_files WHERE id = $1 AND company_id = $2`,
      [id, user.company_id]
    );
    const file = fileRes.rows[0];
    if (!file) return jsonError("未找到", 404);

    const canDelete =
      file.uploader_id === user.id || canManageFolders(user.role);
    if (!canDelete) throw new AuthError("无权删除该文件", 403);

    await pool.query(`DELETE FROM kb_files WHERE id = $1`, [id]);
    await writeAuditLog({
      user,
      action: "kb.file.delete",
      targetType: "kb_file",
      targetId: id,
      summary: `删除知识库文件 ${file.file_name}`,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
