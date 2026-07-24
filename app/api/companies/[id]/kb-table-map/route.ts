import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { listCompanyCozeDatasets } from "@/lib/coze-knowledge";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 表格知识库模型：每个库只有一种列结构，数据是按该结构写入的行，
 * 不是「一个上传文件对应一个知识库文档」。
 * 本接口仅做：本系统表格存档文件 ↔ 表格知识库（dataset）归属关联。
 */
export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    if (user.role !== "super_admin") {
      throw new AuthError("仅超级管理员可管理表格文件与知识库关联", 403);
    }
    const { id } = await params;
    const companyId = Number(id);
    if (!companyId) return jsonError("公司 id 无效");

    const company = await pool.query(`SELECT id, name FROM companies WHERE id = $1`, [
      companyId,
    ]);
    if (!company.rows[0]) return jsonError("公司不存在", 404);

    const listed = await listCompanyCozeDatasets(companyId);
    const tableDatasets = (listed?.datasets || []).filter((d) => d.type === "table");

    const localRes = await pool.query(
      `SELECT f.id, f.file_name, f.folder_id, f.size_bytes,
              f.coze_dataset_id, f.coze_sync_status, f.created_at,
              fo.name AS folder_name
       FROM kb_files f
       LEFT JOIN kb_folders fo ON fo.id = f.folder_id
       WHERE f.company_id = $1
         AND (
           f.coze_sync_status IN ('local_only', 'mapped', 'linked_table')
           OR f.file_name ILIKE '%.xls'
           OR f.file_name ILIKE '%.xlsx'
           OR f.file_name ILIKE '%.csv'
         )
       ORDER BY f.created_at DESC
       LIMIT 200`,
      [companyId]
    );

    return jsonOk(
      {
        local_files: localRes.rows.map((f) => ({
          id: Number(f.id),
          file_name: f.file_name,
          folder_id: Number(f.folder_id),
          folder_name: f.folder_name || null,
          size_bytes: f.size_bytes == null ? null : Number(f.size_bytes),
          coze_dataset_id: f.coze_dataset_id ? String(f.coze_dataset_id) : null,
          coze_sync_status: f.coze_sync_status || null,
          created_at: f.created_at,
        })),
        table_datasets: tableDatasets,
      },
      200,
      {
        company_id: companyId,
        company_name: company.rows[0].name,
        configured: tableDatasets.length > 0,
        model_note:
          "表格知识库为「列结构 + 行数据」。AI 检索的是知识库内结构化数据；本系统文件仅为存档/下载，关联后归入对应表格库分类。",
      }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST: 将本系统表格存档关联到某个表格知识库（dataset），或解除关联
 * body: { action: 'link'|'unlink', file_id, dataset_id? }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await requireSession();
    if (user.role !== "super_admin") {
      throw new AuthError("仅超级管理员可管理表格文件与知识库关联", 403);
    }
    const { id } = await params;
    const companyId = Number(id);
    if (!companyId) return jsonError("公司 id 无效");

    const body = await request.json();
    const action = String(body.action || "link").trim();
    const fileId = Number(body.file_id || 0);
    if (!fileId) return jsonError("缺少 file_id");

    const fileRes = await pool.query(
      `SELECT * FROM kb_files WHERE id = $1 AND company_id = $2`,
      [fileId, companyId]
    );
    const file = fileRes.rows[0];
    if (!file) return jsonError("系统文件不存在", 404);

    if (action === "unlink") {
      await pool.query(
        `UPDATE kb_files
         SET coze_document_id = NULL,
             coze_sync_status = 'local_only',
             coze_sync_error = NULL
         WHERE id = $1 AND company_id = $2`,
        [fileId, companyId]
      );
      await writeAuditLog({
        user,
        action: "kb.file.unlink_table",
        targetType: "kb_file",
        targetId: fileId,
        summary: `解除表格存档与知识库关联「${file.file_name}」`,
      });
      return jsonOk({ ok: true, file_id: fileId, linked: false });
    }

    const datasetId = String(body.dataset_id || "").trim();
    if (!datasetId) return jsonError("请选择表格知识库");

    const listed = await listCompanyCozeDatasets(companyId);
    const ds = listed?.datasets.find((d) => d.id === datasetId && d.type === "table");
    if (!ds) return jsonError("所选不是该公司的表格知识库");

    await pool.query(
      `UPDATE kb_files
       SET coze_dataset_id = $1,
           coze_document_id = NULL,
           coze_sync_status = 'linked_table',
           coze_sync_error = NULL
       WHERE id = $2 AND company_id = $3`,
      [datasetId, fileId, companyId]
    );

    await writeAuditLog({
      user,
      action: "kb.file.link_table",
      targetType: "kb_file",
      targetId: fileId,
      summary: `表格存档「${file.file_name}」关联到表格知识库「${ds.name || datasetId}」`,
    });

    return jsonOk({
      ok: true,
      file_id: fileId,
      dataset_id: datasetId,
      linked: true,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
