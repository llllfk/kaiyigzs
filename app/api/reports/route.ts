import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
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

export async function GET() {
  try {
    const user = await requireSession();
    await ensureReportExportsTable();
    const values: unknown[] = [user.company_id];
    let where = "e.company_id = $1";
    if (crmRole(user) === "sales") {
      values.push(user.id);
      where += ` AND e.created_by = $${values.length}`;
    }
    const result = await pool.query(
      `SELECT e.id, e.period_type, e.period_key, e.scope, e.file_name, e.file_size,
              e.created_at, e.owner_id,
              o.name AS owner_name, c.name AS creator_name
       FROM report_exports e
       LEFT JOIN users o ON o.id = e.owner_id
       LEFT JOIN users c ON c.id = e.created_by
       WHERE ${where}
       ORDER BY e.created_at DESC
       LIMIT 100`,
      values
    );
    return jsonOk(result.rows);
  } catch (e) {
    return handleApiError(e);
  }
}

/** 生成 Excel：临时构建后直接下载；仅把生成记录写入数据库，不落盘持久化文件 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    await ensureReportExportsTable();

    const body = await req.json();
    const period = reportPeriod(
      String(body.period_type || ""),
      String(body.period_key || "")
    );
    const requested =
      body.owner_id == null || body.owner_id === ""
        ? null
        : Number(body.owner_id);
    const scope = await resolveReportScope(user, requested);
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
    const safeScope = scope.ownerId == null ? "全公司" : ownerName;
    const fileName = `${snapshot.companyName}-${period.label}-${safeScope}-经营报表.xlsx`;

    await pool.query(
      `INSERT INTO report_exports
        (company_id, created_by, owner_id, period_type, period_key, scope, file_name, file_path, file_size)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'', $8)`,
      [
        user.company_id,
        user.id,
        scope.ownerId,
        period.type,
        period.key,
        scope.scope,
        fileName,
        bytes.length,
      ]
    );

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: reportAttachmentHeaders(fileName),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
