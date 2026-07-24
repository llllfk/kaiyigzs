import pool from "@/lib/db";
import { AuthError } from "@/lib/auth";
import {
  chatCompletionDetailed,
  resolveCozeCredentials,
  USER_FACING_AI_REPLY_RULES,
  type TokenUsage,
} from "@/lib/ai";
import { assertCanAccessCustomer } from "@/lib/permissions";
import {
  CUSTOMER_STATUS_LABELS,
  FOLLOW_TYPE_LABELS,
  STAGE_LABELS,
  labelOf,
  type SessionUser,
} from "@/types";
import {
  formatCompetitorPlaybooks,
  matchCompetitorsByNames,
} from "@/lib/competitors";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  usage?: TokenUsage | null;
  created_at?: string;
  id?: number;
};

async function appendCompetitorPlaybooks(
  lines: string[],
  companyId: number,
  profile: Record<string, unknown>
) {
  const names = Array.isArray(profile.competitors)
    ? (profile.competitors as string[])
    : [];
  if (!names.length) return;
  const matched = await matchCompetitorsByNames(companyId, names);
  lines.push(...formatCompetitorPlaybooks(matched));
}

async function buildCustomerContext(customerId: number) {
  const customer = await pool.query(
    `SELECT c.*, u.name AS owner_name
     FROM customers c
     LEFT JOIN users u ON u.id = c.owner_id
     WHERE c.id = $1`,
    [customerId]
  );
  const c = customer.rows[0];
  if (!c) throw new Error("客户不存在");

  const [followUps, opportunities, insights] = await Promise.all([
    pool.query(
      `SELECT type, content, followed_at FROM follow_ups
       WHERE customer_id = $1 ORDER BY followed_at DESC LIMIT 8`,
      [customerId]
    ),
    pool.query(
      `SELECT id, title, stage, amount, expected_close_date, stage_suggestion_json
       FROM opportunities WHERE customer_id = $1 ORDER BY updated_at DESC LIMIT 8`,
      [customerId]
    ),
    pool.query(
      `SELECT kind, summary, created_at FROM ai_insights
       WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [customerId]
    ),
  ]);

  const profile = c.profile_json || {};
  const lines = [
    `【客户】`,
    `公司：${c.company_name || "—"}`,
    `客户名：${c.name || "—"}`,
    `手机：${c.phone || "—"}`,
    `行业：${c.industry || "—"}`,
    `来源：${c.source || "—"}`,
    `状态：${labelOf(CUSTOMER_STATUS_LABELS, c.status)}`,
    `归属：${c.pool_status === "public" ? "公海" : "私海"}`,
    `负责人：${c.owner_name || "—"}`,
  ];

  if (profile.intent || profile.sentiment || profile.last_summary) {
    lines.push(
      `画像意向：${profile.intent || "—"}；情感：${profile.sentiment || "—"}`,
      `画像摘要：${profile.last_summary || "—"}`
    );
    if (Array.isArray(profile.pain_points) && profile.pain_points.length) {
      lines.push(`痛点：${profile.pain_points.join("、")}`);
    }
    if (Array.isArray(profile.competitors) && profile.competitors.length) {
      lines.push(`竞品：${profile.competitors.join("、")}`);
    }
  }

  if (followUps.rows.length) {
    lines.push(`【最近跟进】`);
    for (const f of followUps.rows) {
      lines.push(
        `- ${labelOf(FOLLOW_TYPE_LABELS, f.type)} ${new Date(f.followed_at).toLocaleString("zh-CN")}：${String(f.content || "").slice(0, 200)}`
      );
    }
  }

  if (opportunities.rows.length) {
    lines.push(`【关联商机】`);
    for (const o of opportunities.rows) {
      const stage = labelOf(STAGE_LABELS, o.stage);
      const sug = o.stage_suggestion_json?.stage
        ? `；AI建议阶段=${labelOf(STAGE_LABELS, o.stage_suggestion_json.stage)}`
        : "";
      lines.push(
        `- ${o.title}｜阶段=${stage}${o.amount != null ? `｜金额=${o.amount}` : ""}${sug}`
      );
    }
  }

  if (insights.rows.length) {
    lines.push(`【AI 洞察摘要】`);
    for (const i of insights.rows) {
      lines.push(`- ${i.kind}：${String(i.summary || "").slice(0, 180)}`);
    }
  }

  await appendCompetitorPlaybooks(lines, Number(c.company_id), profile);

  return { customerId: c.id, text: lines.join("\n") };
}

async function buildOpportunityContext(opportunityId: number) {
  const oppRes = await pool.query(
    `SELECT o.*, c.company_name, c.name AS customer_contact, c.phone, c.industry, c.source, c.status AS customer_status,
            c.profile_json, u.name AS owner_name
     FROM opportunities o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN users u ON u.id = o.owner_id
     WHERE o.id = $1`,
    [opportunityId]
  );
  const o = oppRes.rows[0];
  if (!o) throw new Error("商机不存在");

  const followUps = await pool.query(
    `SELECT type, content, followed_at FROM follow_ups
     WHERE customer_id = $1 ORDER BY followed_at DESC LIMIT 6`,
    [o.customer_id]
  );

  const lines = [
    `【商机】`,
    `标题：${o.title}`,
    `阶段：${labelOf(STAGE_LABELS, o.stage)}`,
    `金额：${o.amount ?? "—"}`,
    `预计成交：${o.expected_close_date || "—"}`,
    `负责人：${o.owner_name || "—"}`,
  ];

  if (o.stage_suggestion_json?.stage) {
    lines.push(
      `AI 阶段建议：${labelOf(STAGE_LABELS, o.stage_suggestion_json.stage)}`,
      `建议原因：${o.stage_suggestion_json.reason || "—"}`
    );
  }

  lines.push(
    `【所属客户】`,
    `公司：${o.company_name || "—"}`,
    `客户名：${o.customer_contact || "—"}`,
    `手机：${o.phone || "—"}`,
    `行业：${o.industry || "—"}`,
    `来源：${o.source || "—"}`,
    `客户状态：${labelOf(CUSTOMER_STATUS_LABELS, o.customer_status)}`
  );

  const profile = o.profile_json || {};
  if (profile.last_summary) lines.push(`客户画像摘要：${profile.last_summary}`);
  if (Array.isArray(profile.pain_points) && profile.pain_points.length) {
    lines.push(`痛点：${profile.pain_points.join("、")}`);
  }
  if (Array.isArray(profile.competitors) && profile.competitors.length) {
    lines.push(`竞品：${profile.competitors.join("、")}`);
  }

  if (followUps.rows.length) {
    lines.push(`【客户最近跟进】`);
    for (const f of followUps.rows) {
      lines.push(
        `- ${labelOf(FOLLOW_TYPE_LABELS, f.type)} ${new Date(f.followed_at).toLocaleString("zh-CN")}：${String(f.content || "").slice(0, 200)}`
      );
    }
  }

  await appendCompetitorPlaybooks(lines, Number(o.company_id), profile);

  return {
    opportunityId: o.id,
    customerId: o.customer_id as number,
    text: lines.join("\n"),
  };
}

export async function answerContextChat(params: {
  user: SessionUser;
  message: string;
  customerId?: number | null;
  opportunityId?: number | null;
  sessionId?: number | null;
  history?: ChatTurn[];
}) {
  if (!params.user.company_id) throw new Error("缺少公司信息");
  if (!params.customerId && !params.opportunityId) {
    throw new Error("请指定客户或商机");
  }

  let contextText = "";
  let scopeLabel = "";
  let customerId = params.customerId || null;
  let opportunityId = params.opportunityId || null;

  if (opportunityId) {
    const ctx = await buildOpportunityContext(opportunityId);
    await assertCanAccessCustomer(params.user, ctx.customerId);
    contextText = ctx.text;
    scopeLabel = "商机助手";
    customerId = ctx.customerId;
  } else if (customerId) {
    await assertCanAccessCustomer(params.user, customerId);
    const ctx = await buildCustomerContext(customerId);
    contextText = ctx.text;
    scopeLabel = "客户助手";
  }

  let sessionId = params.sessionId || null;
  if (sessionId) {
    const owned = await pool.query(
      `SELECT id FROM context_chat_sessions
       WHERE id = $1 AND company_id = $2 AND user_id = $3`,
      [sessionId, params.user.company_id, params.user.id]
    );
    if (!owned.rows[0]) throw new AuthError("对话会话不存在或无权访问", 403);
  } else {
    const created = await pool.query(
      `INSERT INTO context_chat_sessions
        (company_id, user_id, customer_id, opportunity_id, title)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [
        params.user.company_id,
        params.user.id,
        customerId,
        opportunityId,
        params.message.slice(0, 80),
      ]
    );
    sessionId = created.rows[0].id as number;
  }

  const hist = await pool.query(
    `SELECT role, content FROM context_chat_messages
     WHERE session_id = $1 ORDER BY id DESC LIMIT 16`,
    [sessionId]
  );
  const historyTurns = hist.rows
    .reverse()
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({ role: r.role as "user" | "assistant", content: String(r.content) }));

  const history = historyTurns
    .slice(-8)
    .map((h) => `${h.role === "user" ? "销售" : "助手"}：${h.content}`)
    .join("\n");

  // 扣子智能体已有人设/知识库设定：系统侧只注入 CRM 资料与硬约束，避免两套人设打架。
  // 未配扣子时（OpenAI/启发式兜底）再带完整助手人设。
  const coze = await resolveCozeCredentials(params.user.company_id);
  const system = coze
    ? `以下内容来自销售 CRM，请结合你在智能体中的设定回答。
要求：
1. 紧扣下列资料，不要编造资料中不存在的事实；不足时明确说明并追问。
2. 可给出跟进话术、异议处理、阶段推进、风险点等可执行建议。
3. 回答结构化，优先 2～5 条要点，可用 Markdown。
${USER_FACING_AI_REPLY_RULES}`
    : `你是销售 CRM 里的${scopeLabel}。根据给定的客户/商机资料，用简洁中文给出可执行建议。
要求：
1. 紧扣资料，不要编造不存在的事实；资料不足时明确说明并追问。
2. 可建议下一步跟进话术、异议处理、阶段推进、风险点。
3. 回答结构化，优先给出 2～5 条要点，可使用 Markdown（标题、加粗、列表）排版。
${USER_FACING_AI_REPLY_RULES}`;

  const prompt = `${contextText}

【近期对话】
${history || "（无）"}

【销售提问】
${params.message}`;

  const startedAt = Date.now();
  const result = await chatCompletionDetailed({
    system,
    prompt,
    companyId: params.user.company_id,
    userId: params.user.id,
  });
  const durationMs = Date.now() - startedAt;
  const answer = result.content.trim() || "暂时没有生成有效回答，请换个问法再试。";

  await pool.query(
    `INSERT INTO context_chat_messages (session_id, role, content)
     VALUES ($1,'user',$2)`,
    [sessionId, params.message]
  );
  const usagePayload = {
    ...(result.usage || {}),
    duration_ms: durationMs,
    provider: result.provider,
  };
  await pool.query(
    `INSERT INTO context_chat_messages (session_id, role, content, usage_json)
     VALUES ($1,'assistant',$2,$3::jsonb)`,
    [sessionId, answer, JSON.stringify(usagePayload)]
  );
  await pool.query(
    `UPDATE context_chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [sessionId]
  );

  return {
    answer,
    session_id: sessionId,
    usage: result.usage,
    duration_ms: durationMs,
    provider: result.provider,
  };
}

export async function listContextChatSessions(params: {
  user: SessionUser;
  customerId?: number | null;
  opportunityId?: number | null;
  limit?: number;
}) {
  if (!params.user.company_id) throw new Error("缺少公司信息");
  if (!params.customerId && !params.opportunityId) {
    throw new Error("请指定客户或商机");
  }

  if (params.opportunityId) {
    const ctx = await buildOpportunityContext(params.opportunityId);
    await assertCanAccessCustomer(params.user, ctx.customerId);
  } else if (params.customerId) {
    await assertCanAccessCustomer(params.user, params.customerId);
  }

  const limit = Math.min(50, Math.max(1, params.limit || 20));
  const qParams: unknown[] = [params.user.company_id, params.user.id];
  let where = `WHERE s.company_id = $1 AND s.user_id = $2`;
  if (params.opportunityId) {
    qParams.push(params.opportunityId);
    where += ` AND s.opportunity_id = $${qParams.length}`;
  } else if (params.customerId) {
    qParams.push(params.customerId);
    where += ` AND s.customer_id = $${qParams.length} AND s.opportunity_id IS NULL`;
  }
  qParams.push(limit);

  const result = await pool.query(
    `SELECT s.id, s.title, s.customer_id, s.opportunity_id, s.created_at, s.updated_at,
            (SELECT COUNT(*)::int FROM context_chat_messages m WHERE m.session_id = s.id) AS message_count
     FROM context_chat_sessions s
     ${where}
     ORDER BY s.updated_at DESC
     LIMIT $${qParams.length}`,
    qParams
  );
  return result.rows;
}

export async function getContextChatMessages(params: {
  user: SessionUser;
  sessionId: number;
}) {
  if (!params.user.company_id) throw new Error("缺少公司信息");
  const session = await pool.query(
    `SELECT * FROM context_chat_sessions
     WHERE id = $1 AND company_id = $2 AND user_id = $3`,
    [params.sessionId, params.user.company_id, params.user.id]
  );
  const row = session.rows[0];
  if (!row) throw new AuthError("对话会话不存在或无权访问", 404);

  if (row.opportunity_id) {
    const ctx = await buildOpportunityContext(row.opportunity_id);
    await assertCanAccessCustomer(params.user, ctx.customerId);
  } else if (row.customer_id) {
    await assertCanAccessCustomer(params.user, row.customer_id);
  }

  const msgs = await pool.query(
    `SELECT id, role, content, usage_json, created_at
     FROM context_chat_messages
     WHERE session_id = $1
     ORDER BY id ASC`,
    [params.sessionId]
  );

  return {
    session: row,
    messages: msgs.rows.map((m) => ({
      id: m.id as number,
      role: m.role as "user" | "assistant",
      content: String(m.content),
      usage: (m.usage_json as TokenUsage | null) || null,
      duration_ms:
        m.usage_json && typeof m.usage_json === "object"
          ? Number((m.usage_json as { duration_ms?: number }).duration_ms) || null
          : null,
      created_at: m.created_at as string,
    })),
  };
}

export async function getLatestContextChat(params: {
  user: SessionUser;
  customerId?: number | null;
  opportunityId?: number | null;
}) {
  const sessions = await listContextChatSessions({ ...params, limit: 1 });
  if (!sessions[0]) {
    return { session: null, messages: [] as ChatTurn[], sessions };
  }
  const detail = await getContextChatMessages({
    user: params.user,
    sessionId: sessions[0].id,
  });
  const allSessions = await listContextChatSessions({ ...params, limit: 20 });
  return { ...detail, sessions: allSessions };
}
