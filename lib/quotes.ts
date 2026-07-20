import pool from "@/lib/db";
import { AuthError } from "@/lib/auth";
import type { SessionUser } from "@/types";
import { crmRole } from "@/lib/permissions";
import { writeAuditLog, createNotification } from "@/lib/audit";

export const QUOTE_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "void",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "草稿",
  pending_approval: "待审批",
  approved: "已通过",
  rejected: "已驳回",
  void: "已作废",
};

export type QuoteItemInput = {
  name: string;
  spec?: string;
  qty: number;
  unit_price: number;
  discount_pct?: number;
};

export type QuoteSettings = {
  /** 超过该金额需审批（元） */
  approval_amount: number;
  /** 任意行折扣超过该比例需审批（%） */
  approval_discount_pct: number;
  /** P2：分享链接有效天数 */
  share_valid_days: number;
  /** P2：有效期内最多查看次数 */
  share_max_views: number;
};

export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = {
  approval_amount: 50000,
  approval_discount_pct: 10,
  share_valid_days: 7,
  share_max_views: 10,
};

export function canManageQuoteRules(user: SessionUser) {
  const role = crmRole(user);
  return role === "company_admin";
}

export function canApproveQuotes(user: SessionUser) {
  const role = crmRole(user);
  return role === "company_admin" || role === "sales_manager";
}

export async function getQuoteSettings(companyId: number): Promise<QuoteSettings> {
  const res = await pool.query(`SELECT config FROM companies WHERE id = $1`, [companyId]);
  const config = (res.rows[0]?.config || {}) as Record<string, unknown>;
  const amount = Number(config.quote_approval_amount);
  const discount = Number(config.quote_approval_discount_pct);
  const days = Number(config.quote_share_valid_days);
  const views = Number(config.quote_share_max_views);
  return {
    approval_amount:
      Number.isFinite(amount) && amount >= 0
        ? Math.min(1e9, amount)
        : DEFAULT_QUOTE_SETTINGS.approval_amount,
    approval_discount_pct:
      Number.isFinite(discount) && discount >= 0
        ? Math.min(100, discount)
        : DEFAULT_QUOTE_SETTINGS.approval_discount_pct,
    share_valid_days:
      Number.isFinite(days) && days >= 1
        ? Math.min(365, Math.floor(days))
        : DEFAULT_QUOTE_SETTINGS.share_valid_days,
    share_max_views:
      Number.isFinite(views) && views >= 1
        ? Math.min(9999, Math.floor(views))
        : DEFAULT_QUOTE_SETTINGS.share_max_views,
  };
}

export async function setQuoteSettings(user: SessionUser, patch: Partial<QuoteSettings>) {
  if (!user.company_id) throw new AuthError("缺少公司信息", 400);
  if (!canManageQuoteRules(user)) {
    throw new AuthError("仅公司管理员可设置报价规则", 403);
  }
  const current = await getQuoteSettings(user.company_id);
  const next: QuoteSettings = {
    approval_amount:
      patch.approval_amount != null
        ? Math.min(1e9, Math.max(0, Number(patch.approval_amount)))
        : current.approval_amount,
    approval_discount_pct:
      patch.approval_discount_pct != null
        ? Math.min(100, Math.max(0, Number(patch.approval_discount_pct)))
        : current.approval_discount_pct,
    share_valid_days:
      patch.share_valid_days != null
        ? Math.min(365, Math.max(1, Math.floor(Number(patch.share_valid_days))))
        : current.share_valid_days,
    share_max_views:
      patch.share_max_views != null
        ? Math.min(9999, Math.max(1, Math.floor(Number(patch.share_max_views))))
        : current.share_max_views,
  };

  await pool.query(
    `UPDATE companies SET
      config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'quote_approval_amount', $1::numeric,
        'quote_approval_discount_pct', $2::numeric,
        'quote_share_valid_days', $3::int,
        'quote_share_max_views', $4::int
      ),
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $5`,
    [
      next.approval_amount,
      next.approval_discount_pct,
      next.share_valid_days,
      next.share_max_views,
      user.company_id,
    ]
  );

  await writeAuditLog({
    user,
    action: "quote.rule.update",
    targetType: "company",
    targetId: user.company_id,
    summary: `报价规则：金额阈值 ${next.approval_amount}，折扣阈值 ${next.approval_discount_pct}%；链接 ${next.share_valid_days} 天 / ${next.share_max_views} 次`,
  });

  return next;
}

