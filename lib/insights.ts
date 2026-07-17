import { chatCompletion } from "@/lib/ai";

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
}`;

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

export async function analyzeConversationText(params: {
  kind: "call" | "wechat";
  text: string;
  customerName?: string;
}): Promise<InsightResult> {
  const label = params.kind === "call" ? "通话转写" : "微信聊天记录";
  const prompt = `客户：${params.customerName || "未知"}
类型：${label}
内容：
${params.text.slice(0, 12000)}

请分析并只返回 JSON。`;

  const content = await chatCompletion({ system: SYSTEM, prompt });
  try {
    return extractJson(content);
  } catch {
    return {
      intent: "medium",
      pain_points: [],
      competitors: [],
      commitments: [],
      next_actions: ["跟进客户并确认需求"],
      sentiment: "neutral",
      summary: content.slice(0, 500) || params.text.slice(0, 200),
    };
  }
}
