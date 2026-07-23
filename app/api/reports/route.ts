import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import {
  getReportSalesRows,
  getReportSnapshot,
  reportPeriod,
  reportPeriods,
  resolveReportScope,
} from "@/lib/reports";
import {
  buildReportXlsxBytes,
  reportAttachmentHeaders,
} from "@/lib/report-excel";

function normalizePeriod(
  period: ReturnType<typeof reportPeriod> | ReturnType<typeof reportPeriods>
) {
  if ("ranges" in period && Array.isArray(period.ranges)) {
    return period;
  }
  return {
    ...period,
    keys: [period.key],
    ranges: [{ from: period.from, to: period.to }],
    contiguous: true,
  };
}

function resolvePeriodFromSearch(sp: URLSearchParams) {
  const keysRaw = sp.get("period_keys")?.trim() || "";
  if (keysRaw) return normalizePeriod(reportPeriods(keysRaw.split(",")));
  return normalizePeriod(
    reportPeriod(
      String(sp.get("period_type") || ""),
      String(sp.get("period_key") || "")
    )
  );
}

function resolvePeriodFromBody(body: {
  period_keys?: unknown;
  period_type?: unknown;
  period_key?: unknown;
}) {
  const raw = body.period_keys;
  if (Array.isArray(raw)) {
    return normalizePeriod(reportPeriods(raw.map((k) => String(k))));
  }
  if (typeof raw === "string" && raw.trim()) {
    return normalizePeriod(reportPeriods(raw.split(",")));
  }
  return normalizePeriod(
    reportPeriod(
      String(body.period_type || ""),
      String(body.period_key || "")
    )
  );
}

/** 成员卡片数据（轻量，不含明细表） */
export async function GET(req: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const sp = req.nextUrl.searchParams;
    const period = resolvePeriodFromSearch(sp);
    const rawOwner = sp.get("owner_id");
    const requested =
      rawOwner == null || rawOwner === "" || rawOwner === "all"
        ? null
        : Number(rawOwner);
    const scope = await resolveReportScope(user, requested);
    const rows = await getReportSalesRows(
      Number(user.company_id),
      scope.ownerIds,
      period.ranges
    );

    return jsonOk({
      rows,
      periodLabel: period.label,
      from: period.from,
      to: period.to,
      contiguous: period.contiguous,
      scopeLabel: scope.scopeLabel,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/** 生成 Excel：临时构建后直接下载，不落盘、不写生成记录 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const body = await req.json();
    const period = resolvePeriodFromBody(body);
    if (!period.contiguous) {
      return jsonError("所选月份必须连续，请选择连续的月份区间后再导出", 400);
    }
    const requested =
      body.owner_id == null || body.owner_id === ""
        ? null
        : Number(body.owner_id);
    const scope = await resolveReportScope(user, requested);
    const snapshot = await getReportSnapshot(
      Number(user.company_id),
      scope.ownerIds,
      period.ranges
    );
    const payload = {
      ...snapshot,
      periodLabel: period.label,
      from: period.from,
      to: period.to,
      contiguous: period.contiguous,
      scopeLabel: scope.scopeLabel,
    };

    const bytes = await buildReportXlsxBytes(payload);
    const fileName = `${snapshot.companyName}-${period.label}-${scope.scopeLabel}-经营报表.xlsx`;

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: reportAttachmentHeaders(fileName),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
