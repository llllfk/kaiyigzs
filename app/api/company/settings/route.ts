import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import {
  getPoolRecycleDays,
  setPoolRecycleDays,
  canManagePoolRules,
} from "@/lib/pool";
import {
  canManageQuoteRules,
  getQuoteSettings,
  setQuoteSettings,
} from "@/lib/quotes";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const company = await pool.query(
      `SELECT id, name, config FROM companies WHERE id = $1`,
      [user.company_id]
    );
    if (!company.rows[0]) return jsonError("公司不存在", 404);
    const days = await getPoolRecycleDays(user.company_id);
    const quote = await getQuoteSettings(user.company_id);
    return jsonOk({
      company: company.rows[0],
      pool_recycle_days: days,
      can_edit_pool_rules: canManagePoolRules(user),
      quote_settings: quote,
      can_edit_quote_rules: canManageQuoteRules(user),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSession();
    const body = await request.json();
    const out: Record<string, unknown> = {};

    if (body.pool_recycle_days != null) {
      out.pool_recycle_days = await setPoolRecycleDays(
        user,
        Number(body.pool_recycle_days)
      );
    }

    if (body.quote_settings && typeof body.quote_settings === "object") {
      out.quote_settings = await setQuoteSettings(user, body.quote_settings);
    }

    if (Object.keys(out).length === 0) {
      return jsonError("请提供要保存的设置项");
    }
    return jsonOk(out);
  } catch (err) {
    return handleApiError(err);
  }
}
