import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    const unreadOnly = request.nextUrl.searchParams.get("unread") === "1";
    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ${unreadOnly ? "AND read_at IS NULL" : ""}
       ORDER BY created_at DESC
       LIMIT 100`,
      [user.id]
    );
    return jsonOk(result.rows);
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
