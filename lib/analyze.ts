import pool from "@/lib/db";
import { analyzeConversationText, type InsightResult } from "@/lib/insights";
import { createNotification } from "@/lib/audit";
import { mergePainPoints } from "@/lib/pain-points";
import type { SessionUser } from "@/types";

async function loadMediaForUser(params: {
  user: SessionUser;
  mediaId: number;
}) {
  const mediaRes = await pool.query(`SELECT * FROM media_assets WHERE id = $1`, [
    params.mediaId,
  ]);
  const media = mediaRes.rows[0];
  if (!media) throw new Error("上传记录不存在");

  const sameCompany =
    media.company_id != null &&
    params.user.company_id != null &&
    Number(media.company_id) === Number(params.user.company_id);
  if (!sameCompany && params.user.role !== "super_admin") {
    throw new Error("无权分析该文件");
  }
  return media;
}

/** 仅跑 AI，不写洞察/画像/待办；等用户确认后再 commit */
export async function previewMediaAnalysis(params: {
  user: SessionUser;
  mediaId: number;
}): Promise<InsightResult> {
  const media = await loadMediaForUser(params);
  let transcript = media.transcript || "";
  if (!transcript) {
    throw new Error("请先提供转写文本（通话）或聊天文本内容");
  }

  const customerRes = media.customer_id
    ? await pool.query(`SELECT name FROM customers WHERE id = $1`, [
        media.customer_id,
      ])
    : { rows: [] as { name: string }[] };

  await pool.query(`UPDATE media_assets SET status = 'analyzing' WHERE id = $1`, [
    media.id,
  ]);

  try {
    const kind = media.kind === "call" ? "call" : "wechat";
    const result = await analyzeConversationText({
      kind,
      text: transcript,
      customerName: customerRes.rows[0]?.name,
      companyId: media.company_id,
      userId: params.user.id,
    });
    // 预览结束仍保持 uploaded，表示尚未确认保存
    await pool.query(`UPDATE media_assets SET status = 'uploaded' WHERE id = $1`, [
      media.id,
    ]);
    return result;
  } catch (err) {
    await pool
      .query(`UPDATE media_assets SET status = 'uploaded' WHERE id = $1`, [media.id])
      .catch(() => undefined);
    throw err;
  }
}

