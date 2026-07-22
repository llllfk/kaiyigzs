import pool from "@/lib/db";
import { AuthError, isActingAsCompany } from "@/lib/auth";
import type { SessionUser, UserRole } from "@/types";

/** 业务权限角色：超管进入公司视图时按公司管理员计 */
export function crmRole(user: SessionUser): UserRole {
  if (isActingAsCompany(user)) return "company_admin";
  return user.role;
}

function asRole(roleOrUser: UserRole | SessionUser): UserRole {
  return typeof roleOrUser === "string" ? roleOrUser : crmRole(roleOrUser);
}

export function canManageFolders(roleOrUser: UserRole | SessionUser) {
  const role = asRole(roleOrUser);
  return role === "company_admin" || role === "sales_manager";
}

export function canCreateSalesManager(roleOrUser: UserRole | SessionUser) {
  return asRole(roleOrUser) === "company_admin";
}

export function canCreateSales(roleOrUser: UserRole | SessionUser) {
  const role = asRole(roleOrUser);
  return role === "company_admin" || role === "sales_manager";
}

export function canViewAudit(roleOrUser: UserRole | SessionUser) {
  const role = asRole(roleOrUser);
  return role === "super_admin" || role === "company_admin";
}

export {
  canViewAllCompanyVoiceLogs,
  canManageCompanyVoices,
} from "@/lib/role-access";

export function canManagePoolRules(roleOrUser: UserRole | SessionUser) {
  const role = asRole(roleOrUser);
  return role === "company_admin" || role === "sales_manager";
}

/** 客户列表按负责人姓名搜索：仅公司管理员、销售经理（含超管进公司视图） */
export function canSearchCustomersByOwner(roleOrUser: UserRole | SessionUser) {
  const role = asRole(roleOrUser);
  return role === "company_admin" || role === "sales_manager";
}

/** Owner IDs visible to current user for customer-scoped data */
export async function getVisibleOwnerIds(user: SessionUser): Promise<number[] | "all" | "company"> {
  if (user.role === "super_admin" && !isActingAsCompany(user)) return "all";
  if (crmRole(user) === "company_admin") return "company";
  if (user.role === "sales") return [user.id];

  // sales_manager: self + direct reports
  const res = await pool.query(
    `SELECT id FROM users WHERE manager_id = $1 AND company_id = $2 AND status = 'active'`,
    [user.id, user.company_id]
  );
  return [user.id, ...res.rows.map((r: { id: number }) => r.id)];
}

function sameCompanyId(a: number | string | null | undefined, b: number | string | null | undefined) {
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

export function assertCompanyAccess(user: SessionUser, companyId: number | null) {
  if (user.role === "super_admin" && !isActingAsCompany(user)) return;
  if (!sameCompanyId(user.company_id, companyId)) {
    throw new AuthError("无权访问该公司数据", 403);
  }
}

export async function assertCanAccessCustomer(user: SessionUser, customerId: number) {
  const res = await pool.query(
    `SELECT id, company_id, owner_id, pool_status FROM customers WHERE id = $1`,
    [customerId]
  );
  const row = res.rows[0];
  if (!row) throw new AuthError("客户不存在", 404);
  assertCompanyAccess(user, row.company_id);

  // 公海客户：本公司全员可读（便于领取前查看）
  if (row.pool_status === "public") return row;

  const owners = await getVisibleOwnerIds(user);
  if (owners === "all" || owners === "company") return row;
  const ownerId = row.owner_id == null ? null : Number(row.owner_id);
  if (ownerId != null && owners.some((id) => Number(id) === ownerId)) return row;
  throw new AuthError("无权访问该客户", 403);
}

export function buildOwnerFilter(
  owners: number[] | "all" | "company",
  companyId: number | null,
  alias = "c",
  options?: { includePoolStatus?: boolean }
): { sql: string; params: unknown[] } {
  const includePool = options?.includePoolStatus ?? true;
  const poolClause = includePool
    ? ` AND COALESCE(${alias}.pool_status,'private') = 'private'`
    : "";

  if (owners === "all") {
    return { sql: "TRUE", params: [] };
  }
  if (owners === "company") {
    return {
      sql: `${alias}.company_id = $1${poolClause}`,
      params: [companyId],
    };
  }
  return {
    sql: `${alias}.company_id = $1${poolClause} AND ${alias}.owner_id = ANY($2::bigint[])`,
    params: [companyId, owners],
  };
}

/**
 * 在可见负责人范围内收窄到指定 owner_id。
 * 不可见时返回 null（忽略该筛选，避免越权窥探）。
 */
export function narrowOwnerId(
  visible: number[] | "all" | "company",
  requested: number | null
): number | null {
  if (requested == null) return null;
  if (visible === "all" || visible === "company") return requested;
  return visible.some((id) => Number(id) === requested) ? requested : null;
}
