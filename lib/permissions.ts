import pool from "@/lib/db";
import { AuthError } from "@/lib/auth";
import type { SessionUser, UserRole } from "@/types";

export function canManageFolders(role: UserRole) {
  return role === "company_admin" || role === "sales_manager";
}

export function canCreateSalesManager(role: UserRole) {
  return role === "company_admin";
}

export function canCreateSales(role: UserRole) {
  return role === "company_admin" || role === "sales_manager";
}

export function canViewAudit(role: UserRole) {
  return role === "super_admin" || role === "company_admin";
}

/** Owner IDs visible to current user for customer-scoped data */
export async function getVisibleOwnerIds(user: SessionUser): Promise<number[] | "all" | "company"> {
  if (user.role === "super_admin") return "all";
  if (user.role === "company_admin") return "company";
  if (user.role === "sales") return [user.id];

  // sales_manager: self + direct reports
  const res = await pool.query(
    `SELECT id FROM users WHERE manager_id = $1 AND company_id = $2 AND status = 'active'`,
    [user.id, user.company_id]
  );
  return [user.id, ...res.rows.map((r: { id: number }) => r.id)];
}

export function assertCompanyAccess(user: SessionUser, companyId: number | null) {
  if (user.role === "super_admin") return;
  if (!user.company_id || user.company_id !== companyId) {
    throw new AuthError("无权访问该公司数据", 403);
  }
}

export async function assertCanAccessCustomer(user: SessionUser, customerId: number) {
  const res = await pool.query(
    `SELECT id, company_id, owner_id FROM customers WHERE id = $1`,
    [customerId]
  );
  const row = res.rows[0];
  if (!row) throw new AuthError("客户不存在", 404);
  assertCompanyAccess(user, row.company_id);

  const owners = await getVisibleOwnerIds(user);
  if (owners === "all" || owners === "company") return row;
  if (!owners.includes(row.owner_id)) {
    throw new AuthError("无权访问该客户", 403);
  }
  return row;
}

export function buildOwnerFilter(
  owners: number[] | "all" | "company",
  companyId: number | null,
  alias = "c"
): { sql: string; params: unknown[] } {
  if (owners === "all") {
    return { sql: "TRUE", params: [] };
  }
  if (owners === "company") {
    return { sql: `${alias}.company_id = $1`, params: [companyId] };
  }
  return {
    sql: `${alias}.company_id = $1 AND ${alias}.owner_id = ANY($2::bigint[])`,
    params: [companyId, owners],
  };
}
