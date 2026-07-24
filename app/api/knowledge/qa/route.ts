import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { answerKnowledgeQuestion } from "@/lib/kb-qa";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import pool from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const sessionId = request.nextUrl.searchParams.get("session_id");

    if (sessionId) {
      const msgs = await pool.query(
        `SELECT m.* FROM kb_qa_messages m
         JOIN kb_qa_sessions s ON s.id = m.session_id
         WHERE m.session_id = $1 AND s.company_id = $2 AND s.user_id = $3
         ORDER BY m.id ASC`,
        [sessionId, user.company_id, user.id]
      );
      return jsonOk(msgs.rows);
    }

    const sessions = await pool.query(
      `SELECT * FROM kb_qa_sessions
       WHERE company_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 20`,
      [user.company_id, user.id]
    );
    return jsonOk(sessions.rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    const body = await request.json();
    const question = String(body.question || "").trim();
    if (!question) return jsonError("请输入问题");

    const result = await answerKnowledgeQuestion({
      companyId: user.company_id,
      userId: user.id,
      question,
      folderId: body.folder_id ? Number(body.folder_id) : null,
      fileIds: Array.isArray(body.file_ids)
        ? body.file_ids.map(Number)
        : undefined,
      sessionId: body.session_id ? Number(body.session_id) : null,
    });

    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
