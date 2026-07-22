import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { analyzeConversationText } from "@/lib/insights";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

/** Lightweight analyze endpoint without persisting media */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    const body = await request.json();
    const text = String(body.text || "").trim();
    const kind = body.kind === "wechat" ? "wechat" : "call";
    if (!text) return jsonError("文本不能为空");
    const result = await analyzeConversationText({
      kind,
      text,
      customerName: body.customer_name,
      companyId: user.company_id,
      userId: user.id,
    });
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
