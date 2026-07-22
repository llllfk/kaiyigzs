import { chatCompletion } from "@/lib/ai";
import { mergePainPoints } from "@/lib/pain-points";

export type InsightResult = {
  intent: "high" | "medium" | "low" | string;
  pain_points: string[];
  competitors: string[];
  commitments: string[];
  next_actions: string[];
  sentiment: string;
  summary: string;
  stage_suggestion?: string;
  price_sensitivity?: string;
  decision_makers?: string[];
};

const SYSTEM = `你是销售 CRM 的分析助手。根据通话转写或微信聊天记录，输出严格 JSON（不要 markdown），字段：
{
  "intent": "high|medium|low",
  "pain_points": string[],
  "competitors": string[],
  "commitments": string[],
  "next_actions": string[],
  "sentiment": "positive|neutral|negative",
  "summary": string,
  "stage_suggestion": "lead|contact|proposal|won|lost|",
  "price_sensitivity": string,
  "decision_makers": string[]
}
文字字段（summary、next_actions、pain_points、commitments、competitors、decision_makers、price_sensitivity）面向销售同事：用可读名称，不要写入数据库 ID、记录编号、API Key、Token、App ID、内部字段名或系统凭证。

pain_points 规则（重要）：
- 必须尽量提炼客户顾虑、卡点、不满或未满足需求（价格、交期、功能、竞品对比、决策流程等）。
- 每条必须是短标签：建议不超过 16 个汉字，不要复述对话细节、人名、具体金额或冗长从句。
- 优先从这些标准类目中选择：价格敏感、付款条件、最小起订量、竞品对比、交期要求、供应稳定性、质量稳定性、规格匹配、定制需求、功能缺口、测试验证、合规要求、对接集成、服务响应、决策流程、项目不确定性、采购时机、物流与地域、需求待确认。
- 相同诉求必须归到同一标准类目。例如“报价偏高”“希望降价”“预算有限”统一写“价格敏感”；“还在比较其他供应商”“需要货比”统一写“竞品对比”。
- 同类痛点只写一条；单次解析最多 5 条。
- 通话与微信一视同仁：只要对话里能推断出痛点，就写入；不要因为是微信短句就返回空数组。
- 信息不足时，基于上下文给 1～3 条合理推断，并在 summary 里说明「依据有限」。

next_actions 规则（重要）：
- 必须是「销售本人要执行的跟进动作」，将直接生成销售待办。
- 不要写客户侧将做什么（如「陈采购继续对比五金件供应商」）。
- 好例子：「三天内回访陈采购，确认五金件供应商对比结论」「本周发送阶梯报价给王总」。
- 坏例子：「陈采购继续对比五金件供应商」「客户内部讨论后答复」。
- 微信聊天同样必须给出至少 1 条可执行 next_actions。

commitments：记录我方或对方在沟通中做出的承诺原文要点；系统会自动加「兑现承诺：」前缀生成待办，此处不要自行加前缀。`;

function extractJson(text: string): InsightResult {
  const match = text.match(/\{[\s\S]*\}/);
  const raw = match ? match[0] : text;
  const parsed = JSON.parse(raw) as InsightResult;
  return {
    intent: parsed.intent || "medium",
    pain_points: parsed.pain_points || [],
    competitors: parsed.competitors || [],
    commitments: parsed.commitments || [],
    next_actions: parsed.next_actions || [],
    sentiment: parsed.sentiment || "neutral",
    summary: parsed.summary || "",
    stage_suggestion: parsed.stage_suggestion || "",
    price_sensitivity: parsed.price_sensitivity || "",
    decision_makers: parsed.decision_makers || [],
  };
}

/** 微信粘贴常更零散：空结果时补最低限度字段，避免画像/待办完全空白 */
function ensureInsightMinimum(
  result: InsightResult,
  kind: "call" | "wechat"
): InsightResult {
  const pains = (result.pain_points || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const actions = (result.next_actions || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const summary = String(result.summary || "").trim();

  if (kind === "wechat") {
    if (pains.length === 0 && summary) {
      pains.push("需进一步确认客户核心顾虑");
    }
    if (actions.length === 0) {
      actions.push("根据本次微信沟通回访客户，确认需求与下一步");
    }
  } else if (actions.length === 0) {
    actions.push("跟进客户并确认需求");
  }

  return {
    ...result,
    pain_points: mergePainPoints([], pains, 5),
    next_actions: actions.slice(0, 5),
    summary: summary || "已完成沟通解析",
  };
}

export async function analyzeConversationText(params: {
  kind: "call" | "wechat";
  text: string;
  customerName?: string;
  companyId?: number | null;
  userId?: number | null;
}): Promise<InsightResult> {
  const label = params.kind === "call" ? "通话转写" : "微信聊天记录";
  const wechatHint =
    params.kind === "wechat"
      ? `

注意：这是从微信复制粘贴的聊天内容，可能含时间戳、昵称、表情或系统提示。请忽略无关格式，从对话语义中提炼短标签痛点、竞品与跟进动作；pain_points、next_actions 不要返回空数组。`
      : "";

  const prompt = `客户：${params.customerName || "未知"}
类型：${label}
内容：
${params.text.slice(0, 12000)}
${wechatHint}

请分析并只返回 JSON。`;

  const content = await chatCompletion({
    system: SYSTEM,
    prompt,
    companyId: params.companyId,
    userId: params.userId,
  });
  try {
    return ensureInsightMinimum(extractJson(content), params.kind);
  } catch {
    return ensureInsightMinimum(
      {
        intent: "medium",
        pain_points: [],
        competitors: [],
        commitments: [],
        next_actions: [],
        sentiment: "neutral",
        summary: content.slice(0, 500) || params.text.slice(0, 200),
      },
      params.kind
    );
  }
}
