import { NextRequest } from "next/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import {
  confirmPublicQuote,
  listQuoteShareViews,
  loadPublicQuoteByToken,
  recordPublicQuoteView,
  serializeQuoteShare,
  updatePublicQuoteViewDuration,
  type PublicQuoteErrorCode,
} from "@/lib/quotes";
import { clientIp, enforceRateLimit } from "@/lib/security";

type Ctx = { params: Promise<{ token: string }> };

function publicError(code: PublicQuoteErrorCode) {
  const map: Record<PublicQuoteErrorCode, { status: number; message: string }> = {
    not_found: { status: 404, message: "链接无效或不存在" },
    revoked: { status: 410, message: "链接已失效（已撤销）" },
    expired: { status: 410, message: "链接已过期" },
    views_exhausted: { status: 410, message: "查看次数已用完" },
  };
  const item = map[code];
  return jsonError(item.message, item.status);
}

/** 只读加载，不计查看次数 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  try {
    const token = String((await ctx.params).token || "").trim();
    await enforceRateLimit({ key:`public-quote:get:${clientIp(_request)}:${token}`, limit:60, windowSeconds:300 });
    if (!token) return jsonError("缺少链接", 400);
    const loaded = await loadPublicQuoteByToken(token);
    if (!loaded.ok) return publicError(loaded.code);

    const confirmed = Boolean(loaded.share.confirmed_at);
    const exhausted =
      !confirmed &&
      Number(loaded.share.view_count) >= Number(loaded.share.max_views);

    return jsonOk({
      quote: loaded.quote,
      share: serializeQuoteShare(loaded.share, null, loaded.views),
      views_exhausted: exhausted,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * action=view           记录一次打开
 * action=view_duration  回写停留时长
 * 默认 / confirm        客户确认
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const token = String((await ctx.params).token || "").trim();
    await enforceRateLimit({ key:`public-quote:post:${clientIp(request)}:${token}`, limit:30, windowSeconds:300 });
    if (!token) return jsonError("缺少链接", 400);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "confirm");

    if (action === "view") {
      const result = await recordPublicQuoteView(token);
      if (!result.ok) return publicError(result.code);
      return jsonOk({
        share: serializeQuoteShare(result.share, null, result.views),
        counted: result.counted,
        view_id: result.view_id,
        viewed_at: "viewed_at" in result ? result.viewed_at : null,
      });
    }

    if (action === "view_duration") {
      const viewId = Number(body.view_id);
      const durationMs = Number(body.duration_ms);
      if (!Number.isFinite(viewId) || viewId <= 0) {
        return jsonError("缺少查看记录", 400);
      }
      const result = await updatePublicQuoteViewDuration({
        token,
        viewId,
        durationMs,
      });
      if (!result.ok) return publicError(result.code);
      return jsonOk({ view: result.view });
    }

    const result = await confirmPublicQuote({
      token,
      confirmerName: body.confirmer_name,
      confirmerNote: body.confirmer_note,
    });
    if (!result.ok) return publicError(result.code);
    const views = await listQuoteShareViews(result.share.id);
    return jsonOk({
      quote: result.quote,
      share: serializeQuoteShare(result.share, null, views),
      already: result.already,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