/** 用户确认后写入洞察、画像、待办等 */
export async function commitMediaAnalysis(params: {
  user: SessionUser;
  mediaId: number;
  result: InsightResult;
}) {
  const media = await loadMediaForUser(params);
  const customerRes = media.customer_id
    ? await pool.query(
        `SELECT name, owner_id FROM customers WHERE id = $1`,
        [media.customer_id]
      )
    : { rows: [] as { name: string; owner_id: number | null }[] };
  const customer = customerRes.rows[0];
  const taskOwnerId =
    customer?.owner_id || media.uploader_id || params.user.id;

  const kind = media.kind === "call" ? "call" : "wechat";
  const result = params.result;

  const existing = await pool.query(
    `SELECT id FROM ai_insights
     WHERE media_asset_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [media.id]
  );

  let insightRow;
  if (existing.rows[0]) {
    const updated = await pool.query(
      `UPDATE ai_insights SET
         customer_id = $1,
         kind = $2,
         result_json = $3::jsonb,
         summary = $4,
         created_by = $5
       WHERE id = $6
       RETURNING *`,
      [
        media.customer_id,
        kind,
        JSON.stringify(result),
        result.summary,
        params.user.id,
        existing.rows[0].id,
      ]
    );
    insightRow = updated.rows[0];
  } else {
    const inserted = await pool.query(
      `INSERT INTO ai_insights
        (company_id, customer_id, media_asset_id, kind, result_json, summary, created_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
       RETURNING *`,
      [
        media.company_id,
        media.customer_id,
        media.id,
        kind,
        JSON.stringify(result),
        result.summary,
        params.user.id,
      ]
    );
    insightRow = inserted.rows[0];
  }

  await pool.query(`UPDATE media_assets SET status = 'analyzed' WHERE id = $1`, [
    media.id,
  ]);

  if (media.customer_id) {
    await mergeCustomerProfile(media.customer_id, result);
    await createTasksFromInsight({
      companyId: media.company_id,
      customerId: media.customer_id,
      ownerId: taskOwnerId,
      result,
    });
    await upsertCompetitorMentions({
      companyId: media.company_id,
      customerId: media.customer_id,
      insightId: insightRow.id,
      names: result.competitors || [],
    });
    await applyStageSuggestions({
      customerId: media.customer_id,
      ownerId: taskOwnerId,
      companyId: media.company_id,
      result,
    });
  }

  await createNotification({
    companyId: media.company_id,
    userId: media.uploader_id,
    type: "ai_done",
    title: "AI 解析完成",
    body: result.summary?.slice(0, 120) || "已生成客户洞察",
    link: media.customer_id ? `/customers/${media.customer_id}` : "/uploads",
  });

  return insightRow;
}

/** 兼容旧调用：预览后立即提交 */
export async function runMediaAnalysis(params: {
  user: SessionUser;
  mediaId: number;
}) {
  const draft = await previewMediaAnalysis(params);
  return commitMediaAnalysis({ ...params, result: draft });
}

async function mergeCustomerProfile(customerId: number, result: InsightResult) {
  const cur = await pool.query(
    `SELECT profile_json FROM customers WHERE id = $1`,
    [customerId]
  );
  const prev = (cur.rows[0]?.profile_json || {}) as Record<string, unknown>;
  const next = {
    ...prev,
    intent: result.intent,
    sentiment: result.sentiment,
    pain_points: mergePainPoints(prev.pain_points, result.pain_points),
    competitors: Array.from(
      new Set([
        ...((prev.competitors as string[]) || []),
        ...(result.competitors || []),
      ])
    ).slice(0, 20),
    last_summary: result.summary,
    stage_suggestion: result.stage_suggestion || prev.stage_suggestion || "",
    next_actions: (result.next_actions || []).slice(0, 5),
    commitments: (result.commitments || []).slice(0, 5),
    updated_by_ai_at: new Date().toISOString(),
  };
  await pool.query(
    `UPDATE customers SET profile_json = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [JSON.stringify(next), customerId]
  );
}

async function createTasksFromInsight(params: {
  companyId: number;
  customerId: number;
  ownerId: number;
  result: InsightResult;
}) {
  const actions = [
    ...(params.result.next_actions || []),
    ...(params.result.commitments || []).map((c) => `兑现承诺：${c}`),
  ].filter(Boolean);

  for (const title of actions.slice(0, 5)) {
    const due = new Date();
    due.setDate(due.getDate() + 2);
    await pool.query(
      `INSERT INTO tasks
        (company_id, customer_id, owner_id, title, due_at, status, source)
       VALUES ($1,$2,$3,$4,$5,'pending','ai')`,
      [
        params.companyId,
        params.customerId,
        params.ownerId,
        title.slice(0, 280),
        due.toISOString(),
      ]
    );
  }

  if (actions.length > 0) {
    await createNotification({
      companyId: params.companyId,
      userId: params.ownerId,
      type: "task",
      title: "已生成 AI 跟进待办",
      body: `共 ${Math.min(actions.length, 5)} 条，请确认并跟进`,
      link: `/customers/${params.customerId}`,
    });
  }
}

async function applyStageSuggestions(params: {
  companyId: number;
  customerId: number;
  ownerId: number;
  result: InsightResult;
}) {
  const stage = params.result.stage_suggestion?.trim();
  if (!stage || !["lead", "contact", "proposal", "won", "lost"].includes(stage)) {
    return;
  }

  const opps = await pool.query(
    `SELECT id, stage, owner_id FROM opportunities
     WHERE customer_id = $1 AND company_id = $2
       AND stage NOT IN ('won', 'lost')
     ORDER BY updated_at DESC
     LIMIT 5`,
    [params.customerId, params.companyId]
  );

  const reason =
    params.result.summary?.slice(0, 120) ||
    `基于最近沟通，建议推进到 ${stage}`;

  for (const opp of opps.rows) {
    if (opp.stage === stage) continue;
    await pool.query(
      `UPDATE opportunities SET
        stage_suggestion_json = $1::jsonb,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [
        JSON.stringify({
          stage,
          reason,
          intent: params.result.intent,
          created_at: new Date().toISOString(),
        }),
        opp.id,
      ]
    );
    await createNotification({
      companyId: params.companyId,
      userId: opp.owner_id || params.ownerId,
      type: "stage_suggestion",
      title: "商机阶段建议",
      body: reason,
      link: "/opportunities",
    });
  }
}

async function upsertCompetitorMentions(params: {
  companyId: number;
  customerId: number;
  insightId: number;
  names: string[];
}) {
  for (const raw of params.names) {
    const name = String(raw || "").trim();
    if (!name) continue;

    let competitorId: number | null = null;
    const found = await pool.query(
      `SELECT id FROM competitors WHERE company_id = $1 AND name = $2 LIMIT 1`,
      [params.companyId, name]
    );
    if (found.rows[0]) {
      competitorId = found.rows[0].id;
    } else {
      const created = await pool.query(
        `INSERT INTO competitors (company_id, name, summary)
         VALUES ($1,$2,$3)
         RETURNING id`,
        [params.companyId, name, "由 AI 从沟通记录中自动发现（草稿）"]
      );
      competitorId = created.rows[0].id;
    }

    await pool.query(
      `INSERT INTO competitor_mentions
        (company_id, competitor_id, customer_id, insight_id, name)
       VALUES ($1,$2,$3,$4,$5)`,
      [params.companyId, competitorId, params.customerId, params.insightId, name]
    );
  }
}
