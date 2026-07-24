/**
 * AI wrapper：优先按公司配置的智能体凭证；可回退全局 env / OpenAI；再回退启发式。
 */

import pool from "@/lib/db";
import { decryptCompanyConfig } from "@/lib/config-crypto";

export type CozeCredentials = {
  apiKey: string;
  botId: string;
  apiBase: string;
  source: "company" | "env";
};

export async function resolveCozeCredentials(
  companyId?: number | null
): Promise<CozeCredentials | null> {
  const envKey = process.env.COZE_AI_API_KEY?.trim() || "";
  const envBot = process.env.COZE_BOT_ID?.trim() || "";
  const envBase = process.env.COZE_API_BASE?.trim() || "https://api.coze.cn";

  if (companyId) {
    const res = await pool.query(`SELECT config FROM companies WHERE id = $1`, [companyId]);
    const config = decryptCompanyConfig((res.rows[0]?.config || {}) as Record<string, unknown>);
    const coze = (config as { coze?: Record<string, unknown> }).coze;
    const companyBot = String(coze?.bot_id || "").trim();
    // 共用全局 PAT；公司可覆盖 api_key（一般不填）
    const companyKey = String(coze?.api_key || "").trim();
    const companyBase = String(coze?.api_base || "").trim();
    const apiKey = companyKey || envKey;
    const apiBase = companyBase || envBase;
    if (companyBot && apiKey) {
      return {
        apiKey,
        botId: companyBot,
        apiBase,
        source: companyKey ? "company" : "env",
      };
    }
  }

  // 无公司 Bot 时：完整走全局 env（演示兜底）
  if (envKey && envBot) {
    return { apiKey: envKey, botId: envBot, apiBase: envBase, source: "env" };
  }
  return null;
}

export function maskCozeApiKey(key: string | null | undefined): string | null {
  const k = String(key || "").trim();
  if (!k) return null;
  if (k.length <= 12) return `${k.slice(0, 4)}***`;
  return `${k.slice(0, 8)}…${k.slice(-4)}`;
}

/** 面向销售同事的对话/问答：禁止输出内部 ID、密钥等技术标识 */
export const USER_FACING_AI_REPLY_RULES = `回复规范（必须遵守）：
- 用客户名、公司名、商机标题等可读名称表述，面向销售同事。
- 禁止出现：数据库 ID、记录编号、#数字编号、API Key、Access Token、App ID/AppKey、bot_id、dataset_id、文件 URI/路径、内部字段名（如 customer_id、owner_id、session_id）等。
- 不要复述、猜测或索要系统密钥、令牌、凭证。`;

export type TokenUsage = {
  token_count: number;
  input_count: number;
  output_count: number;
};

export type ChatCompletionResult = {
  content: string;
  usage: TokenUsage | null;
  provider: "coze" | "openai" | "heuristic";
  /** Coze 知识库召回片段摘要（若流式事件带 type=knowledge） */
  knowledgeHints?: string[];
};

export class AiBusyError extends Error {
  status = 429;
  constructor(message = "您有一个 AI 请求正在处理，请稍后再试") {
    super(message);
    this.name = "AiBusyError";
  }
}

/** 进程内：同一 CRM 用户同时只允许 1 个 AI 请求 */
const userAiInflight = new Map<number, true>();

export async function withUserAiSlot<T>(
  userId: number | null | undefined,
  fn: () => Promise<T>
): Promise<T> {
  if (userId == null || !Number.isFinite(userId)) {
    return fn();
  }
  if (userAiInflight.has(userId)) {
    throw new AiBusyError();
  }
  userAiInflight.set(userId, true);
  try {
    return await fn();
  } finally {
    userAiInflight.delete(userId);
  }
}

export function cozeUserIdFor(userId?: number | null) {
  if (userId != null && Number.isFinite(userId)) return `crm-${userId}`;
  return process.env.COZE_USER_ID?.trim() || "sales-crm";
}

