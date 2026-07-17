import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { canManageFolders } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const result = await pool.query(
      `SELECT * FROM kb_folders WHERE company_id = $1 ORDER BY sort_order, id`,
      [user.company_id]
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
    if (!canManageFolders(user.role)) {
      throw new AuthError("仅公司管理员/销售经理可创建目录", 403);
    }
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return jsonError("目录名称必填");

    const parentId = body.parent_id ? Number(body.parent_id) : null;
    if (parentId) {
      const parent = await pool.query(
        `SELECT id FROM kb_folders WHERE id = $1 AND company_id = $2`,
        [parentId, user.company_id]
      );
      if (!parent.rows[0]) return jsonError("父目录不存在", 404);
    }

    const result = await pool.query(
      `INSERT INTO kb_folders (company_id, parent_id, name, sort_order, created_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [user.company_id, parentId, name, body.sort_order || 0, user.id]
    );

    await writeAuditLog({
      user,
      action: "kb.folder.create",
      targetType: "kb_folder",
      targetId: result.rows[0].id,
      summary: `创建知识库目录 ${name}`,
    });

    return jsonOk(result.rows[0], 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    if (!canManageFolders(user.role)) {
      throw new AuthError("仅公司管理员/销售经理可修改目录", 403);
    }
    const body = await request.json();
    const id = Number(body.id);
    if (!id) return jsonError("缺少目录 id");

    const result = await pool.query(
      `UPDATE kb_folders SET
        name = COALESCE($1, name),
        parent_id = COALESCE($2, parent_id),
        sort_order = COALESCE($3, sort_order),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND company_id = $5
       RETURNING *`,
      [
        body.name ?? null,
        body.parent_id !== undefined ? body.parent_id : null,
        body.sort_order ?? null,
        id,
        user.company_id,
      ]
    );
    if (!result.rows[0]) return jsonError("未找到", 404);
    return jsonOk(result.rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    if (!canManageFolders(user.role)) {
      throw new AuthError("仅公司管理员/销售经理可删除目录", 403);
    }
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!id) return jsonError("缺少目录 id");

    const child = await pool.query(
      `SELECT id FROM kb_folders WHERE parent_id = $1 LIMIT 1`,
      [id]
    );
    if (child.rows[0]) return jsonError("请先删除子目录");

    const files = await pool.query(
      `SELECT id FROM kb_files WHERE folder_id = $1 LIMIT 1`,
      [id]
    );
    if (files.rows[0]) return jsonError("请先删除目录内文件");

    await pool.query(
      `DELETE FROM kb_folders WHERE id = $1 AND company_id = $2`,
      [id, user.company_id]
    );
    await writeAuditLog({
      user,
      action: "kb.folder.delete",
      targetType: "kb_folder",
      targetId: id,
      summary: `删除知识库目录 ${id}`,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
