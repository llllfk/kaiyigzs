import pool from "@/lib/db";
import { AuthError } from "@/lib/auth";
import type { SessionUser } from "@/types";
import { crmRole } from "@/lib/permissions";
import { writeAuditLog, createNotification } from "@/lib/audit";
import { randomBytes } from "crypto";

export const QUOTE_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "confirmed",
  "rejected",
  "void",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "草稿",
  pending_approval: "待审批",
  approved: "已通过",
  confirmed: "客户已确认",
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

  await syncOpportunityAmountByQuoteId(quoteId).catch(() => null);

  return { listTotal, total, maxDiscount };
}

/**
 * 按优先级把商机金额同步为报价合计：
 * 客户已确认 > 已通过 > 待审批 > 草稿（忽略作废/驳回）
 * 同优先级取 updated_at 最新；无有效报价时不改动原金额（保留预估）。
 */
export async function syncOpportunityAmountFromQuotes(
  opportunityId: number
): Promise<{
  amount: number | null;
  quoteId: number | null;
  status: string | null;
} | null> {
  const oid = Number(opportunityId);
  if (!oid) return null;

  const res = await pool.query(
    `SELECT id, total, status
     FROM quotes
     WHERE opportunity_id = $1
       AND status NOT IN ('void', 'rejected')
     ORDER BY
       CASE status
         WHEN 'confirmed' THEN 1
         WHEN 'approved' THEN 2
         WHEN 'pending_approval' THEN 3
         WHEN 'draft' THEN 4
         ELSE 5
       END,
       updated_at DESC NULLS LAST,
       id DESC
     LIMIT 1`,
    [oid]
  );
  const row = res.rows[0];
  if (!row) {
    return { amount: null, quoteId: null, status: null };
  }

  const amount = Number(row.total);
  const safe = Number.isFinite(amount) ? amount : null;
  await pool.query(
    `UPDATE opportunities
     SET amount = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [safe, oid]
  );
  return {
    amount: safe,
    quoteId: Number(row.id),
    status: String(row.status),
  };
}

export async function syncOpportunityAmountByQuoteId(quoteId: number) {
  const res = await pool.query(
    `SELECT opportunity_id FROM quotes WHERE id = $1`,
    [quoteId]
  );
  const oid = Number(res.rows[0]?.opportunity_id);
  if (!oid) return null;
  return syncOpportunityAmountFromQuotes(oid);
}

export async function notifyQuote(params: {
  companyId: number;
  userId: number;
  quoteId: number;
  title: string;
  body: string;
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

export type QuoteShareRow = {
  id: number;
  quote_id: number;
  company_id: number;
  token: string;
  status: string;
  expires_at: string;
  max_views: number;
  view_count: number;
  last_viewed_at: string | null;
  confirmed_at: string | null;
  confirmer_name: string | null;
  confirmer_note: string | null;
  created_by: number | null;
  created_at: string;
  revoked_at: string | null;
};

function newShareToken() {
  return randomBytes(24).toString("base64url");
}

export function sharePublicPath(token: string) {
  return `/q/${token}`;
}

export async function getActiveQuoteShare(quoteId: number) {
  const res = await pool.query(
    `SELECT * FROM quote_shares
     WHERE quote_id = $1 AND status = 'active'
     ORDER BY id DESC LIMIT 1`,
    [quoteId]
  );
  return (res.rows[0] as QuoteShareRow | undefined) || null;
}

export async function getLatestQuoteShare(quoteId: number) {
  const res = await pool.query(
    `SELECT * FROM quote_shares WHERE quote_id = $1 ORDER BY id DESC LIMIT 1`,
    [quoteId]
  );
  return (res.rows[0] as QuoteShareRow | undefined) || null;
}

export function serializeQuoteShare(
  share: QuoteShareRow | null,
  origin?: string | null,
  views?: QuoteShareViewRow[]
) {
  if (!share) return null;
  const path = sharePublicPath(share.token);
  const url = origin ? `${origin.replace(/\/$/, "")}${path}` : path;
  const expired = new Date(share.expires_at).getTime() <= Date.now();
  const viewsExhausted =
    !share.confirmed_at && Number(share.view_count) >= Number(share.max_views);
  const viewRows = views || [];
  return {
    id: share.id,
    token: share.token,
    status: share.status,
    path,
    url,
    expires_at: share.expires_at,
    max_views: Number(share.max_views),
    view_count: Number(share.view_count),
    last_viewed_at: share.last_viewed_at,
    /** @deprecated 兼容旧字段，优先用 views */
    view_times: viewRows.map((v) => v.viewed_at),
    views: viewRows,
    confirmed_at: share.confirmed_at,
    confirmer_name: share.confirmer_name,
    confirmer_note: share.confirmer_note,
    created_at: share.created_at,
    revoked_at: share.revoked_at,
    expired,
    views_exhausted: viewsExhausted,
    usable:
      share.status === "active" &&
      !expired &&
      (!viewsExhausted || Boolean(share.confirmed_at)),
  };
}

export type QuoteShareViewRow = {
  id: number;
  viewed_at: string;
  duration_ms: number | null;
};

export async function listQuoteShareViews(shareId: number, limit = 50) {
  const res = await pool.query(
    `SELECT id, viewed_at, duration_ms FROM quote_share_views
     WHERE share_id = $1
     ORDER BY viewed_at DESC, id DESC
     LIMIT $2`,
    [shareId, limit]
  );
  return res.rows.map(
    (r): QuoteShareViewRow => ({
      id: Number(r.id),
      viewed_at: String(r.viewed_at),
      duration_ms:
        r.duration_ms == null || !Number.isFinite(Number(r.duration_ms))
          ? null
          : Math.max(0, Math.floor(Number(r.duration_ms))),
    })
  );
}

/** @deprecated 使用 listQuoteShareViews */
export async function listQuoteShareViewTimes(shareId: number, limit = 50) {
  const rows = await listQuoteShareViews(shareId, limit);
  return rows.map((r) => r.viewed_at);
}

export async function serializeQuoteShareWithViews(
  share: QuoteShareRow | null,
  origin?: string | null
) {
  if (!share) return null;
  const views = await listQuoteShareViews(share.id);
  return serializeQuoteShare(share, origin, views);
}

/** 为已通过/已确认报价创建客户确认链接；会撤销旧的 active 链接 */
export async function createQuoteShare(params: {
  user: SessionUser;
  quote: { id: number; company_id: number; status: string };
}) {
  const { user, quote } = params;
  if (!user.company_id) throw new AuthError("缺少公司信息", 400);
  if (quote.status !== "approved" && quote.status !== "confirmed") {
    throw new AuthError("仅已通过的报价可生成客户确认链接", 400);
  }

  const settings = await getQuoteSettings(user.company_id);
  const token = newShareToken();
  const expiresAt = new Date(
    Date.now() + settings.share_valid_days * 24 * 60 * 60 * 1000
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE quote_shares SET
         status = 'revoked',
         revoked_at = CURRENT_TIMESTAMP
       WHERE quote_id = $1 AND status = 'active'`,
      [quote.id]
    );
    const inserted = await client.query(
      `INSERT INTO quote_shares
        (quote_id, company_id, token, status, expires_at, max_views, created_by)
       VALUES ($1,$2,$3,'active',$4,$5,$6)
       RETURNING *`,
      [
        quote.id,
        user.company_id,
        token,
        expiresAt.toISOString(),
        settings.share_max_views,
        user.id,
      ]
    );
    await client.query("COMMIT");
    await writeAuditLog({
      user,
      action: "quote.share.create",
      targetType: "quote",
      targetId: quote.id,
      summary: `生成客户确认链接，有效 ${settings.share_valid_days} 天 / ${settings.share_max_views} 次`,
    });
    return inserted.rows[0] as QuoteShareRow;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function revokeQuoteShare(params: {
  user: SessionUser;
  quoteId: number;
}) {
  const share = await getActiveQuoteShare(params.quoteId);
  if (!share) throw new AuthError("当前没有有效的分享链接", 404);
  await pool.query(
    `UPDATE quote_shares SET
       status = 'revoked',
       revoked_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [share.id]
  );
  await writeAuditLog({
    user: params.user,
    action: "quote.share.revoke",
    targetType: "quote",
    targetId: params.quoteId,
    summary: "撤销客户确认链接",
  });
  return share;
}

export async function revokeAllQuoteShares(quoteId: number) {
  await pool.query(
    `UPDATE quote_shares SET
       status = 'revoked',
       revoked_at = CURRENT_TIMESTAMP
     WHERE quote_id = $1 AND status = 'active'`,
    [quoteId]
  );
}

export type PublicQuoteErrorCode =
  | "not_found"
  | "revoked"
  | "expired"
  | "views_exhausted";

export async function loadPublicQuoteByToken(token: string) {
  const shareRes = await pool.query(`SELECT * FROM quote_shares WHERE token = $1`, [
    token,
  ]);
  const share = shareRes.rows[0] as QuoteShareRow | undefined;
  if (!share) {
    return { ok: false as const, code: "not_found" as PublicQuoteErrorCode };
  }
  if (share.status === "revoked") {
    return { ok: false as const, code: "revoked" as PublicQuoteErrorCode, share };
  }
  if (new Date(share.expires_at).getTime() <= Date.now()) {
    return { ok: false as const, code: "expired" as PublicQuoteErrorCode, share };
  }

  const quoteRes = await pool.query(
    `SELECT q.id, q.version, q.status, q.title, q.currency, q.list_total, q.total,
            q.max_discount_pct, q.valid_until, q.decided_at,
            TRIM(BOTH ' · ' FROM CONCAT_WS(' · ', NULLIF(c.company_name,''), NULLIF(c.name,''))) AS customer_name,
            o.title AS opportunity_title,
            co.name AS company_name
     FROM quotes q
     JOIN customers c ON c.id = q.customer_id
     JOIN opportunities o ON o.id = q.opportunity_id
     JOIN companies co ON co.id = q.company_id
     WHERE q.id = $1`,
    [share.quote_id]
  );
  const quote = quoteRes.rows[0];
  if (!quote || quote.status === "void") {
    return { ok: false as const, code: "not_found" as PublicQuoteErrorCode, share };
  }

  const items = await loadQuoteItems(share.quote_id);
  const views = await listQuoteShareViews(share.id);
  return {
    ok: true as const,
    share,
    views,
    quote: {
      ...quote,
      items: items.map((it: Record<string, unknown>) => ({
        name: it.name,
        spec: it.spec,
        qty: Number(it.qty),
        unit_price: Number(it.unit_price),
        discount_pct: Number(it.discount_pct),
        amount: Number(it.amount),
      })),
    },
  };
}

/** 记录一次打开；同一时刻只会计 1 次（事务内校验上限） */
export async function recordPublicQuoteView(token: string) {
  const shareRes = await pool.query(`SELECT * FROM quote_shares WHERE token = $1`, [
    token,
  ]);
  const share = shareRes.rows[0] as QuoteShareRow | undefined;
  if (!share) {
    return { ok: false as const, code: "not_found" as PublicQuoteErrorCode };
  }
  if (share.status === "revoked") {
    return { ok: false as const, code: "revoked" as PublicQuoteErrorCode, share };
  }
  if (new Date(share.expires_at).getTime() <= Date.now()) {
    return { ok: false as const, code: "expired" as PublicQuoteErrorCode, share };
  }

  // 已确认后再次打开不再占用次数，但也不再记新查看
  if (share.confirmed_at) {
    const views = await listQuoteShareViews(share.id);
    return {
      ok: true as const,
      share,
      views,
      counted: false as const,
      view_id: null as number | null,
    };
  }

  if (Number(share.view_count) >= Number(share.max_views)) {
    return {
      ok: false as const,
      code: "views_exhausted" as PublicQuoteErrorCode,
      share,
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const upd = await client.query(
      `UPDATE quote_shares SET
         view_count = view_count + 1,
         last_viewed_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND status = 'active'
         AND expires_at > CURRENT_TIMESTAMP
         AND confirmed_at IS NULL
         AND view_count < max_views
       RETURNING *`,
      [share.id]
    );
    if (!upd.rows[0]) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        code: "views_exhausted" as PublicQuoteErrorCode,
        share,
      };
    }
    const viewed = await client.query(
      `INSERT INTO quote_share_views (share_id, viewed_at, duration_ms)
       VALUES ($1, CURRENT_TIMESTAMP, NULL)
       RETURNING id, viewed_at, duration_ms`,
      [share.id]
    );
    await client.query("COMMIT");
    const current = upd.rows[0] as QuoteShareRow;
    const views = await listQuoteShareViews(current.id);
    const viewId = Number(viewed.rows[0]?.id);
    return {
      ok: true as const,
      share: current,
      views,
      counted: true as const,
      view_id: Number.isFinite(viewId) ? viewId : null,
      viewed_at: String(viewed.rows[0]?.viewed_at || current.last_viewed_at),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** 回写本次打开的停留时长（只增不减，上限 24h） */
export async function updatePublicQuoteViewDuration(params: {
  token: string;
  viewId: number;
  durationMs: number;
}) {
  const durationMs = Math.min(
    1 * 60 * 60 * 1000, // 单次查看最长记 1 小时
    Math.max(0, Math.floor(Number(params.durationMs) || 0))
  );
  const shareRes = await pool.query(`SELECT id FROM quote_shares WHERE token = $1`, [
    params.token,
  ]);
  const share = shareRes.rows[0];
  if (!share) {
    return { ok: false as const, code: "not_found" as PublicQuoteErrorCode };
  }

  const upd = await pool.query(
    `UPDATE quote_share_views SET
       duration_ms = GREATEST(COALESCE(duration_ms, 0), $1)
     WHERE id = $2 AND share_id = $3
     RETURNING id, viewed_at, duration_ms`,
    [durationMs, params.viewId, share.id]
  );
  if (!upd.rows[0]) {
    return { ok: false as const, code: "not_found" as PublicQuoteErrorCode };
  }
  return {
    ok: true as const,
    view: {
      id: Number(upd.rows[0].id),
      viewed_at: String(upd.rows[0].viewed_at),
      duration_ms: Number(upd.rows[0].duration_ms),
    } as QuoteShareViewRow,
  };
}

export async function confirmPublicQuote(params: {
  token: string;
  confirmerName?: string;
  confirmerNote?: string;
}) {
  const shareRes = await pool.query(`SELECT * FROM quote_shares WHERE token = $1`, [
    params.token,
  ]);
  const share = shareRes.rows[0] as QuoteShareRow | undefined;
  if (!share) {
    return { ok: false as const, code: "not_found" as PublicQuoteErrorCode };
  }
  if (share.status === "revoked") {
    return { ok: false as const, code: "revoked" as PublicQuoteErrorCode, share };
  }
  if (new Date(share.expires_at).getTime() <= Date.now()) {
    return { ok: false as const, code: "expired" as PublicQuoteErrorCode, share };
  }

  const quoteRes = await pool.query(
    `SELECT q.id, q.version, q.status, q.title, q.currency, q.list_total, q.total,
            q.max_discount_pct, q.valid_until, q.decided_at,
            TRIM(BOTH ' · ' FROM CONCAT_WS(' · ', NULLIF(c.company_name,''), NULLIF(c.name,''))) AS customer_name,
            o.title AS opportunity_title,
            co.name AS company_name
     FROM quotes q
     JOIN customers c ON c.id = q.customer_id
     JOIN opportunities o ON o.id = q.opportunity_id
     JOIN companies co ON co.id = q.company_id
     WHERE q.id = $1`,
    [share.quote_id]
  );
  const quoteRow = quoteRes.rows[0];
  if (!quoteRow || quoteRow.status === "void") {
    return { ok: false as const, code: "not_found" as PublicQuoteErrorCode, share };
  }

  const items = await loadQuoteItems(share.quote_id);
  const quote = {
    ...quoteRow,
    items: items.map((it: Record<string, unknown>) => ({
      name: it.name,
      spec: it.spec,
      qty: Number(it.qty),
      unit_price: Number(it.unit_price),
      discount_pct: Number(it.discount_pct),
      amount: Number(it.amount),
    })),
  };

  if (share.confirmed_at) {
    return { ok: true as const, share, quote, already: true as const };
  }
  if (quoteRow.status !== "approved" && quoteRow.status !== "confirmed") {
    return { ok: false as const, code: "not_found" as PublicQuoteErrorCode, share };
  }

  const name = String(params.confirmerName || "").trim().slice(0, 100) || null;
  const note = String(params.confirmerNote || "").trim().slice(0, 500) || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const upd = await client.query(
      `UPDATE quote_shares SET
         confirmed_at = CURRENT_TIMESTAMP,
         confirmer_name = $1,
         confirmer_note = $2
       WHERE id = $3 AND confirmed_at IS NULL AND status = 'active'
       RETURNING *`,
      [name, note, share.id]
    );
    if (!upd.rows[0]) {
      await client.query("ROLLBACK");
      const again = await getLatestQuoteShare(share.quote_id);
      if (again?.confirmed_at) {
        return {
          ok: true as const,
          share: again,
          quote: { ...quote, status: "confirmed" },
          already: true as const,
        };
      }
      return { ok: false as const, code: "revoked" as PublicQuoteErrorCode, share };
    }
    await client.query(
      `UPDATE quotes SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('approved','confirmed')`,
      [share.quote_id]
    );
    await client.query("COMMIT");

    const q = await pool.query(
      `SELECT owner_id, title, version, company_id FROM quotes WHERE id = $1`,
      [share.quote_id]
    );
    const row = q.rows[0];
    if (row) {
      await notifyQuote({
        companyId: Number(row.company_id),
        userId: Number(row.owner_id),
        title: "客户已确认报价",
        body: `「${row.title || "报价"}」V${row.version}${name ? `（${name}）` : ""} 已确认`,
        quoteId: share.quote_id,
      });
    }

    await syncOpportunityAmountByQuoteId(share.quote_id).catch(() => null);

    return {
      ok: true as const,
      share: upd.rows[0] as QuoteShareRow,
      quote: { ...quote, status: "confirmed" },
      already: false as const,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

