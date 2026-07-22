import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  answerContextChat,
  getContextChatMessages,
  getLatestContextChat,
  listContextChatSessions,
  type ChatTurn,
} from "@/lib/context-chat";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";

/** 允许 AI 上游等待（与 AI_TIMEOUT_MS 对齐） */
export const maxDuration = 180;

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    const sp = request.nextUrl.searchParams;
    const sessionId = sp.get("session_id");
    const customerId = sp.get("customer_id") ? Number(sp.get("customer_id")) : null;
    const opportunityId = sp.get("opportunity_id") ? Number(sp.get("opportunity_id")) : null;
    const listOnly = sp.get("list") === "1";

    if (sessionId) {
      const detail = await getContextChatMessages({
        user,
        sessionId: Number(sessionId),
      });
      return jsonOk(detail);
    }

    if (!customerId && !opportunityId) {
      return jsonError("请指定客户、商机或会话");
    }

    if (listOnly) {
      const sessions = await listContextChatSessions({
        user,
        customerId,
        opportunityId,
      });
      return jsonOk(sessions);
    }

    const latest = await getLatestContextChat({
      user,
      customerId,
      opportunityId,
    });
    return jsonOk(latest);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    const body = await request.json();
    const message = String(body.message || "").trim();
    if (!message) return jsonError("请输入问题");

    const customerId = body.customer_id != null ? Number(body.customer_id) : null;
    const opportunityId = body.opportunity_id != null ? Number(body.opportunity_id) : null;
    const sessionId = body.session_id != null ? Number(body.session_id) : null;
    if (!customerId && !opportunityId) {
      return jsonError("请指定客户或商机");
    }

    const history: ChatTurn[] = Array.isArray(body.history)
      ? body.history
          .filter(
            (h: { role?: string; content?: string }) =>
              (h.role === "user" || h.role === "assistant") && String(h.content || "").trim()
          )
          .map((h: { role: "user" | "assistant"; content: string }) => ({
            role: h.role,
            content: String(h.content).slice(0, 4000),
          }))
      : [];

    const result = await answerContextChat({
      user,
      message,
      customerId,
      opportunityId,
      sessionId,
      history,
    });

    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
