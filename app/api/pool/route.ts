import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import {
  claimCustomerFromPool,
  releaseCustomerToPool,
  recycleStaleCustomers,
  maybeAutoRecycleStaleCustomers,
  getPoolRecycleDays,
  canAssignPool,
} from "@/lib/pool";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { parsePageParams, resolvePagination } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    // 自动回收不阻塞列表：限流后后台执行，避免导航被扫库拖住
    void maybeAutoRecycleStaleCustomers(user.company_id).catch(() => undefined);
    const days = await getPoolRecycleDays(user.company_id);
    const sp = request.nextUrl.searchParams;
    const q = sp.get("q")?.trim() || "";
    const { paginate, page, pageSize } = parsePageParams(sp);

    const params: unknown[] = [user.company_id];
    let where = `WHERE c.company_id = $1
        AND COALESCE(c.pool_status,'private') = 'public'`;
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (c.name ILIKE $${params.length} OR c.company_name ILIKE $${params.length} OR c.industry ILIKE $${params.length} OR c.phone ILIKE $${params.length})`;
    }
    const fromSql = `FROM customers c ${where}`;
    const selectSql = `SELECT c.*,
        COALESCE(
          (SELECT MAX(f.followed_at) FROM follow_ups f WHERE f.customer_id = c.id),
          c.claimed_at,
          c.created_at
        ) AS last_touch_at`;

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total ${fromSql}`,
      params
    );
    const total = countRes.rows[0]?.total ?? 0;

    let items;
    let meta;
    if (!paginate) {
      const result = await pool.query(
        `${selectSql} ${fromSql}
         ORDER BY c.created_at DESC
         LIMIT 200`,
        params
      );
      items = result.rows;
      meta = undefined;
    } else {
      const resolved = resolvePagination(total, page, pageSize);
      meta = resolved.meta;
      const listParams = [...params, resolved.limit, resolved.offset];
      const result = await pool.query(
        `${selectSql} ${fromSql}
         ORDER BY c.created_at DESC
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      );
      items = result.rows;
    }

    return jsonOk(
      {
        items,
        total,
        recycle_days: days,
        recycled_just_now: 0,
        can_assign: canAssignPool(user),
      },
      200,
      meta
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    const body = await request.json();
    const action = String(body.action || "");

    if (action === "recycle") {
      if (!user.company_id) return jsonError("缺少公司信息", 400);
      if (!canAssignPool(user)) {
        return jsonError("无权手动执行回收", 403);
      }
      const result = await recycleStaleCustomers(user.company_id);
      return jsonOk(result);
    }

    const customerId = Number(body.customer_id);
    if (!customerId) return jsonError("缺少客户 id");

    if (action === "claim") {
      const row = await claimCustomerFromPool({
        user,
        customerId,
        ownerId: body.owner_id ? Number(body.owner_id) : undefined,
      });
      return jsonOk(row);
    }

    if (action === "release") {
      const row = await releaseCustomerToPool({
        user,
        customerId,
        reason: body.reason,
      });
      return jsonOk(row);
    }

    return jsonError("未知操作");
  } catch (err) {
    return handleApiError(err);
  }
}
