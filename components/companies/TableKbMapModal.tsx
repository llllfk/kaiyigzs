"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useUi } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";

type TableDataset = { id: string; name: string; type: string };

type LocalFile = {
  id: number;
  file_name: string;
  folder_name: string | null;
  size_bytes: number | null;
  coze_dataset_id: string | null;
  coze_sync_status: string | null;
};

type Props = {
  open: boolean;
  companyId: number | string;
  companyName: string;
  onClose: () => void;
};

export function TableKbMapModal({ open, companyId, companyName, onClose }: Props) {
  const ui = useUi();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [tableDatasets, setTableDatasets] = useState<TableDataset[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/kb-table-map`);
      const json = await res.json();
      if (!res.ok) {
        ui.error("加载失败", json.error);
        return;
      }
      setLocalFiles(json.data?.local_files || []);
      const ds = (json.data?.table_datasets || []) as TableDataset[];
      setTableDatasets(ds);
      setDatasetId((prev) =>
        prev && ds.some((d) => d.id === prev) ? prev : ds[0]?.id || ""
      );
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [companyId, ui]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function linkSelected() {
    if (!datasetId || selectedIds.size === 0) {
      ui.error("请选择表格知识库，并勾选至少一个系统文件");
      return;
    }
    setSaving(true);
    try {
      let okCount = 0;
      for (const fileId of selectedIds) {
        const res = await fetch(`/api/companies/${companyId}/kb-table-map`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "link",
            file_id: fileId,
            dataset_id: datasetId,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("关联失败", json.error);
          return;
        }
        okCount += 1;
      }
      ui.success("已关联到表格知识库", `${okCount} 个文件`);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function unlinkFile(fileId: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/kb-table-map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink", file_id: fileId }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("解除失败", json.error);
        return;
      }
      ui.success("已解除关联");
      await load();
    } finally {
      setSaving(false);
    }
  }

  const dsName = (id: string | null) =>
    tableDatasets.find((d) => d.id === id)?.name || id || "—";

  return (
    <Modal
      open={open}
      title={`表格库关联 · ${companyName}`}
      description="表格知识库是「一种列结构 + 多行数据」，不是一个文件对应一条知识。AI 检索的是知识库里已导入的结构化数据；本系统文件只作存档/下载，可关联到对应表格库便于归类。"
      onClose={() => {
        if (saving) return;
        onClose();
      }}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
            关闭
          </Button>
          <Button
            type="button"
            disabled={saving || loading || !datasetId || selectedIds.size === 0}
            onClick={() => void linkSelected()}
          >
            {saving ? "保存中…" : "关联到所选表格库"}
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-[var(--color-muted)]">加载中…</p>
      ) : tableDatasets.length === 0 ? (
        <p className="text-sm text-amber-800">
          请先在「AI 配置」中为该公司添加表格知识库，并在知识库后台建好列结构、导入行数据（AI
          才能检索）。
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-[var(--color-muted)]">
            <p>
              1. 在知识库后台为表格库定义列结构，再按该结构导入/追加数据（AI
              检索靠这里）。
            </p>
            <p>2. 本系统可上传 Excel/CSV 作存档下载，不会自动写入知识库。</p>
            <p>3. 下方勾选存档文件并关联到对应表格库，仅用于归类展示。</p>
          </div>

          <div className="w-64">
            <label className="mb-1 block text-sm font-medium">关联到表格知识库</label>
            <Select
              value={datasetId}
              onChange={setDatasetId}
              options={tableDatasets.map((d) => ({
                value: d.id,
                label: d.name || d.id,
              }))}
              placeholder="选择表格知识库"
            />
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">本系统表格存档</div>
            <ul className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-border)] p-2">
              {localFiles.length === 0 && (
                <li className="px-2 py-3 text-xs text-[var(--color-muted)]">
                  暂无表格文件。请先在知识库页上传 Excel/CSV（仅本系统）。
                </li>
              )}
              {localFiles.map((f) => {
                const linked =
                  f.coze_sync_status === "linked_table" ||
                  f.coze_sync_status === "mapped";
                const checked = selectedIds.has(f.id);
                return (
                  <li
                    key={f.id}
                    className={cn(
                      "flex items-start gap-2 rounded-md px-2 py-2",
                      checked && "bg-[#eff6ff]"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      disabled={saving}
                      onChange={() => toggle(f.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{f.file_name}</div>
                      <div className="text-[11px] text-[var(--color-muted)]">
                        {f.folder_name || "未分类"}
                        {linked
                          ? ` · 已关联「${dsName(f.coze_dataset_id)}」`
                          : " · 未关联"}
                      </div>
                    </div>
                    {linked && (
                      <Button
                        variant="secondary"
                        className="h-7 shrink-0 text-xs"
                        disabled={saving}
                        onClick={() => void unlinkFile(f.id)}
                      >
                        解除
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