/** AI 上游请求超时（毫秒），默认 150 秒 */
export function getAiTimeoutMs() {
  const n = Number(process.env.AI_TIMEOUT_MS || 150_000);
  return Number.isFinite(n) && n >= 5_000 ? n : 150_000;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = getAiTimeoutMs()
): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`AI 请求超时（${Math.round(timeoutMs / 1000)} 秒），请稍后重试`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeUsage(raw: unknown): TokenUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const token =
    Number(u.token_count ?? u.total_tokens ?? 0) ||
    Number(u.input_count ?? u.input_tokens ?? 0) +
      Number(u.output_count ?? u.output_tokens ?? 0);
  const input = Number(u.input_count ?? u.input_tokens ?? 0);
  const output = Number(u.output_count ?? u.output_tokens ?? 0);
  if (!token && !input && !output) return null;
  return {
    token_count: token || input + output,
    input_count: input,
    output_count: output,
  };
}

export async function chatCompletion(params: {
  system?: string;
  prompt: string;
  companyId?: number | null;
  /** CRM 用户 id：用于 AI user_id 与同用户并发限制 */
  userId?: number | null;
}): Promise<string> {
  const result = await chatCompletionDetailed(params);
  return result.content;
}

export async function chatCompletionDetailed(params: {
  system?: string;
  prompt: string;
  companyId?: number | null;
  userId?: number | null;
}): Promise<ChatCompletionResult> {
  return withUserAiSlot(params.userId, async () => {
    const coze = await resolveCozeCredentials(params.companyId);
    if (coze) {
      return cozeChatCompletion(coze, params);
    }

    const openAiKey = process.env.OPENAI_API_KEY?.trim();
    if (openAiKey) {
      return openAiChatCompletion(openAiKey, params);
    }

    if (isKnowledgePrompt(params.prompt)) {
      return { content: heuristicKbAnswer(params.prompt), usage: null, provider: "heuristic" };
    }
    return {
      content: JSON.stringify(heuristicInsight(params.prompt)),
      usage: null,
      provider: "heuristic",
    };
  });
}

