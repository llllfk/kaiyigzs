/** 知识库配置类型（可被客户端与服务端共用） */

export type CozeDatasetType = "text" | "table" | "image";

export type CozeDataset = {
  id: string;
  name: string;
  type: CozeDatasetType;
};

export const COZE_DATASET_TYPE_LABELS: Record<CozeDatasetType, string> = {
  text: "文本知识库",
  table: "表格知识库",
  image: "图片知识库",
};

export const COZE_FORMAT_TYPE: Record<CozeDatasetType, number> = {
  text: 0,
  table: 1,
  image: 2,
};

export const COZE_TYPE_EXTS: Record<CozeDatasetType, Set<string>> = {
  text: new Set(["pdf", "txt", "doc", "docx", "md"]),
  table: new Set(["xls", "xlsx", "csv"]),
  image: new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp"]),
};

export function parseCozeDatasetType(raw: unknown): CozeDatasetType {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "table" || v === "1") return "table";
  if (v === "image" || v === "photo" || v === "2") return "image";
  return "text";
}

/** 从公司 coze 配置解析知识库列表（兼容旧字段 dataset_id，默认类型 text） */
export function normalizeCozeDatasets(
  coze: Record<string, unknown> | null | undefined
): CozeDataset[] {
  const list: CozeDataset[] = [];
  const seen = new Set<string>();

  const raw = coze?.datasets;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const id = String(row.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const name = String(row.name || "").trim() || id;
      list.push({ id, name, type: parseCozeDatasetType(row.type) });
    }
  }

  const legacy = String(coze?.dataset_id || "").trim();
  if (legacy && !seen.has(legacy)) {
    list.unshift({ id: legacy, name: "默认知识库", type: "text" });
  }

  return list;
}

export function acceptForCozeDatasetType(type: CozeDatasetType): string {
  if (type === "table") {
    return ".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";
  }
  if (type === "image") {
    return ".jpg,.jpeg,.png,.gif,.bmp,.webp,image/jpeg,image/png,image/gif,image/bmp,image/webp";
  }
  return ".pdf,.txt,.doc,.docx,.md,application/pdf,text/plain";
}

/** 知识库上传限制说明（用于知识库页展示） */
export const COZE_UPLOAD_LIMITS: {
  type: CozeDatasetType;
  formats: string;
  maxFiles: string;
  maxSize: string;
  extra?: string;
}[] = [
  {
    type: "text",
    formats: "PDF、TXT、DOC、DOCX、MD",
    maxFiles: "每个知识库最多 300 个文件",
    maxSize: "单文件不超过 100MB；TXT/MD 不超过 5MB",
    extra: "PDF 建议不超过 500 页",
  },
  {
    type: "table",
    formats: "XLS、XLSX、CSV",
    maxFiles: "每个知识库最多 300 个文件",
    maxSize: "单文件不超过 20MB",
    extra:
      "每个表格库一套列结构。本系统每个表格库仅保留一张表存档，再上传会覆盖；不会自动写入知识库",
  },
  {
    type: "image",
    formats: "JPG、JPEG、PNG、GIF、BMP、WEBP",
    maxFiles: "每个知识库最多 300 个文件",
    maxSize: "单文件不超过 20MB",
  },
];

