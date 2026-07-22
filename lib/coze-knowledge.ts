/**
 * 知识库文件同步 API
 * format_type: 0 文本 / 1 表格 / 2 图片
 */

import pool from "@/lib/db";
import { getAiTimeoutMs } from "@/lib/ai";
import {
  COZE_DATASET_TYPE_LABELS,
  COZE_FORMAT_TYPE,
  COZE_TYPE_EXTS,
  normalizeCozeDatasets,
  type CozeDataset,
  type CozeDatasetType,
} from "@/lib/coze-datasets";

export type { CozeDataset, CozeDatasetType };
export {
  COZE_DATASET_TYPE_LABELS,
  acceptForCozeDatasetType,
  normalizeCozeDatasets,
  parseCozeDatasetType,
} from "@/lib/coze-datasets";

export type CozeKnowledgeCreds = {
  apiKey: string;
  apiBase: string;
  datasetId: string;
  datasetType: CozeDatasetType;
  datasets: CozeDataset[];
};

export async function listCompanyCozeDatasets(
  companyId: number
): Promise<{ apiKey: string; apiBase: string; datasets: CozeDataset[] } | null> {
  const envKey = process.env.COZE_AI_API_KEY?.trim() || "";
  const envBase = process.env.COZE_API_BASE?.trim() || "https://api.coze.cn";
  const envDataset = process.env.COZE_DATASET_ID?.trim() || "";

  const res = await pool.query(`SELECT config FROM companies WHERE id = $1`, [companyId]);
  const coze = (res.rows[0]?.config as { coze?: Record<string, unknown> } | null)?.coze;
  const apiKey = String(coze?.api_key || "").trim() || envKey;
  const apiBase = String(coze?.api_base || "").trim() || envBase;
  let datasets = normalizeCozeDatasets(coze);
  if (datasets.length === 0 && envDataset) {
    datasets = [{ id: envDataset, name: "默认知识库", type: "text" }];
  }
  if (!apiKey || datasets.length === 0) return null;
  return { apiKey, apiBase, datasets };
}

export async function resolveCozeKnowledge(
  companyId: number,
  preferredDatasetId?: string | null
): Promise<CozeKnowledgeCreds | null> {
  const listed = await listCompanyCozeDatasets(companyId);
  if (!listed) return null;
  const preferred = String(preferredDatasetId || "").trim();
  const hit =
    (preferred && listed.datasets.find((d) => d.id === preferred)) || listed.datasets[0];
  if (!hit) return null;
  return {
    apiKey: listed.apiKey,
    apiBase: listed.apiBase,
    datasetId: hit.id,
    datasetType: hit.type,
    datasets: listed.datasets,
  };
}

