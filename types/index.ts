export type UserRole =
  | "super_admin"
  | "company_admin"
  | "sales_manager"
  | "sales";

export type OpportunityStage =
  | "lead"
  | "contact"
  | "proposal"
  | "won"
  | "lost";

export type CustomerStatus = "active" | "paused" | "invalid";

export type TaskStatus = "pending" | "done";
export type TaskSource = "manual" | "ai";

export interface Company {
  id: number;
  name: string;
  status: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: number;
  company_id: number | null;
  manager_id: number | null;
  role: UserRole;
  name: string;
  email: string | null;
  phone: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SessionUser {
  id: number;
  company_id: number | null;
  manager_id: number | null;
  role: UserRole;
  name: string;
  email: string | null;
  phone?: string | null;
  /** 超级管理员进入某公司业务视图时设置 */
  act_as_company_id?: number | null;
  act_as_company_name?: string | null;
}

export interface Customer {
  id: number;
  company_id: number;
  owner_id: number;
  company_name: string | null;
  name: string;
  phone: string | null;
  industry: string | null;
  scale: string | null;
  source: string | null;
  status: CustomerStatus;
  tags: string[];
  profile_json: Record<string, unknown>;
  extra: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: number;
  company_id: number;
  customer_id: number;
  name: string;
  title: string | null;
  phone: string | null;
  wechat: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: number;
  company_id: number;
  customer_id: number;
  owner_id: number;
  title: string;
  stage: OpportunityStage;
  amount: number | null;
  expected_close_date: string | null;
  stage_suggestion_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUp {
  id: number;
  company_id: number;
  customer_id: number;
  opportunity_id: number | null;
  owner_id: number;
  type: string;
  content: string;
  followed_at: string;
  created_at: string;
}

export interface Task {
  id: number;
  company_id: number;
  customer_id: number | null;
  opportunity_id: number | null;
  owner_id: number;
  title: string;
  due_at: string | null;
  status: TaskStatus;
  source: TaskSource;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: number;
  company_id: number | null;
  user_id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "超级管理员",
  company_admin: "公司管理员",
  sales_manager: "销售经理",
  sales: "销售",
};

export const STAGE_LABELS: Record<OpportunityStage, string> = {
  lead: "新线索",
  contact: "沟通中",
  proposal: "报价中",
  won: "成交",
  lost: "流失",
};

export const FOLLOW_TYPE_LABELS: Record<string, string> = {
  call: "电话",
  wechat: "微信",
  visit: "拜访",
  email: "邮件",
};

export const INTENT_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
  unknown: "未知",
};

export const SENTIMENT_LABELS: Record<string, string> = {
  positive: "积极",
  neutral: "中性",
  negative: "消极",
};

export const MEDIA_KIND_LABELS: Record<string, string> = {
  call: "通话",
  wechat: "微信",
};

export function labelOf(map: Record<string, string>, value: unknown, fallback = "—") {
  if (value == null || value === "") return fallback;
  const key = String(value);
  return map[key] || key;
}

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: "跟进中",
  paused: "暂停",
  invalid: "无效",
};

export const CUSTOMER_STATUS_OPTIONS: { value: CustomerStatus; label: string }[] = [
  { value: "active", label: "跟进中" },
  { value: "paused", label: "暂停" },
  { value: "invalid", label: "无效" },
];

export function isCustomerStatus(v: unknown): v is CustomerStatus {
  return v === "active" || v === "paused" || v === "invalid";
}
