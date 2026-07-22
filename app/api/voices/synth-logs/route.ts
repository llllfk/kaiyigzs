import { NextRequest } from "next/server";
import { requireSession, AuthError } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { parsePageParams } from "@/lib/pagination";
import { canViewAllCompanyVoiceLogs } from "@/lib/role-access";
import {
  listVoiceSynthLogs,
  getCompanySynthQuotaStatus,
  type VoiceSynthSource,
  type VoiceSynthStatus,
} from "@/lib/voice-synth-logs";

function requireCompanyId(user: Awaited<ReturnType<typeof requireSession>>) {
  if (!user.company_id) {
    throw new AuthError("请先进入公司视图", 403);
  }
  return Number(user.company_id);
}

/**
 * 公司端：本公司语音合成使用明细
 * 管理员/经理看全公司；销售仅本人
 * GET ?source=&status=&saved=&from=&to=&q=&page=&pageSize=
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    const companyId = requireCompanyId(user);

    const sp = request.nextUrl.searchParams;
    const { page, pageSize } = parsePageParams(sp, { always: true });
    const sourceRaw = String(sp.get("source") || "").trim();
    const statusRaw = String(sp.get("status") || "").trim();
    const savedRaw = String(sp.get("saved") || "").trim();
    const from = String(sp.get("from") || "").trim() || null;
    const to = String(sp.get("to") || "").trim() || null;
    const q = String(sp.get("q") || "").trim() || null;

    const source: VoiceSynthSource | null =
      sourceRaw === "clone" || sourceRaw === "official" ? sourceRaw : null;
    const status: VoiceSynthStatus | null =
      statusRaw === "success" || statusRaw === "failed" ? statusRaw : null;
    let saved: boolean | null = null;
    if (savedRaw === "1" || savedRaw === "true") saved = true;
    else if (savedRaw === "0" || savedRaw === "false") saved = false;

    const viewAll = canViewAllCompanyVoiceLogs(user);

    const result = await listVoiceSynthLogs({
      companyId,
      userId: viewAll ? null : Number(user.id),
      source,
      status,
      saved,
      from,
      to,
      q,
      page,
      pageSize,
    });

    const quota = await getCompanySynthQuotaStatus(companyId);

    return jsonOk(result.items, 200, {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      scope: viewAll ? "company" : "self",
      synth_quota: quota,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
