import pool from "@/lib/db";
import {
  chatCompletionDetailed,
  resolveCozeCredentials,
  USER_FACING_AI_REPLY_RULES,
} from "@/lib/ai";
import { readObject } from "@/lib/storage";

export type KbSourceRef = {
  id?: number;
  file_name: string;
  snippet?: string;
};

function makeSnippet(text: string, question: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const tokens = question
    .replace(/[？?。，,！!、；;：:\s]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 6);
  const lower = clean.toLowerCase();
  for (const t of tokens) {
    const idx = lower.indexOf(t.toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - 36);
      const slice = clean.slice(start, start + max);
      return `${start > 0 ? "…" : ""}${slice}${start + max < clean.length ? "…" : ""}`;
    }
  }
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function normalizeKnowledgeHint(content: unknown): string {
  const raw = String(content ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "string") return parsed.replace(/\s+/g, " ").trim();
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            const o = item as Record<string, unknown>;
            return String(o.output || o.content || o.text || o.snippet || "");
          }
          return "";
        })
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      const candidate =
        o.output ||
        o.content ||
        o.text ||
        o.snippet ||
        (o.data && typeof o.data === "object"
          ? (o.data as Record<string, unknown>).output
          : null);
      if (candidate) return String(candidate).replace(/\s+/g, " ").trim();
    }
  } catch {
    /* plain text */
  }
  return raw.replace(/\s+/g, " ").trim();
}

async function collectKbContext(params: {
  companyId: number;
  folderId?: number | null;
  fileIds?: number[];
  question: string;
  maxChars?: number;
}) {
  const maxChars = params.maxChars || 12000;
  const chunks: {
    fileId: number;
    fileName: string;
    text: string;
    snippet: string;
  }[] = [];

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
      chunks.push({
        fileId: f.id,
        fileName: f.file_name,
        text,
        snippet: makeSnippet(text, params.question),
      });
      used += text.length;
    } catch {
      // skip unreadable
    }
    if (used >= maxChars) break;
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
  const coze = await resolveCozeCredentials(params.companyId);

  // 已配置智能体：交给 Bot 绑定的知识库检索，不再从本系统目录拼文件
  let system: string;
  let prompt: string;
  let sourceMeta: KbSourceRef[] = [];

  if (coze) {
    // 人设与知识库用法由扣子智能体承担；此处只约束回答边界
    system = `以下是销售同事的知识库提问。请按你在智能体中的设定与已绑定知识库回答。
不确定时明确说明。用简洁中文，必要时用 Markdown 分点列出。
如引用了知识库内容，请在相关句子后用〔来源〕简要提示，但不要编造文件名。
${USER_FACING_AI_REPLY_RULES}`;
    prompt = params.question;
  } else {
    const sources = await collectKbContext({
      companyId: params.companyId,
      folderId: params.folderId,
      fileIds: params.fileIds,
      question: params.question,
    });
    sourceMeta = sources.map((s) => ({
      id: s.fileId,
      file_name: s.fileName,
      snippet: s.snippet,
    }));
    const context = sources
      .map((s, i) => `【资料 ${i + 1}：${s.fileName}】\n${s.text}`)
      .join("\n\n");
    system = `你是公司内部销售知识库助手。只根据给定资料回答，不确定时明确说明。
在用到的关键结论后标注〔资料N〕（N 为资料编号）。不要在文末再列「参考：」文件列表（系统会单独展示来源与原文片段）。用简洁中文。
${USER_FACING_AI_REPLY_RULES}`;
    prompt = `资料：
${context || "（暂无可用文本资料）"}

问题：${params.question}`;
  }

  const startedAt = Date.now();
  const result = await chatCompletionDetailed({
    system,
    prompt,
    companyId: params.companyId,
    userId: params.userId,
  });
  const durationMs = Date.now() - startedAt;
  const answer = result.content;

  if (coze && result.knowledgeHints?.length) {
    sourceMeta = result.knowledgeHints.slice(0, 8).map((hint, i) => {
      const text = normalizeKnowledgeHint(hint).slice(0, 400);
      const shortName = text.length <= 40 ? text : `知识库片段 ${i + 1}`;
      return {
        file_name: shortName || `知识库片段 ${i + 1}`,
        snippet: text.length > 40 ? text : undefined,
      };
    });
  } else if (coze) {
    sourceMeta = [
      {
        file_name: "智能体知识库",
        snippet: "回答由已绑定的智能体知识库生成；未返回可展示的原文片段。",
      },
    ];
  }

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

  const assistantMeta = {
    sources: sourceMeta,
    usage: result.usage,
    provider: result.provider,
    duration_ms: durationMs,
    via: coze ? "coze_knowledge" : "local_folder",
  };

  await pool.query(
    `INSERT INTO kb_qa_messages (session_id, role, content, sources_json)
     VALUES ($1,'assistant',$2,$3::jsonb)`,
    [sessionId, answer, JSON.stringify(assistantMeta)]
  );

  return {
    session_id: sessionId,
    answer,
    sources: sourceMeta,
    usage: result.usage,
    duration_ms: durationMs,
    via: coze ? "coze_knowledge" : "local_folder",
  };
}
