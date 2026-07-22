import pool from "@/lib/db";
import type { SessionUser } from "@/types";
import { isNotificationEnabled } from "@/lib/notification-prefs";

/** 异步写审计，不阻塞接口返回；失败只打日志，不影响业务 */
export function writeAuditLog(params: {
  user: SessionUser | null;
  companyId?: number | null;
  action: string;
  targetType?: string;
  targetId?: number | string | null;
  summary?: string;
  ip?: string | null;
}): void {
  void pool
    .query(
      `INSERT INTO audit_logs
        (company_id, actor_id, action, target_type, target_id, summary, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        params.companyId ?? params.user?.company_id ?? null,
        params.user?.id ?? null,
        params.action,
        params.targetType ?? null,
        params.targetId != null ? String(params.targetId) : null,
        params.summary ?? null,
        params.ip ?? null,
      ]
    )
    .catch((err) => {
      console.error("audit log failed", err);
    });
}

export async function createNotification(params: {
  companyId?: number | null;
  userId: number;
  type: string;
  title: string;
  body?: string;
  link?: string;
}) {
  try {
    const prefRes = await pool.query(
      `SELECT role, notification_prefs FROM users WHERE id = $1 LIMIT 1`,
      [params.userId]
    );
    const row = prefRes.rows[0];
    if (
      row &&
      !isNotificationEnabled(row.notification_prefs, params.type, row.role)
    ) {
      return;
    }
  } catch (err) {
    console.error("notification prefs check failed", err);
  }

  await pool.query(
    `INSERT INTO notifications (company_id, user_id, type, title, body, link)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.companyId ?? null,
      params.userId,
      params.type,
      params.title,
      params.body ?? null,
      params.link ?? null,
    ]
  );
}
