import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { assertCanAccessCustomer } from "@/lib/permissions";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { resolvePublicRecordId } from "@/lib/public-id";
import pool from "@/lib/db";
import {
  createQuoteShare,
  getActiveQuoteShare,
  getLatestQuoteShare,
  revokeQuoteShare,
  serializeQuoteShareWithViews,
} from "@/lib/quotes";

type Ctx = { params: Promise<{ id: string }> };

function requestOrigin(request: NextRequest) {
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) return `${proto}://${host}`;
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

async function loadQuote(companyId: number, quoteId: number) {
  const res = await pool.query(
    `SELECT * FROM quotes WHERE id = $1 AND company_id = $2`,
    [quoteId, companyId]
  );
  return res.rows[0] || null;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const resolved = await resolvePublicRecordId("quotes", (await ctx.params).id);
    if (!resolved) return jsonError("报价不存在", 404);
    const id = Number(resolved.id);
    const quote = await loadQuote(user.company_id, id);
    if (!quote) return jsonError("报价不存在", 404);
    await assertCanAccessCustomer(user, Number(quote.customer_id));

    const share =
      (await getActiveQuoteShare(id)) || (await getLatestQuoteShare(id));
    return jsonOk(await serializeQuoteShareWithViews(share, requestOrigin(request)));
  } catch (err) {
    return handleApiError(err);
  }
}

/** 生成（或重新生成）客户确认链接 */
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const resolved = await resolvePublicRecordId("quotes", (await ctx.params).id);
    if (!resolved) return jsonError("报价不存在", 404);
    const id = Number(resolved.id);
    const quote = await loadQuote(user.company_id, id);
    if (!quote) return jsonError("报价不存在", 404);
    await assertCanAccessCustomer(user, Number(quote.customer_id));

    const share = await createQuoteShare({ user, quote });
    return jsonOk(await serializeQuoteShareWithViews(share, requestOrigin(request)), 201);
  } catch (err) {
    return handleApiError(err);
  }
}

/** 撤销当前有效链接 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const resolved = await resolvePublicRecordId("quotes", (await ctx.params).id);
    if (!resolved) return jsonError("报价不存在", 404);
    const id = Number(resolved.id);
    const quote = await loadQuote(user.company_id, id);
    if (!quote) return jsonError("报价不存在", 404);
    await assertCanAccessCustomer(user, Number(quote.customer_id));

    await revokeQuoteShare({ user, quoteId: id });
    const latest = await getLatestQuoteShare(id);
    return jsonOk(await serializeQuoteShareWithViews(latest, requestOrigin(request)));
  } catch (err) {
    return handleApiError(err);
  }
}
