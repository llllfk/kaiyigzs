"use client";

import { Button } from "@/components/ui/Button";
import {
  COZE_DATASET_TYPE_LABELS,
  type CozeDatasetType,
} from "@/lib/coze-datasets";

export type DatasetFormRow = {
  id: string;
  name: string;
  type: CozeDatasetType;
};

const TYPES: CozeDatasetType[] = ["text", "table", "image"];

const PLACEHOLDERS: Record<CozeDatasetType, { name: string; id: string }> = {
  text: { name: "如产品手册", id: "知识库 ID" },
  table: { name: "如产品目录表", id: "表格知识库 ID" },
  image: { name: "如产品实拍图", id: "图片知识库 ID" },
};

type Props = {
  value: DatasetFormRow[];
  onChange: (next: DatasetFormRow[]) => void;
};

export function CozeDatasetsEditor({ value, onChange }: Props) {
  function add(type: CozeDatasetType) {
    onChange([...value, { id: "", name: "", type }]);
  }

  function update(index: number, patch: Partial<DatasetFormRow>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {TYPES.map((type) => {
        const rows = value
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => row.type === type);
        const label = COZE_DATASET_TYPE_LABELS[type];
        const ph = PLACEHOLDERS[type];
        return (
          <div key={type} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium">{label}（可多个）</label>
              <Button
                type="button"
                variant="secondary"
                className="min-h-8 px-2 text-xs"
                onClick={() => add(type)}
              >
                添加
              </Button>
            </div>
            {rows.length === 0 && (
              <p className="text-xs text-[var(--color-muted)]">暂未添加</p>
            )}
            {rows.map(({ row, index }) => (
              <div
                key={`${type}-${index}`}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_auto]"
              >
                <input
                  className="input"
                  placeholder={ph.name}
                  value={row.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                />
                <input
                  className="input"
                  placeholder={ph.id}
                  value={row.id}
                  onChange={(e) => update(index, { id: e.target.value })}
                />
                <Button
                  type="button"
                  variant="danger"
                  className="min-h-9"
                  onClick={() => remove(index)}
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
        );
      })}
      {value.length === 0 && (
        <p className="text-xs text-[var(--color-muted)]">
          未添加时将使用系统默认知识库
        </p>
      )}
    </div>
  );
}

export function datasetsFromCompanyConfig(coze?: {
  dataset_id?: string;
  datasets?: { id?: string; name?: string; type?: string }[];
}): DatasetFormRow[] {
  const list = coze?.datasets;
  if (Array.isArray(list) && list.length > 0) {
    return list.map((d) => {
      const t = String(d.type || "text").toLowerCase();
      const type: CozeDatasetType =
        t === "table" ? "table" : t === "image" || t === "photo" ? "image" : "text";
      return {
        id: String(d.id || "").trim(),
        name: String(d.name || d.id || "").trim(),
        type,
      };
    });
  }
  const legacy = coze?.dataset_id;
  if (legacy) return [{ id: legacy, name: "默认知识库", type: "text" }];
  return [];
}

export function summarizeDatasets(rows: DatasetFormRow[]) {
  if (rows.length === 0) return "用默认";
  const counts = { text: 0, table: 0, image: 0 };
  for (const r of rows) counts[r.type] += 1;
  const parts: string[] = [];
  if (counts.text) parts.push(`文本${counts.text}`);
  if (counts.table) parts.push(`表格${counts.table}`);
  if (counts.image) parts.push(`图片${counts.image}`);
  return parts.join(" · ") || `${rows.length} 个`;
}
