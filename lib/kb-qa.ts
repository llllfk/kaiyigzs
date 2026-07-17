import pool from "@/lib/db";
import { chatCompletion } from "@/lib/ai";
import { readObject } from "@/lib/storage";

async function collectKbContext(params: {
  companyId: number;
  folderId?: number | null;
  fileIds?: number[];
  maxChars?: number;
}) {
  const maxChars = params.maxChars || 12000;
  const chunks: { fileId: number; fileName: string; text: string }[] = [];

  let filesQuery = `SELECT id, file_name, uri, mime FROM kb_files WHERE company_id = $1`;
  const qParams: unknown[] = [params.companyId];

  if (params.fileIds?.length) {
    qParams.push(params.fileIds);
    filesQuery += ` AND id = ANY($${qParams.length}::bigint[])`;
  } else if (params.folderId) {
    qParams.push(params.folderId);
    filesQuery += ` AND folder_id = $${qParams.length}`;
  }

  filesQuery += ` ORDER BY created_at DESC LIMIT 30`;
  const files = await pool.query(filesQuery, qParams);

  let used = 0;
  for (const f of files.rows) {
    const isText =
      (f.mime && f.mime.includes("text")) ||
      /\.(txt|md|csv|json|log)$/i.test(f.file_name);
    if (!isText) continue;
    try {
      const buf = await readObject(f.uri);
      const text = buf.toString("utf8").slice(0, 4000);
      if (!text.trim()) continue;
      chunks.push({ fileId: f.id, fileName: f.file_name, text });
      used += text.length;
      if (used >= maxChars) break;
    } catch {
      // skip unreadable
    }
  }

  return chunks;
}

export async function answerKnowledgeQuestion(params: {
  companyId: number;
  userId: number;
  question: string;
  folderId?: number | null;
  fileIds?: number[];
  sessionId?: number | null;
}) {
  const sources = await collectKbContext({
    companyId: params.companyId,
    folderId: params.folderId,
    fileIds: params.fileIds,
  });

  const context = sources
    .map((s, i) => `[#${i + 1} ${s.fileName}]\n${s.text}`)
    .join("\n\n");

  const system = `你是公司内部销售知识库助手。只根据给定资料回答，不确定时明确说明。
回答末尾用「参考：」列出用到的文件名。用简洁中文。`;

  const prompt = `资料：
${context || "（暂无可用文本资料）"}

问题：${params.question}`;

  const answer = await chatCompletion({ system, prompt });

  let sessionId = params.sessionId || null;
  if (!sessionId) {
    const s = await pool.query(
      `INSERT INTO kb_qa_sessions (company_id, user_id, title)
       VALUES ($1,$2,$3) RETURNING id`,
      [params.companyId, params.userId, params.question.slice(0, 80)]
    );
    sessionId = s.rows[0].id;
  }

  await pool.query(
    `INSERT INTO kb_qa_messages (session_id, role, content, sources_json)
     VALUES ($1,'user',$2,'[]'::jsonb)`,
    [sessionId, params.question]
  );

  const sourceMeta = sources.map((s) => ({
    id: s.fileId,
    file_name: s.fileName,
  }));

  await pool.query(
    `INSERT INTO kb_qa_messages (session_id, role, content, sources_json)
     VALUES ($1,'assistant',$2,$3::jsonb)`,
    [sessionId, answer, JSON.stringify(sourceMeta)]
  );

  return {
    session_id: sessionId,
    answer,
    sources: sourceMeta,
  };
}
