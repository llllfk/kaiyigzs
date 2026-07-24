import pool from "@/lib/db";
import {
  DEFAULT_UI_PREFS,
  normalizeUiPrefs,
  type UiPrefs,
} from "@/lib/ui-prefs";

let ensuredColumn = false;

/** 确保 users.ui_prefs 存在（兼容未跑迁移的库） */
export async function ensureUiPrefsColumn() {
  if (ensuredColumn) return;
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS ui_prefs JSONB NOT NULL DEFAULT '{}'::jsonb
  `);
  ensuredColumn = true;
}

/** 仅供服务端（如 portal layout）调用，勿在客户端组件 import */
export async function loadUserUiPrefs(userId: number): Promise<Required<UiPrefs>> {
  try {
    await ensureUiPrefsColumn();
    const res = await pool.query(`SELECT ui_prefs FROM users WHERE id = $1`, [
      userId,
    ]);
    return normalizeUiPrefs(res.rows[0]?.ui_prefs);
  } catch {
    return { ...DEFAULT_UI_PREFS };
  }
}
