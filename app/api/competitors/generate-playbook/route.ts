import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { chatCompletion, USER_FACING_AI_REPLY_RULES } from "@/lib/ai";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);

    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return jsonError("请先填写竞品名称");

    const summary = String(body.summary || "").trim();
    const strengths = String(body.strengths || "").trim();
    const weaknesses = String(body.weaknesses || "").trim();

    const system = `你是 B2B 销售赋能助手，负责撰写「应对竞品」话术。
${USER_FACING_AI_REPLY_RULES}

要求：
- 面向一线销售，中文，可直接照着说或改写后使用
- 结构建议：开场承接 → 认可对方顾虑 → 对比我方差异点 → 追问/推进下一步
- 语气专业、克制，不要攻击竞品，不要编造未给出的具体产品功能/价格
- 称呼只用「您」，禁止虚构客户姓名/职位称呼（如张总、李总、王总等）
- 若优势/劣势信息不完整，基于常见行业场景给出通用应对框架，并注明可再补充
- 只输出话术正文，不要标题、不要 markdown 代码块、不要解释过程`;

    const prompt = [
      `竞品名称：${name}`,
      summary ? `简介：${summary}` : "",
      strengths ? `对方优势：${strengths}` : "",
      weaknesses ? `对方劣势/可攻破点：${weaknesses}` : "",
      "",
      "请生成一段简洁实用的应对话术（约 150～350 字）。",
    ]
      .filter(Boolean)
      .join("\n");

    const content = await chatCompletion({
      system,
      prompt,
      companyId: user.company_id,
      userId: user.id,
    });

    const playbook = String(content || "")
      .trim()
      .replace(/^```[\w]*\n?|\n?```$/g, "")
      .trim();
    if (!playbook) return jsonError("AI 未返回有效内容，请稍后重试");

    return jsonOk({ playbook });
  } catch (err) {
    return handleApiError(err);
  }
}
