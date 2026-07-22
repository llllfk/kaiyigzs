import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { parsePageParams, resolvePagination } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    const sp = request.nextUrl.searchParams;
    const unreadOnly = sp.get("unread") === "1";
    const { paginate, page, pageSize } = parsePageParams(sp);
    const where = `WHERE user_id = $1 ${unreadOnly ? "AND read_at IS NULL" : ""}`;

    if (!paginate) {
      const result = await pool.query(
        `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT 100`,
        [user.id]
      );
      return jsonOk(result.rows);
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM notifications ${where}`,
      [user.id]
    );
    const total = countRes.rows[0]?.total ?? 0;
    const { meta, offset, limit } = resolvePagination(total, page, pageSize);
    const result = await pool.query(
      `SELECT * FROM notifications ${where}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [user.id, limit, offset]
    );
    return jsonOk(result.rows, 200, meta);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSession();
    const body = await request.json();
    if (body.all) {
      await pool.query(
        `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND read_at IS NULL`,
        [user.id]
      );
      return jsonOk({ ok: true });
    }
    const id = Number(body.id);
    if (!id) return jsonError("缺少通知 id");
    await pool.query(
      `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2`,
      [id, user.id]
    );
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
