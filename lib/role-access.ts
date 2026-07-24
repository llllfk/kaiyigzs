import type { SessionUser, UserRole } from "@/types";

/** 业务权限角色：超管进入公司视图时按公司管理员计（纯函数，可在客户端使用） */
export function effectiveCrmRole(user: SessionUser): UserRole {
  if (user.role === "super_admin" && user.act_as_company_id != null) {
    return "company_admin";
  }
  return user.role;
}

function asRole(roleOrUser: UserRole | SessionUser): UserRole {
  return typeof roleOrUser === "string" ? roleOrUser : effectiveCrmRole(roleOrUser);
}

/** 公司端声音合成：管理员/经理看全公司，销售仅本人 */
export function canViewAllCompanyVoiceLogs(
  roleOrUser: UserRole | SessionUser
): boolean {
  const role = asRole(roleOrUser);
  return (
    role === "company_admin" ||
    role === "sales_manager" ||
    role === "super_admin"
  );
}

/** 公司端音色管理：训练/删除等；销售仅可试听与合成 */
export function canManageCompanyVoices(
  roleOrUser: UserRole | SessionUser
): boolean {
  return canViewAllCompanyVoiceLogs(roleOrUser);
}
