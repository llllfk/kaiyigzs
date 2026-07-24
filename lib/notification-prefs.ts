import type { SessionUser, UserRole } from "@/types";

export const NOTIFICATION_TYPES = [
  "ai_done",
  "task",
  "stage_suggestion",
  "review",
  "pool",
  "kb",
  "account",
  "quote",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  ai_done: "解析完成",
  task: "待办提醒",
  stage_suggestion: "商机阶段建议",
  review: "成交复盘",
  pool: "公海动态",
  kb: "知识库",
  account: "账号相关",
  quote: "报价审批",
};

export const NOTIFICATION_TYPE_HINTS: Record<NotificationType, string> = {
  ai_done: "通话/聊天解析完成时通知",
  task: "AI 生成待办，或管理员/经理催办时通知",
  stage_suggestion: "AI 建议推进商机阶段时通知",
  review: "赢单/输单后的复盘提醒",
  pool: "公海领取、回收等相关通知",
  kb: "知识库文件上传/同步相关通知",
  account: "账号开通、密码、角色变更等",
  quote: "报价提交、通过、驳回等审批通知",
};

/** 各角色可配置的通知类型（设置页按角色展示） */
const ROLE_TYPES: Record<UserRole, NotificationType[]> = {
  sales: ["ai_done", "task", "stage_suggestion", "review", "pool", "account", "quote"],
  sales_manager: [
    "ai_done",
    "task",
    "stage_suggestion",
    "review",
    "pool",
    "kb",
    "account",
    "quote",
  ],
  company_admin: [
    "ai_done",
    "task",
    "stage_suggestion",
    "review",
    "pool",
    "kb",
    "account",
    "quote",
  ],
  super_admin: ["account", "kb"],
};

export type NotificationPrefs = Partial<Record<NotificationType, boolean>>;

/** 本地判定，避免客户端经 permissions → auth 引入 next/headers */
function prefsRole(user: SessionUser): UserRole {
  if (user.role === "super_admin" && user.act_as_company_id != null) {
    return "company_admin";
  }
  return user.role;
}

export function notificationTypesForUser(user: SessionUser): NotificationType[] {
  const role = prefsRole(user);
  return ROLE_TYPES[role] || ROLE_TYPES.sales;
}

export function isKnownNotificationType(type: string): type is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type);
}

/** 未配置视为开启；未知类型默认允许写入 */
export function isNotificationEnabled(
  prefs: NotificationPrefs | null | undefined,
  type: string,
  role: UserRole | string
): boolean {
  if (!isKnownNotificationType(type)) return true;
  const r = (role in ROLE_TYPES ? role : "sales") as UserRole;
  const allowed = ROLE_TYPES[r] || ROLE_TYPES.sales;
  if (!allowed.includes(type)) return false;
  if (!prefs || prefs[type] === undefined) return true;
  return prefs[type] !== false;
}

export function normalizeNotificationPrefs(
  raw: unknown,
  allowed: NotificationType[]
): NotificationPrefs {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const out: NotificationPrefs = {};
  for (const t of allowed) {
    out[t] = src[t] === false ? false : true;
  }
  return out;
}
