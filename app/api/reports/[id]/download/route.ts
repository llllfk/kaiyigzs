import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api";
import { crmRole } from "@/lib/permissions";
import {
  ensureReportExportsTable,
  getReportSnapshot,
  reportPeriod,
  resolveReportScope,
} from "@/lib/reports";
import {
  buildReportXlsxBytes,
  reportAttachmentHeaders,
} from "@/lib/report-excel";

type Ctx = { params: Promise<{ id: string }> };

/** 历史下载：按记录参数现算 Excel，不读本地持久化文件 */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    await ensureReportExportsTable();

    const { id } = await params;
    const values: unknown[] = [Number(id), user.company_id];
    let where = "id = $1 AND company_id = $2";
    if (crmRole(user) === "sales") {
      values.push(user.id);
      where += ` AND created_by = $${values.length}`;
    }

    const result = await pool.query(
      `SELECT id, owner_id, period_type, period_key, file_name
       FROM report_exports
       WHERE ${where}`,
      values
    );
    const row = result.rows[0];
    if (!row) return jsonError("报表不存在", 404);

    const period = reportPeriod(String(row.period_type), String(row.period_key));
    const scope = await resolveReportScope(
      user,
      row.owner_id == null ? null : Number(row.owner_id)
    );
    const snapshot = await getReportSnapshot(
      Number(user.company_id),
      scope.ownerId,
      period.from,
      period.to
    );
    const ownerName =
      scope.ownerId == null
        ? null
        : snapshot.people.find(
            (p: { id: number }) => Number(p.id) === scope.ownerId
          )?.name || user.name;
    const payload = {
      ...snapshot,
      periodLabel: period.label,
      from: period.from,
      to: period.to,
      scopeLabel: scope.ownerId == null ? "全公司" : ownerName,
    };

    const bytes = await buildReportXlsxBytes(payload);
    const fileName =
      String(row.file_name || "").trim() ||
      `${snapshot.companyName}-${period.label}-${payload.scopeLabel}-经营报表.xlsx`;

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: reportAttachmentHeaders(fileName),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
