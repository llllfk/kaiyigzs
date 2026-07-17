/**
 * Coze AI / LLM wrapper.
 * Falls back to heuristics when no API key is configured.
 */
export async function chatCompletion(params: {
  system?: string;
  prompt: string;
}): Promise<string> {
  const apiKey = process.env.COZE_AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (isKnowledgePrompt(params.prompt)) {
      return heuristicKbAnswer(params.prompt);
    }
    return JSON.stringify(heuristicInsight(params.prompt));
  }

  const base = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "gpt-4o-mini",
      messages: [
        ...(params.system
          ? [{ role: "system", content: params.system }]
          : []),
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
  };
  return json.choices?.[0]?.message?.content || "";
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
