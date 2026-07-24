import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { getVisibleOwnerIds } from "@/lib/permissions";

/** 数据范围下拉：按可见负责人返回成员列表 */
export async function GET() {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonOk([]);

    const visible = await getVisibleOwnerIds(user);
    if (visible === "all" || visible === "company") {
      const r = await pool.query(
        `SELECT id, name, role FROM users
         WHERE company_id=$1 AND status='active' AND role IN ('sales','sales_manager')
         ORDER BY name`,
        [user.company_id]
      );
      return jsonOk(r.rows);
    }

    const ids = (Array.isArray(visible) ? visible : [user.id]).map(Number);
    const r = await pool.query(
      `SELECT id, name, role FROM users
       WHERE company_id=$1 AND status='active' AND id = ANY($2::bigint[])
         AND role IN ('sales','sales_manager')
       ORDER BY name`,
      [user.company_id, ids]
    );
    return jsonOk(r.rows);
  } catch (e) {
    return handleApiError(e);
  }
}