function fileExt(fileName: string) {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

export function assertCozeUploadable(
  fileName: string,
  sizeBytes: number,
  datasetType: CozeDatasetType = "text"
) {
  const ext = fileExt(fileName);
  const allowed = COZE_TYPE_EXTS[datasetType];
  const label = COZE_DATASET_TYPE_LABELS[datasetType];
  if (!allowed.has(ext)) {
    throw new Error(
      `${label}仅支持 ${[...allowed].join("/")}，当前为 .${ext || "未知"}`
    );
  }
  if (datasetType === "text" && (ext === "txt" || ext === "md")) {
    if (sizeBytes > 5 * 1024 * 1024) {
      throw new Error("txt/md 不能超过 5MB");
    }
  } else if (datasetType === "image" || datasetType === "table") {
    if (sizeBytes > 20 * 1024 * 1024) {
      throw new Error("该类型文件不能超过 20MB");
    }
  } else if (sizeBytes > 100 * 1024 * 1024) {
    throw new Error("该类型文件不能超过 100MB");
  }
  return ext;
}

function friendlyApiError(raw: string, datasetType: CozeDatasetType) {
  const msg = String(raw || "").trim();
  const lower = msg.toLowerCase();
  if (
    lower.includes("request parameter error") ||
    msg.includes("请求参数错误") ||
    msg.includes("参数错误")
  ) {
    if (datasetType === "image") {
      return "图片知识库上传参数不正确，请确认所选库类型为图片知识库后重试";
    }
    if (datasetType === "table") {
      return "表格知识库暂不支持在本系统上传。请到知识库后台导入该 Excel/CSV 文件（或联系系统管理员协助导入）";
    }
    return "知识库上传参数不正确。请确认所选库类型与后台知识库类型一致（文本/表格/图片）";
  }
  return msg || "知识库接口失败";
}

/** 带原始接口详情的同步错误，便于审计与排查 */
export class KnowledgeSyncError extends Error {
  readonly friendly: string;
  readonly detail: {
    httpStatus?: number;
    apiCode?: number | string | null;
    apiMsg?: string | null;
    path?: string;
    datasetId?: string;
    datasetType?: CozeDatasetType;
    fileName?: string;
    fileSize?: number;
    raw?: string;
  };

  constructor(
    friendly: string,
    detail: KnowledgeSyncError["detail"] = {}
  ) {
    super(friendly);
    this.name = "KnowledgeSyncError";
    this.friendly = friendly;
    this.detail = detail;
  }

  /** 写入审计 / 数据库的完整描述 */
  toRecord() {
    const d = this.detail;
    const parts = [
      this.friendly,
      d.apiMsg && d.apiMsg !== this.friendly ? `原始: ${d.apiMsg}` : "",
      d.apiCode != null ? `code=${d.apiCode}` : "",
      d.httpStatus != null ? `http=${d.httpStatus}` : "",
      d.datasetType ? `type=${d.datasetType}` : "",
      d.datasetId ? `dataset=${d.datasetId}` : "",
      d.fileName ? `file=${d.fileName}` : "",
      d.fileSize != null ? `size=${d.fileSize}` : "",
      d.path ? `path=${d.path}` : "",
    ].filter(Boolean);
    return parts.join(" | ");
  }
}

async function cozeKnowledgeFetch(
  creds: Pick<CozeKnowledgeCreds, "apiKey" | "apiBase">,
  path: string,
  body: unknown,
  datasetType: CozeDatasetType = "text",
  ctx?: { datasetId?: string; fileName?: string; fileSize?: number }
) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), getAiTimeoutMs());
  try {
    const res = await fetch(`${creds.apiBase}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        "Content-Type": "application/json",
        "Agw-Js-Conv": "str",
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const json = (await res.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      message?: string;
      document_infos?: { document_id?: string | number }[];
      data?: { document_infos?: { document_id?: string | number }[] };
    };
    if (!res.ok || (json.code != null && json.code !== 0)) {
      const apiMsg = json.msg || json.message || `知识库接口失败: ${res.status}`;
      const friendly = friendlyApiError(apiMsg, datasetType);
      const err = new KnowledgeSyncError(friendly, {
        httpStatus: res.status,
        apiCode: json.code ?? null,
        apiMsg,
        path,
        datasetType,
        datasetId: ctx?.datasetId,
        fileName: ctx?.fileName,
        fileSize: ctx?.fileSize,
        raw: JSON.stringify({
          code: json.code,
          msg: json.msg,
          message: json.message,
          http: res.status,
        }),
      });
      console.error("[knowledge-sync]", err.toRecord(), err.detail.raw);
      throw err;
    }
    return json;
  } catch (err) {
    if (err instanceof KnowledgeSyncError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new KnowledgeSyncError("知识库请求超时，请稍后重试", {
        path,
        datasetType,
        datasetId: ctx?.datasetId,
        fileName: ctx?.fileName,
        fileSize: ctx?.fileSize,
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 先上传到文件服务，拿到 file_id（图片知识库需要） */
async function uploadRawFileToCoze(
  creds: Pick<CozeKnowledgeCreds, "apiKey" | "apiBase">,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)]),
    fileName
  );
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), getAiTimeoutMs());
  try {
    const res = await fetch(`${creds.apiBase}/v1/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
      },
      body: form,
      signal: ac.signal,
    });
    const json = (await res.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      message?: string;
      data?: { id?: string | number };
      id?: string | number;
    };
    if (!res.ok || (json.code != null && json.code !== 0)) {
      const apiMsg = json.msg || json.message || `文件上传失败: ${res.status}`;
      throw new KnowledgeSyncError(apiMsg, {
        httpStatus: res.status,
        apiCode: json.code ?? null,
        apiMsg,
        path: "/v1/files/upload",
        fileName,
        fileSize: buffer.length,
        raw: JSON.stringify({ code: json.code, msg: json.msg, message: json.message }),
      });
    }
    const id = json.data?.id ?? json.id;
    if (id == null || id === "") {
      throw new KnowledgeSyncError("文件已上传，但未返回文件 ID", {
        path: "/v1/files/upload",
        fileName,
        fileSize: buffer.length,
      });
    }
    return String(id);
  } catch (err) {
    if (err instanceof KnowledgeSyncError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new KnowledgeSyncError("文件上传超时，请稍后重试", {
        path: "/v1/files/upload",
        fileName,
        fileSize: buffer.length,
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function chunkStrategyFor(type: CozeDatasetType) {
  if (type === "image") {
    return { caption_type: 0 };
  }
  return { chunk_type: 0 };
}

/** 上传本地文件到指定/默认知识库，返回 document_id */
export async function uploadDocumentToCoze(params: {
  companyId: number;
  fileName: string;
  buffer: Buffer;
  datasetId?: string | null;
}): Promise<{ documentId: string; datasetId: string; datasetType: CozeDatasetType }> {
  const creds = await resolveCozeKnowledge(params.companyId, params.datasetId);
  if (!creds) {
    throw new Error("未配置知识库，请先在公司管理中绑定");
  }
  if (params.datasetId && creds.datasetId !== String(params.datasetId).trim()) {
    throw new Error("所选知识库不在公司配置列表中");
  }

  // 表格库：开放平台 document/create + format_type=1 实测返回 code=4000，暂不支持系统内上传
  if (creds.datasetType === "table") {
    throw new KnowledgeSyncError(
      "表格知识库暂不支持在本系统上传。请到知识库后台导入该 Excel/CSV 文件（或联系系统管理员协助导入）",
      {
        datasetId: creds.datasetId,
        datasetType: "table",
        fileName: params.fileName,
        fileSize: params.buffer.length,
        path: "/open_api/knowledge/document/create",
        apiCode: 4000,
        apiMsg: "table upload via OpenAPI unsupported",
      }
    );
  }

  const ext = assertCozeUploadable(
    params.fileName,
    params.buffer.length,
    creds.datasetType
  );

  let documentBases: Record<string, unknown>[];
  if (creds.datasetType === "image") {
    const fileId = await uploadRawFileToCoze(creds, params.fileName, params.buffer);
    documentBases = [
      {
        name: params.fileName,
        source_info: {
          document_source: 5,
          source_file_id: fileId,
          file_type: ext,
        },
      },
    ];
  } else {
    documentBases = [
      {
        name: params.fileName,
        source_info: {
          file_base64: params.buffer.toString("base64"),
          file_type: ext,
        },
      },
    ];
  }

  const json = await cozeKnowledgeFetch(
    creds,
    "/open_api/knowledge/document/create",
    {
      dataset_id: creds.datasetId,
      format_type: COZE_FORMAT_TYPE[creds.datasetType],
      document_bases: documentBases,
      chunk_strategy: chunkStrategyFor(creds.datasetType),
    },
    creds.datasetType,
    {
      datasetId: creds.datasetId,
      fileName: params.fileName,
      fileSize: params.buffer.length,
    }
  );

  const infos = json.document_infos || json.data?.document_infos || [];
  const docId = infos[0]?.document_id;
  if (docId == null || docId === "") {
    throw new KnowledgeSyncError("知识库已接收文件，但未返回文档 ID", {
      datasetId: creds.datasetId,
      datasetType: creds.datasetType,
      fileName: params.fileName,
      fileSize: params.buffer.length,
      path: "/open_api/knowledge/document/create",
    });
  }
  return {
    documentId: String(docId),
    datasetId: creds.datasetId,
    datasetType: creds.datasetType,
  };
}

export async function deleteDocumentFromCoze(params: {
  companyId: number;
  documentId: string;
}) {
  const creds = await resolveCozeKnowledge(params.companyId);
  if (!creds) return;
  await cozeKnowledgeFetch(
    creds,
    "/open_api/knowledge/document/delete",
    {
      document_ids: [params.documentId],
    },
    creds.datasetType
  );
}

export type RemoteKbDocument = {
  document_id: string;
  name: string;
  size: number | null;
  type: string | null;
  status: number | null;
  format_type: number | null;
  create_time: number | null;
  update_time: number | null;
};

/** @deprecated 使用 RemoteKbDocument */
export type CozeRemoteDocument = RemoteKbDocument;

/** 列出指定知识库远端文件（含表格库，可在知识库后台导入后同步到本系统目录） */
export async function listRemoteDocuments(params: {
  companyId: number;
  datasetId: string;
  page?: number;
  size?: number;
}): Promise<{ total: number; documents: RemoteKbDocument[]; datasetType: CozeDatasetType }> {
  const creds = await resolveCozeKnowledge(params.companyId, params.datasetId);
  if (!creds) {
    throw new Error("未配置知识库，请先在公司管理中绑定");
  }
  if (creds.datasetId !== String(params.datasetId).trim()) {
    throw new Error("所选知识库不在公司配置列表中");
  }

  const page = Math.max(1, params.page || 1);
  const size = Math.min(100, Math.max(1, params.size || 50));
  const json = await cozeKnowledgeFetch(
    creds,
    "/open_api/knowledge/document/list",
    {
      dataset_id: creds.datasetId,
      page,
      size,
    },
    creds.datasetType,
    { datasetId: creds.datasetId }
  );

  const infos =
    (json as { document_infos?: Record<string, unknown>[] }).document_infos ||
    (json as { data?: { document_infos?: Record<string, unknown>[] } }).data
      ?.document_infos ||
    [];
  const total = Number(
    (json as { total?: number }).total ??
      (json as { data?: { total?: number } }).data?.total ??
      infos.length
  );

  const documents: RemoteKbDocument[] = infos
    .map((row) => ({
      document_id: String(row.document_id ?? ""),
      name: String(row.name || "未命名"),
      size: row.size == null ? null : Number(row.size),
      type: row.type == null ? null : String(row.type),
      status: row.status == null ? null : Number(row.status),
      format_type: row.format_type == null ? null : Number(row.format_type),
      create_time: row.create_time == null ? null : Number(row.create_time),
      update_time: row.update_time == null ? null : Number(row.update_time),
    }))
    .filter((d) => d.document_id);

  return { total, documents, datasetType: creds.datasetType };
}

/** @deprecated 使用 listRemoteDocuments */
export async function listDocumentsFromCoze(
  params: Parameters<typeof listRemoteDocuments>[0]
) {
  return listRemoteDocuments(params);
}

/** 仅存在于远端知识库、本系统无本地副本的文件 URI */
export function remoteDocumentUri(datasetId: string, documentId: string) {
  return `kb://dataset/${encodeURIComponent(datasetId)}/document/${encodeURIComponent(documentId)}`;
}

/** @deprecated 使用 remoteDocumentUri */
export function cozeDocumentUri(datasetId: string, documentId: string) {
  return remoteDocumentUri(datasetId, documentId);
}

export function isRemoteDocumentUri(uri: string | null | undefined) {
  const u = String(uri || "");
  return u.startsWith("kb://") || u.startsWith("coze://");
}

/** @deprecated 使用 isRemoteDocumentUri */
export function isCozeDocumentUri(uri: string | null | undefined) {
  return isRemoteDocumentUri(uri);
}
