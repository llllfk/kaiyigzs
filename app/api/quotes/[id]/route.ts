import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCanAccessCustomer } from "@/lib/permissions";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import {
  canApproveQuotes,
  getQuoteSettings,
  loadQuoteItems,
  needsApproval,
  notifyQuote,
  replaceQuoteItems,
  resolveApproverId,
  type QuoteItemInput,
} from "@/lib/quotes";

type Ctx = { params: Promise<{ id: string }> };

async function getOwnedQuote(userId: number, companyId: number, quoteId: number) {
  const res = await pool.query(
    `SELECT q.* FROM quotes q WHERE q.id = $1 AND q.company_id = $2`,
    [quoteId, companyId]
  );
  return res.rows[0] || null;
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const id = Number((await ctx.params).id);
    const quote = await getOwnedQuote(user.id, user.company_id, id);
    if (!quote) return jsonError("报价不存在", 404);
    await assertCanAccessCustomer(user, Number(quote.customer_id));
    const items = await loadQuoteItems(id);
    const settings = await getQuoteSettings(user.company_id);
    return jsonOk({ ...quote, items, settings });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const id = Number((await ctx.params).id);
    const quote = await getOwnedQuote(user.id, user.company_id, id);
    if (!quote) return jsonError("报价不存在", 404);
    await assertCanAccessCustomer(user, Number(quote.customer_id));

    if (quote.status !== "draft" && quote.status !== "rejected") {
      return jsonError("仅草稿或已驳回的报价可编辑");
    }

    const body = await request.json();
    const title =
      body.title != null ? String(body.title).trim() : quote.title;
    const note =
      body.note != null ? String(body.note).trim() || null : quote.note;
    const validUntil =
      body.valid_until !== undefined ? body.valid_until || null : quote.valid_until;

    await pool.query(
      `UPDATE quotes SET
         title = $1, note = $2, valid_until = $3,
         status = CASE WHEN status = 'rejected' THEN 'draft' ELSE status END,
         reject_reason = CASE WHEN status = 'rejected' THEN NULL ELSE reject_reason END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [title || quote.title, note, validUntil, id]
    );

    if (Array.isArray(body.items)) {
      await replaceQuoteItems(id, body.items as QuoteItemInput[]);
    }

    const fresh = await pool.query(`SELECT * FROM quotes WHERE id = $1`, [id]);
    const items = await loadQuoteItems(id);
    return jsonOk({ ...fresh.rows[0], items });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const id = Number((await ctx.params).id);
    const quote = await getOwnedQuote(user.id, user.company_id, id);
    if (!quote) return jsonError("报价不存在", 404);
    await assertCanAccessCustomer(user, Number(quote.customer_id));

    if (quote.status === "draft") {
      await pool.query(`DELETE FROM quotes WHERE id = $1`, [id]);
      await writeAuditLog({
        user,
        action: "quote.delete",
        targetType: "quote",
        targetId: id,
        summary: `删除草稿报价 V${quote.version}`,
      });
      return jsonOk({ deleted: true });
    }

    if (quote.status === "pending_approval") {
      return jsonError("待审批报价不可删除，请先撤回或等审批结果");
    }

    await pool.query(
      `UPDATE quotes SET status = 'void', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    await writeAuditLog({
      user,
      action: "quote.void",
      targetType: "quote",
      targetId: id,
      summary: `作废报价 V${quote.version}`,
    });
    return jsonOk({ voided: true });
  } catch (err) {
    return handleApiError(err);
  }
}

