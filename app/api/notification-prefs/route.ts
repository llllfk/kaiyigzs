import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  notificationTypesForUser,
  normalizeNotificationPrefs,
} from "@/lib/notification-prefs";

export async function GET() {
  try {
    const user = await requireSession();
    const result = await pool.query(
      `SELECT notification_prefs FROM users WHERE id = $1`,
      [user.id]
    );
    const allowed = notificationTypesForUser(user);
    return jsonOk(
      normalizeNotificationPrefs(
        result.rows[0]?.notification_prefs || {},
        allowed
      )
    );
  } catch (err) {
    return handleApiError(err);
  }
}
