import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("zh-CN");
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

/** 合成时长展示：秒 → 45.2秒 / 1分20秒 */
export function formatSynthDurationSec(sec: number | null | undefined): string {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return "0秒";
  if (n < 60) return `${Math.round(n * 10) / 10}秒`;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return s > 0 ? `${m}分${s}秒` : `${m}分`;
}

/** 相对时间：刚刚 / N 分钟前…；超过一周回退到完整时间 */
export function formatRelativeTime(value?: string | Date | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return formatDateTime(d);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} 天前`;
  return formatDateTime(d);
}

/** 多久未跟进：仅显示天数（从未跟进为 —，今天为 0） */
export function formatIdleSince(value?: string | Date | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startDue = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round(
    (startToday.getTime() - startDue.getTime()) / (24 * 3600 * 1000)
  );
  return String(Math.max(0, days));
}

export type TaskUrgency = "overdue" | "urgent" | "normal";

/**
 * 待办紧急程度（按截止日期日历天）：
 * 已逾期 = 截止日早于今天；紧急 = 今天截止；普通 = 无截止或更晚
 */
export function taskDueUrgency(
  dueAt?: string | Date | null,
  status?: string | null
): TaskUrgency {
  // 已确认 / 已完成 / 已取消：不再按截止日标紧急程度
  if (
    status === "done" ||
    status === "cancelled" ||
    status === "confirmed"
  ) {
    return "normal";
  }
  if (!dueAt) return "normal";
  const d = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  if (Number.isNaN(d.getTime())) return "normal";
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startDue = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startDue.getTime() - startToday.getTime()) / (24 * 3600 * 1000)
  );
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "urgent";
  return "normal";
}

export const TASK_URGENCY_LABELS: Record<TaskUrgency, string> = {
  overdue: "已逾期",
  urgent: "紧急",
  normal: "普通",
};

/** 规范化手机号：去空格，空串视为未填写 */
export function normalizePhone(value?: string | null): string | null {
  if (value == null) return null;
  const phone = String(value).replace(/\s+/g, "").trim();
  return phone || null;
}

/** 账号手机号格式：内地 11 位或以 + 开头的国际号 */
export function isValidUserPhone(phone: string): boolean {
  return /^1\d{10}$/.test(phone) || /^\+?\d{7,15}$/.test(phone);
}

/** 解析 URL/查询里的 owner_id；非法则返回 null */
export function parseOwnerIdParam(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/** 规范化邮箱：去空格小写，空串视为未填写 */
export function normalizeEmail(value?: string | null): string | null {
  if (value == null) return null;
  const email = String(value).trim().toLowerCase();
  return email || null;
}

/** 客户展示：客户公司 + 客户名 */
export function customerLabel(c: {
  company_name?: string | null;
  name?: string | null;
}) {
  const company = (c.company_name || "").trim();
  const name = (c.name || "").trim();
  if (company && name) return `${company} · ${name}`;
  return company || name || "未命名客户";
}

/** 音频时长：毫秒 → 1:05 / 1:02:03 */
export function formatAudioDuration(ms?: number | null) {
  if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) <= 0) return "—";
  const totalSec = Math.round(Number(ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 报价查看停留时长：毫秒 → 45 秒 / 1 分 23 秒 */
export function formatViewDurationMs(ms?: number | null) {
  if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) < 0) return "—";
  const totalSec = Math.round(Number(ms) / 1000);
  if (totalSec < 60) return `${totalSec} 秒`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min} 分 ${sec} 秒` : `${min} 分`;
  const hour = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hour} 小时 ${remMin} 分` : `${hour} 小时`;
}

/** 拆分文件名与后缀（含点）；无后缀时 ext 为空 */
export function splitFileName(fileName: string) {
  const name = String(fileName || "").trim();
  const i = name.lastIndexOf(".");
  if (i <= 0 || i === name.length - 1) {
    return { base: name || "unnamed", ext: "" };
  }
  return { base: name.slice(0, i), ext: name.slice(i) };
}

/** 改名时保留原后缀；用户输入若带后缀也会被去掉再拼回原后缀 */
export function renameKeepingExtension(newBaseInput: string, originalFileName: string) {
  const { ext } = splitFileName(originalFileName);
  let base = String(newBaseInput || "").trim();
  if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) {
    base = base.slice(0, -ext.length);
  }
  // 去掉路径与非法字符
  base = base
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\.+$/g, "")
    .trim();
  if (!base) base = "unnamed";
  return `${base}${ext}`;
}