/** action: submit | approve | reject | revise */
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const id = Number((await ctx.params).id);
    const quote = await getOwnedQuote(user.id, user.company_id, id);
    if (!quote) return jsonError("报价不存在", 404);
    await assertCanAccessCustomer(user, Number(quote.customer_id));

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "submit") {
      if (quote.status !== "draft" && quote.status !== "rejected") {
        return jsonError("仅草稿或已驳回报价可提交");
      }
      const items = await loadQuoteItems(id);
      if (!items.length) return jsonError("请先填写报价明细");

      const settings = await getQuoteSettings(user.company_id);
      const total = Number(quote.total);
      const maxDisc = Number(quote.max_discount_pct);
      const requireApproval = needsApproval(settings, total, maxDisc);

      if (!requireApproval) {
        await pool.query(
          `UPDATE quotes SET
             status = 'approved',
             approver_id = $1,
             submitted_at = CURRENT_TIMESTAMP,
             decided_at = CURRENT_TIMESTAMP,
             reject_reason = NULL,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [user.id, id]
        );
        await writeAuditLog({
          user,
          action: "quote.auto_approve",
          targetType: "quote",
          targetId: id,
          summary: `报价 V${quote.version} 未超阈值，自动通过（合计 ${total}）`,
        });
        const fresh = await pool.query(`SELECT * FROM quotes WHERE id = $1`, [id]);
        return jsonOk({
          ...fresh.rows[0],
          items,
          auto_approved: true,
        });
      }

      const approverId = await resolveApproverId({
        companyId: user.company_id,
        ownerId: Number(quote.owner_id),
        submitterId: user.id,
      });
      if (!approverId) {
        return jsonError("未找到可用审批人，请联系管理员配置上级或管理员账号");
      }

      await pool.query(
        `UPDATE quotes SET
           status = 'pending_approval',
           approver_id = $1,
           submitted_at = CURRENT_TIMESTAMP,
           decided_at = NULL,
           reject_reason = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [approverId, id]
      );

      await notifyQuote({
        companyId: user.company_id,
        userId: approverId,
        title: "待审批报价",
        body: `「${quote.title || "报价"}」V${quote.version} 合计 ¥${total}，请审批`,
        quoteId: id,
      });

      await writeAuditLog({
        user,
        action: "quote.submit",
        targetType: "quote",
        targetId: id,
        summary: `提交报价 V${quote.version} 待审批`,
      });

      // 建议推进商机阶段到报价中
      await pool.query(
        `UPDATE opportunities SET stage = 'proposal', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND stage IN ('lead','contact')`,
        [quote.opportunity_id]
      );

      const fresh = await pool.query(`SELECT * FROM quotes WHERE id = $1`, [id]);
      return jsonOk({ ...fresh.rows[0], items, auto_approved: false });
    }

    if (action === "approve") {
      if (!canApproveQuotes(user)) return jsonError("无权审批", 403);
      if (quote.status !== "pending_approval") return jsonError("当前状态不可审批");
      const isAssignee = Number(quote.approver_id) === user.id;
      const isAdmin =
        user.role === "company_admin" || Boolean(user.act_as_company_id);
      if (!isAssignee && !isAdmin) return jsonError("无权审批该报价", 403);

      await pool.query(
        `UPDATE quotes SET
           status = 'approved',
           approver_id = $1,
           decided_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [user.id, id]
      );

      await notifyQuote({
        companyId: user.company_id,
        userId: Number(quote.owner_id),
        title: "报价已通过",
        body: `「${quote.title || "报价"}」V${quote.version} 已审批通过`,
        quoteId: id,
      });

      await writeAuditLog({
        user,
        action: "quote.approve",
        targetType: "quote",
        targetId: id,
        summary: `通过报价 V${quote.version}`,
      });

      const fresh = await pool.query(`SELECT * FROM quotes WHERE id = $1`, [id]);
      const items = await loadQuoteItems(id);
      return jsonOk({ ...fresh.rows[0], items });
    }

    if (action === "reject") {
      if (!canApproveQuotes(user)) return jsonError("无权审批", 403);
      if (quote.status !== "pending_approval") return jsonError("当前状态不可驳回");
      const isAssignee = Number(quote.approver_id) === user.id;
      const isAdmin =
        user.role === "company_admin" || Boolean(user.act_as_company_id);
      if (!isAssignee && !isAdmin) return jsonError("无权审批该报价", 403);

      const reason = String(body.reason || "").trim();
      if (!reason) return jsonError("请填写驳回原因");

      await pool.query(
        `UPDATE quotes SET
           status = 'rejected',
           approver_id = $1,
           reject_reason = $2,
           decided_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [user.id, reason, id]
      );

      await notifyQuote({
        companyId: user.company_id,
        userId: Number(quote.owner_id),
        title: "报价已驳回",
        body: `「${quote.title || "报价"}」V${quote.version}：${reason}`,
        quoteId: id,
      });

      await writeAuditLog({
        user,
        action: "quote.reject",
        targetType: "quote",
        targetId: id,
        summary: `驳回报价 V${quote.version}：${reason}`,
      });

      const fresh = await pool.query(`SELECT * FROM quotes WHERE id = $1`, [id]);
      const items = await loadQuoteItems(id);
      return jsonOk({ ...fresh.rows[0], items });
    }

    if (action === "revise") {
      // 基于当前版本复制为新草稿
      const items = await loadQuoteItems(id);
      const verRes = await pool.query(
        `SELECT COALESCE(MAX(version), 0)::int AS v FROM quotes WHERE opportunity_id = $1`,
        [quote.opportunity_id]
      );
      const version = (verRes.rows[0]?.v || 0) + 1;
      const inserted = await pool.query(
        `INSERT INTO quotes
          (company_id, opportunity_id, customer_id, owner_id, version, status, title,
           valid_until, note, parent_quote_id, created_by)
         VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          user.company_id,
          quote.opportunity_id,
          quote.customer_id,
          quote.owner_id,
          version,
          `${quote.title || "报价"}（修订）`,
          quote.valid_until,
          quote.note,
          id,
          user.id,
        ]
      );
      const neo = inserted.rows[0];
      await replaceQuoteItems(
        neo.id,
        items.map((it: { name: string; spec: string | null; qty: number; unit_price: number; discount_pct: number }) => ({
          name: it.name,
          spec: it.spec || "",
          qty: Number(it.qty),
          unit_price: Number(it.unit_price),
          discount_pct: Number(it.discount_pct),
        }))
      );
      const fresh = await pool.query(`SELECT * FROM quotes WHERE id = $1`, [neo.id]);
      const newItems = await loadQuoteItems(neo.id);
      await writeAuditLog({
        user,
        action: "quote.revise",
        targetType: "quote",
        targetId: neo.id,
        summary: `基于 V${quote.version} 创建 V${version}`,
      });
      return jsonOk({ ...fresh.rows[0], items: newItems }, 201);
    }

    if (action === "withdraw") {
      if (quote.status !== "pending_approval") return jsonError("仅待审批可撤回");
      if (Number(quote.created_by) !== user.id && Number(quote.owner_id) !== user.id) {
        if (user.role !== "company_admin" && !user.act_as_company_id) {
          return jsonError("无权撤回", 403);
        }
      }
      await pool.query(
        `UPDATE quotes SET
           status = 'draft',
           submitted_at = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id]
      );
      await writeAuditLog({
        user,
        action: "quote.withdraw",
        targetType: "quote",
        targetId: id,
        summary: `撤回报价 V${quote.version}`,
      });
      const fresh = await pool.query(`SELECT * FROM quotes WHERE id = $1`, [id]);
      const items = await loadQuoteItems(id);
      return jsonOk({ ...fresh.rows[0], items });
    }

    return jsonError("未知操作");
  } catch (err) {
    return handleApiError(err);
  }
}
