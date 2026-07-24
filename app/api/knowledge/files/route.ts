import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { canManageFolders } from "@/lib/permissions";
import { deleteObject, saveObject } from "@/lib/storage";
import { writeAuditLog, createNotification } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import {
  KnowledgeSyncError,
  deleteDocumentFromCoze,
  isRemoteDocumentUri,
  listCompanyCozeDatasets,
  uploadDocumentToCoze,
} from "@/lib/coze-knowledge";
import { COZE_TYPE_EXTS } from "@/lib/coze-datasets";
import { parsePageParams, resolvePagination } from "@/lib/pagination";
import { assertSafeUpload } from "@/lib/file-security";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const sp = request.nextUrl.searchParams;
    const folderId = sp.get("folder_id");
    if (!folderId) return jsonError("缺少 folder_id");
    const datasetId = String(sp.get("dataset_id") || "").trim();
    const { paginate, page, pageSize } = parsePageParams(sp);

    const params: Array<string | number> = [user.company_id, Number(folderId)];
    let fromSql = `FROM kb_files f
       LEFT JOIN users u ON u.id = f.uploader_id
       WHERE f.company_id = $1 AND f.folder_id = $2`;
    if (datasetId) {
      params.push(datasetId);
      // 未绑定库的旧文件：仅在选中该库时一并显示（避免切换后“消失”）
      fromSql += ` AND (f.coze_dataset_id = $${params.length} OR f.coze_dataset_id IS NULL)`;
    }
    const selectSql = `SELECT f.*, u.name AS uploader_name`;
    const listed = await listCompanyCozeDatasets(user.company_id);
    const extraMeta = {
      coze_dataset_configured: Boolean(listed),
      coze_datasets: listed?.datasets || [],
      can_upload: canManageFolders(user),
      dataset_id: datasetId || null,
    };

    if (!paginate) {
      const result = await pool.query(
        `${selectSql} ${fromSql} ORDER BY f.created_at DESC`,
        params
      );
      return jsonOk(result.rows, 200, extraMeta);
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total ${fromSql}`,
      params
    );
    const total = countRes.rows[0]?.total ?? 0;
    const { meta, offset, limit } = resolvePagination(total, page, pageSize);
    const result = await pool.query(
      `${selectSql} ${fromSql}
       ORDER BY f.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return jsonOk(result.rows, 200, { ...meta, ...extraMeta });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    if (!canManageFolders(user)) {
      throw new AuthError("仅公司管理员或销售经理可上传知识库文件", 403);
    }

    const form = await request.formData();
    const folderId = Number(form.get("folder_id") || 0);
    const datasetId = String(form.get("dataset_id") || "").trim();
    const localOnly =
      String(form.get("local_only") || "") === "1" ||
      String(form.get("local_only") || "").toLowerCase() === "true";
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
    assertSafeUpload(blob,buf,{ maxBytes:100*1024*1024, allowedExts:["txt","md","pdf","doc","docx","xls","xlsx","csv","ppt","pptx","jpg","jpeg","png","webp"] });
    const ext = blob.name.includes(".")
      ? blob.name.slice(blob.name.lastIndexOf(".") + 1).toLowerCase()
      : "";

    const listed = await listCompanyCozeDatasets(user.company_id);
    if (!listed) {
      return jsonError(
        "未配置知识库。请超级管理员在「公司管理 → AI 配置」中添加知识库"
      );
    }

    const targetDatasetId = datasetId || listed.datasets[0]?.id || "";
    const targetDataset =
      listed.datasets.find((d) => d.id === targetDatasetId) || listed.datasets[0];

    // 表格文件：仅存本系统；每个表格知识库只保留一份存档（可覆盖）
    const asLocalOnly = localOnly || targetDataset?.type === "table";
    if (asLocalOnly) {
      if (!COZE_TYPE_EXTS.table.has(ext)) {
        return jsonError("仅本系统上传仅支持 xls / xlsx / csv");
      }
      if (buf.length > 20 * 1024 * 1024) {
        return jsonError("表格文件不能超过 20MB");
      }
      if (!targetDatasetId) {
        return jsonError("请选择表格知识库");
      }

      const existingRes = await pool.query(
        `SELECT id, file_name, uri, folder_id, coze_sync_status
         FROM kb_files
         WHERE company_id = $1 AND coze_dataset_id = $2
           AND (
             coze_sync_status IN ('local_only', 'linked_table', 'mapped')
             OR coze_document_id IS NULL
           )
         ORDER BY created_at DESC`,
        [user.company_id, targetDatasetId]
      );
      const existing = existingRes.rows;
      const replace =
        String(form.get("replace") || "") === "1" ||
        String(form.get("replace") || "").toLowerCase() === "true";

      if (existing.length > 0 && !replace) {
        return jsonError(
          `该表格知识库已有存档「${existing[0].file_name}」，每个表格库只能保留一张表。请确认覆盖后重试。`,
          409,
          {
            code: "TABLE_ARCHIVE_EXISTS",
            existing: existing.map((r) => ({
              id: Number(r.id),
              file_name: r.file_name,
              folder_id: Number(r.folder_id),
            })),
          }
        );
      }

      let savedUri = "";
      try {
        const saved = await saveObject({
          companyId: user.company_id,
          folder: "kb",
          fileName: blob.name,
          contentType: blob.type || undefined,
          body: buf,
        });
        savedUri = saved.uri;

        for (const old of existing) {
          if (old.uri && !isRemoteDocumentUri(String(old.uri))) {
            await deleteObject(String(old.uri));
          }
          await pool.query(`DELETE FROM kb_files WHERE id = $1 AND company_id = $2`, [
            old.id,
            user.company_id,
          ]);
        }

        const result = await pool.query(
          `INSERT INTO kb_files
            (company_id, folder_id, file_name, uri, mime, size_bytes, uploader_id,
             coze_document_id, coze_dataset_id, coze_sync_status, coze_sync_error)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,'local_only',NULL)
           RETURNING *`,
          [
            user.company_id,
            folderId,
            blob.name,
            saved.uri,
            blob.type || null,
            saved.size,
            user.id,
            targetDatasetId,
          ]
        );

        await writeAuditLog({
          user,
          action: "kb.file.upload_local",
          targetType: "kb_file",
          targetId: result.rows[0].id,
          summary: existing.length
            ? `替换表格存档「${existing[0].file_name}」→「${blob.name}」（仅本系统）`
            : `上传表格存档（仅本系统）${blob.name}`,
        });

        return jsonOk(
          { ...result.rows[0], local_only: true, replaced: existing.length > 0 },
          201,
          { local_only: true, replaced: existing.length > 0 }
        );
      } catch (err) {
        if (savedUri) await deleteObject(savedUri);
        const msg = err instanceof Error ? err.message : "保存文件失败";
        return jsonError(msg, 500);
      }
    }

    if (buf.length > 100 * 1024 * 1024) return jsonError("单文件不能超过 100MB");

    let cozeDocumentId: string;
    let syncedDatasetId: string;
    try {
      const uploaded = await uploadDocumentToCoze({
        companyId: user.company_id,
        fileName: blob.name,
        buffer: buf,
        datasetId: targetDatasetId,
      });
      cozeDocumentId = uploaded.documentId;
      syncedDatasetId = uploaded.datasetId;
    } catch (err) {
      const friendly =
        err instanceof KnowledgeSyncError
          ? err.friendly
          : err instanceof Error
            ? err.message
            : "同步到知识库失败";
      const detail =
        err instanceof KnowledgeSyncError
          ? { ...err.detail, friendly: err.friendly, record: err.toRecord() }
          : { friendly, raw: friendly };
      console.error("[kb.file.upload.sync_failed]", {
        companyId: user.company_id,
        fileName: blob.name,
        size: buf.length,
        datasetId: targetDatasetId,
        datasetType: targetDataset?.type,
        error: friendly,
      });
      await writeAuditLog({
        user,
        action: "kb.file.sync_failed",
        targetType: "kb_file",
        summary: `上传失败（未保存文件）${blob.name}（${targetDataset?.type || "?"} / ${targetDatasetId}）：${friendly}`,
      });
      return jsonError(friendly, 502, detail);
    }

    let savedUri = "";
    try {
      const saved = await saveObject({
        companyId: user.company_id,
        folder: "kb",
        fileName: blob.name,
        contentType: blob.type || undefined,
        body: buf,
      });
      savedUri = saved.uri;

      const result = await pool.query(
        `INSERT INTO kb_files
          (company_id, folder_id, file_name, uri, mime, size_bytes, uploader_id,
           coze_document_id, coze_dataset_id, coze_sync_status, coze_sync_error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'synced',NULL)
         RETURNING *`,
        [
          user.company_id,
          folderId,
          blob.name,
          saved.uri,
          blob.type || null,
          saved.size,
          user.id,
          cozeDocumentId,
          syncedDatasetId || targetDatasetId || null,
        ]
      );

      await writeAuditLog({
        user,
        action: "kb.file.upload",
        targetType: "kb_file",
        targetId: result.rows[0].id,
        summary: `上传知识库文件 ${blob.name}（库 ${syncedDatasetId} / ${cozeDocumentId}）`,
      });

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
          body: `${user.name} 上传了 ${blob.name}（已同步知识库）`,
          link: "/knowledge",
        });
      }
      return jsonOk(result.rows[0], 201);
    } catch (err) {
      if (savedUri) await deleteObject(savedUri);
      try {
        await deleteDocumentFromCoze({
          companyId: user.company_id,
          documentId: cozeDocumentId,
        });
      } catch (cleanupErr) {
        console.error("[kb.file.upload.rollback]", cleanupErr);
      }
      const msg = err instanceof Error ? err.message : "保存知识库文件失败";
      await writeAuditLog({
        user,
        action: "kb.file.sync_failed",
        targetType: "kb_file",
        summary: `上传失败（未保存文件）${blob.name}：${msg}`,
      });
      return jsonError(msg, 500);
    }
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

    if (!canManageFolders(user)) {
      throw new AuthError("仅公司管理员或销售经理可删除知识库文件", 403);
    }

    // 映射/仅本系统/表格库关联：知识库数据由后台维护，不随系统删除。
    const shouldDeleteRemote =
      Boolean(file.coze_document_id) &&
      file.coze_sync_status !== "mapped" &&
      file.coze_sync_status !== "linked_table" &&
      file.coze_sync_status !== "local_only";

    if (shouldDeleteRemote) {
      try {
        await deleteDocumentFromCoze({
          companyId: user.company_id,
          documentId: String(file.coze_document_id),
        });
      } catch (err) {
        const detailMsg =
          err instanceof KnowledgeSyncError
            ? err.message
            : err instanceof Error
              ? err.message
              : "知识库侧删除失败";
        const detailPayload =
          err instanceof KnowledgeSyncError
            ? err.toRecord()
            : { raw: detailMsg };
        await writeAuditLog({
          user,
          action: "kb.file.delete_sync_failed",
          targetType: "kb_file",
          targetId: id,
          summary: `删除知识库侧失败 ${file.file_name}：${detailMsg}`,
        });
        return jsonError(
          err instanceof Error
            ? `知识库侧删除失败：${err.message}`
            : "知识库侧删除失败",
          502,
          detailPayload
        );
      }
    }

    if (file.uri && !isRemoteDocumentUri(file.uri)) {
      await deleteObject(String(file.uri));
    }

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