async function cozeChatCompletion(
  creds: CozeCredentials,
  params: { system?: string; prompt: string; userId?: number | null }
): Promise<ChatCompletionResult> {
  const userText = params.system
    ? `${params.system}\n\n${params.prompt}`
    : params.prompt;

  const res = await fetchWithTimeout(`${creds.apiBase}/v3/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.apiKey}`,
    },
    body: JSON.stringify({
      bot_id: creds.botId,
      user_id: cozeUserIdFor(params.userId),
      stream: true,
      auto_save_history: false,
      additional_messages: [
        {
          role: "user",
          content: userText,
          content_type: "text",
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`AI 调用失败: ${res.status} ${errText.slice(0, 200)}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
    const parsed = parseCozeSse(await res.text());
    return {
      content: parsed.content,
      usage: parsed.usage,
      provider: "coze",
      knowledgeHints: parsed.knowledgeHints,
    };
  }

  const json = (await res.json()) as {
    data?: { content?: string; usage?: unknown };
    msg?: string;
    message?: string;
  };
  if (json.data?.content) {
    return {
      content: json.data.content,
      usage: normalizeUsage(json.data.usage),
      provider: "coze",
    };
  }
  throw new Error(json.msg || json.message || "AI 返回为空");
}

function parseCozeSse(raw: string): {
  content: string;
  usage: TokenUsage | null;
  knowledgeHints: string[];
} {
  let answer = "";
  let lastCompleted = "";
  let usage: TokenUsage | null = null;
  const knowledgeHints: string[] = [];
  const blocks = raw.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split("\n");
    let event = "";
    let dataLine = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLine += line.slice(5).trim();
    }
    if (!dataLine || dataLine === "[DONE]") continue;

    try {
      const data = JSON.parse(dataLine) as {
        role?: string;
        type?: string;
        content?: string;
        msg?: string;
        usage?: unknown;
      };
      if (data.msg && !data.content && !data.usage) {
        throw new Error(data.msg);
      }
      if (event.includes("message.delta") && data.content) {
        answer += data.content;
      }
      if (
        event.includes("message.completed") &&
        data.type === "answer" &&
        data.content
      ) {
        lastCompleted = data.content;
      }
      if (
        event.includes("message.completed") &&
        data.type === "knowledge" &&
        data.content
      ) {
        const hint = String(data.content).replace(/\s+/g, " ").trim().slice(0, 400);
        if (hint) knowledgeHints.push(hint);
      }
      if (event.includes("chat.completed") && data.usage) {
        usage = normalizeUsage(data.usage);
      } else if (data.usage) {
        usage = normalizeUsage(data.usage) || usage;
      }
      if (event.includes("error")) {
        throw new Error(data.msg || data.content || "AI 流式返回错误");
      }
    } catch (err) {
      if (err instanceof SyntaxError) continue;
      throw err;
    }
  }

  return {
    content: (lastCompleted || answer).trim(),
    usage,
    knowledgeHints,
  };
}

async function openAiChatCompletion(
  apiKey: string,
  params: { system?: string; prompt: string }
): Promise<ChatCompletionResult> {
  const base = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const res = await fetchWithTimeout(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "gpt-4o-mini",
      messages: [
        ...(params.system ? [{ role: "system", content: params.system }] : []),
        { role: "user", content: params.prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    throw new Error(`AI 调用失败: ${res.status}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    content: json.choices?.[0]?.message?.content || "",
    usage: normalizeUsage({
      token_count: json.usage?.total_tokens,
      input_count: json.usage?.prompt_tokens,
      output_count: json.usage?.completion_tokens,
    }),
    provider: "openai",
  };
}

function isKnowledgePrompt(prompt: string) {
  return prompt.includes("资料：") && prompt.includes("问题：");
}

function heuristicKbAnswer(prompt: string) {
  const qMatch = prompt.match(/问题：([\s\S]*)$/);
  const question = (qMatch?.[1] || "").trim();
  const sources = [...prompt.matchAll(/\[#\d+\s+([^\]]+)\]/g)].map((m) => m[1]);
  const body = prompt.includes("（暂无可用文本资料）")
    ? "知识库中暂无可用文本资料，请先上传 txt/md/csv 等文本文件后再提问。"
    : `根据现有知识库资料，针对「${question.slice(0, 80)}」的建议：请优先查阅产品说明与异议处理文档，结合客户场景给出方案要点，并约定下一步跟进。`;
  const ref =
    sources.length > 0 ? `\n\n参考：${sources.slice(0, 5).join("、")}` : "";
  return body + ref;
}

function heuristicInsight(prompt: string) {
  const text = prompt;
  const lower = text.toLowerCase();
  const competitors: string[] = [];
  const known = ["华为", "腾讯", "阿里", "钉钉", "飞书", "企微", "Salesforce", "纷享销客", "销售易"];
  for (const name of known) {
    if (text.includes(name) || lower.includes(name.toLowerCase())) {
      competitors.push(name);
    }
  }

  const pain_points: string[] = [];
  if (/价格|贵|预算|便宜/.test(text)) pain_points.push("价格敏感 / 预算顾虑");
  if (/功能|不够|缺|没有/.test(text)) pain_points.push("功能完整性不足");
  if (/竞品|对比|别家/.test(text)) pain_points.push("正在对比竞品");
  if (/时间|周期|上线/.test(text)) pain_points.push("上线时间要求");
  if (pain_points.length === 0) pain_points.push("待进一步确认核心痛点");

  const next_actions: string[] = [];
  if (/报价|方案/.test(text)) next_actions.push("发送正式报价与方案");
  if (/下周|明天|后天|约/.test(text)) next_actions.push("按约定时间回访");
  next_actions.push("跟进客户并确认决策人");

  const intent = /成交|签约|采购|马上|尽快/.test(text)
    ? "high"
    : /再看看|考虑|对比/.test(text)
      ? "medium"
      : "medium";

  return {
    intent,
    pain_points,
    competitors,
    commitments: /发给|发送|安排|演示/.test(text)
      ? ["按沟通承诺完成资料或演示"]
      : [],
    next_actions,
    sentiment: /不满|投诉|取消/.test(text)
      ? "negative"
      : /满意|不错|可以/.test(text)
        ? "positive"
        : "neutral",
    summary: text.replace(/\s+/g, " ").slice(0, 180),
    stage_suggestion: /报价|方案/.test(text)
      ? "proposal"
      : /沟通|演示/.test(text)
        ? "contact"
        : "lead",
    price_sensitivity: /价格|贵|预算/.test(text) ? "高" : "未知",
    decision_makers: [],
  };
}
