import { NextRequest } from "next/server";
import pool from "@/lib/db";
import {
  enterCompanyView,
  exitCompanyView,
  isActingAsCompany,
  requireSession,
} from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

/** POST { company_id } 进入公司业务视图；DELETE 退出 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role !== "super_admin") {
      return jsonError("仅超级管理员可进入公司业务视图", 403);
    }
    const body = await request.json().catch(() => ({}));
    const companyId = Number(body.company_id || 0);
    if (!companyId) return jsonError("缺少 company_id");

    const company = await pool.query(
      `SELECT id, name, status FROM companies WHERE id = $1`,
      [companyId]
    );
    if (!company.rows[0]) return jsonError("公司不存在", 404);
    if (company.rows[0].status !== "active") {
      return jsonError("该公司已停用，无法进入业务视图");
    }

    const next = await enterCompanyView(companyId, String(company.rows[0].name));
    await writeAuditLog({
      user: { ...user, company_id: null },
      action: "auth.enter_company_view",
      targetType: "company",
      targetId: companyId,
      summary: `进入公司业务视图「${company.rows[0].name}」`,
    });
    return jsonOk({
      ...next,
      acting: true,
      company_name: company.rows[0].name,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE() {
  try {
    const user = await requireSession();
    if (user.role !== "super_admin") {
      return jsonError("仅超级管理员可退出公司业务视图", 403);
    }
    if (!isActingAsCompany(user)) {
      return jsonOk({ ok: true, acting: false });
    }
    const companyId = user.act_as_company_id;
    const companyName = user.act_as_company_name;
    const next = await exitCompanyView();
    await writeAuditLog({
      user: { ...user, company_id: null, act_as_company_id: null },
      action: "auth.exit_company_view",
      targetType: "company",
      targetId: companyId || undefined,
      summary: `退出公司业务视图「${companyName || companyId || ""}」`,
    });
    return jsonOk({ ...next, acting: false });
  } catch (err) {
    return handleApiError(err);
  }
}