export function calcLineAmount(qty: number, unitPrice: number, discountPct: number) {
  const q = Number.isFinite(qty) ? qty : 0;
  const p = Number.isFinite(unitPrice) ? unitPrice : 0;
  const d = Math.min(100, Math.max(0, Number.isFinite(discountPct) ? discountPct : 0));
  const list = q * p;
  const amount = Math.round(list * (1 - d / 100) * 100) / 100;
  return { list, amount, discount_pct: d };
}

export function summarizeItems(items: QuoteItemInput[]) {
  let listTotal = 0;
  let total = 0;
  let maxDiscount = 0;
  const rows = items.map((it, i) => {
    const name = String(it.name || "").trim();
    const qty = Number(it.qty);
    const unit = Number(it.unit_price);
    const disc = Number(it.discount_pct || 0);
    const { list, amount, discount_pct } = calcLineAmount(qty, unit, disc);
    listTotal += list;
    total += amount;
    if (discount_pct > maxDiscount) maxDiscount = discount_pct;
    return {
      sort_order: i,
      name,
      spec: String(it.spec || "").trim() || null,
      qty,
      unit_price: unit,
      discount_pct,
      amount,
    };
  });
  listTotal = Math.round(listTotal * 100) / 100;
  total = Math.round(total * 100) / 100;
  return { rows, listTotal, total, maxDiscount };
}

export function needsApproval(
  settings: QuoteSettings,
  total: number,
  maxDiscountPct: number
) {
  return (
    total > settings.approval_amount || maxDiscountPct > settings.approval_discount_pct
  );
}

/** 解析审批人：优先负责人上级经理，否则公司管理员 */
export async function resolveApproverId(params: {
  companyId: number;
  ownerId: number;
  submitterId: number;
}): Promise<number | null> {
  const owner = await pool.query(
    `SELECT id, manager_id, role FROM users WHERE id = $1 AND company_id = $2`,
    [params.ownerId, params.companyId]
  );
  const row = owner.rows[0];
  if (row?.manager_id && Number(row.manager_id) !== params.submitterId) {
    const mgr = await pool.query(
      `SELECT id FROM users
       WHERE id = $1 AND company_id = $2 AND status = 'active'
         AND role IN ('sales_manager','company_admin')`,
      [row.manager_id, params.companyId]
    );
    if (mgr.rows[0]) return Number(mgr.rows[0].id);
  }

  const admins = await pool.query(
    `SELECT id FROM users
     WHERE company_id = $1 AND status = 'active' AND role = 'company_admin'
       AND id <> $2
     ORDER BY id ASC LIMIT 1`,
    [params.companyId, params.submitterId]
  );
  if (admins.rows[0]) return Number(admins.rows[0].id);

  // 无其他人可批：若提交人自己是管理员/经理，返回自己（仍走待审，可自批）
  const self = await pool.query(
    `SELECT id, role FROM users WHERE id = $1 AND company_id = $2 AND status='active'`,
    [params.submitterId, params.companyId]
  );
  if (
    self.rows[0] &&
    (self.rows[0].role === "company_admin" || self.rows[0].role === "sales_manager")
  ) {
    return Number(self.rows[0].id);
  }
  return null;
}

export async function loadQuoteItems(quoteId: number) {
  const res = await pool.query(
    `SELECT * FROM quote_items WHERE quote_id = $1 ORDER BY sort_order ASC, id ASC`,
    [quoteId]
  );
  return res.rows;
}

export async function replaceQuoteItems(quoteId: number, items: QuoteItemInput[]) {
  const { rows, listTotal, total, maxDiscount } = summarizeItems(items);
  if (!rows.length || rows.some((r) => !r.name)) {
    throw new AuthError("请至少填写一行有效明细（名称必填）", 400);
  }
  if (rows.some((r) => r.qty <= 0)) {
    throw new AuthError("数量须大于 0", 400);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM quote_items WHERE quote_id = $1`, [quoteId]);
    for (const r of rows) {
      await client.query(
        `INSERT INTO quote_items
          (quote_id, sort_order, name, spec, qty, unit_price, discount_pct, amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          quoteId,
          r.sort_order,
          r.name,
          r.spec,
          r.qty,
          r.unit_price,
          r.discount_pct,
          r.amount,
        ]
      );
    }
    await client.query(
      `UPDATE quotes SET
         list_total = $1, total = $2, max_discount_pct = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [listTotal, total, maxDiscount, quoteId]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { listTotal, total, maxDiscount };
}

export async function notifyQuote(params: {
  companyId: number;
  userId: number;
  title: string;
  body: string;
  quoteId: number;
}) {
  await createNotification({
    companyId: params.companyId,
    userId: params.userId,
    type: "quote",
    title: params.title,
    body: params.body,
    link: `/quotes?id=${params.quoteId}`,
  });
}
