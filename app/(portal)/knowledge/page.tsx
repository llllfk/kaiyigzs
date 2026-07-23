"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { useUi } from "@/components/ui/Feedback";
import { EMPTY_PAGE_META, type PageMeta } from "@/lib/pagination";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { KnowledgeSkeleton } from "@/components/ui/Skeleton";
import { pageCacheFetchJson, pageCachePeek } from "@/lib/page-cache";
import { useSessionUser } from "@/components/shared/SessionUserContext";
import {
  AiThinkingIndicator,
  formatAiDuration,
} from "@/components/ai/AiThinkingIndicator";
import dynamic from "next/dynamic";

const AiMessageContent = dynamic(
  () =>
    import("@/components/ai/AiMessageContent").then(
      (module) => module.AiMessageContent
    ),
  { ssr: false }
);
import {
  COZE_DATASET_TYPE_LABELS,
  COZE_UPLOAD_LIMITS,
  acceptForCozeDatasetType,
  type CozeDatasetType,
} from "@/lib/coze-datasets";

type Folder = {
  id: number;
  parent_id: number | null;
  name: string;
  file_count?: number;
  child_count?: number;
};
type KbFile = {
  id: number;
  public_id?: string;
  file_name: string;
  size_bytes: number | null;
  uploader_name?: string;
  created_at: string;
  uploader_id: number;
  uri?: string | null;
  coze_document_id?: string | null;
  coze_dataset_id?: string | null;
  coze_sync_status?: string | null;
  coze_sync_error?: string | null;
};

const FOLDERS_URL = "/api/knowledge/folders";

function buildTree(folders: Folder[]) {
  const map = new Map<number | null, Folder[]>();
  for (const f of folders) {
    const key = f.parent_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  return map;
}

export default function KnowledgePage() {
  const me = useSessionUser();
  const ui = useUi();
  const foldersSeed = pageCachePeek<{ data?: Folder[] }>(FOLDERS_URL);
  const [folders, setFolders] = useState<Folder[]>(
    () => foldersSeed?.data || []
  );
  const [files, setFiles] = useState<KbFile[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [fileMeta, setFileMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [filesLoading, setFilesLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(() => !foldersSeed?.data);
  const [activeId, setActiveId] = useState<number | null>(() =>
    foldersSeed?.data?.[0]?.id ?? null
  );
  const [newFolder, setNewFolder] = useState("");
  const [folderOpen, setFolderOpen] = useState(false);
  /** null = create root folder; number = create under that parent */
  const [folderParentId, setFolderParentId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [question, setQuestion] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [qaMessages, setQaMessages] = useState<
    {
      role: "user" | "assistant";
      content: string;
      sources?: { id?: number; file_name: string; snippet?: string }[];
      duration_ms?: number | null;
    }[]
  >([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [qaSessions, setQaSessions] = useState<{ id: number; title: string | null; created_at: string }[]>([]);
  const [qaThinkingStartedAt, setQaThinkingStartedAt] = useState<number | null>(null);
  const [cozeConfigured, setCozeConfigured] = useState(false);
  const [cozeDatasets, setCozeDatasets] = useState<
    { id: string; name: string; type: CozeDatasetType }[]
  >([]);
  const [uploadDatasetId, setUploadDatasetId] = useState("");
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  /** Parent folders that are expanded (show children) */
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const tree = useMemo(() => buildTree(folders), [folders]);
  const folderById = useMemo(() => {
    const m = new Map<number, Folder>();
    for (const f of folders) m.set(f.id, f);
    return m;
  }, [folders]);
  const canManage =
    me?.role === "company_admin" ||
    me?.role === "sales_manager" ||
    Boolean(me?.act_as_company_id);
  const uploadDataset = cozeDatasets.find((d) => d.id === uploadDatasetId);
  const uploadAccept = acceptForCozeDatasetType(uploadDataset?.type || "text");
  const tableUploadBlocked = uploadDataset?.type === "table";

  function toggleExpand(id: number, e?: React.MouseEvent) {
    e?.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAncestors(folderId: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      let cur = folderById.get(folderId);
      while (cur?.parent_id != null) {
        next.add(cur.parent_id);
        cur = folderById.get(cur.parent_id);
      }
      return next;
    });
  }

  async function loadFolders() {
    try {
      const { res: fRes, json: fJson } = await pageCacheFetchJson<{
        data?: Folder[];
        error?: string;
      }>(FOLDERS_URL);
      if (!fRes.ok) setError(fJson.error || "加载目录失败");
      else {
        const rows = fJson.data || [];
        setFolders(rows);
        setActiveId((prev) => prev ?? rows[0]?.id ?? null);
      }
    } finally {
      setPageLoading(false);
    }
  }

  async function loadFiles(
    folderId: number,
    opts?: { page?: number; pageSize?: number; datasetId?: string }
  ) {
    const p = opts?.page ?? page;
    const size = opts?.pageSize ?? pageSize;
    const datasetId = opts?.datasetId ?? uploadDatasetId;
    setFilesLoading(true);
    try {
      const params = new URLSearchParams({
        folder_id: String(folderId),
        page: String(p),
        pageSize: String(size),
      });
      if (datasetId) params.set("dataset_id", datasetId);
      const res = await fetch(`/api/knowledge/files?${params}`);
      const json = await res.json();
      if (!res.ok) setError(json.error || "加载文件失败");
      else {
        if (json.meta) {
          setFileMeta({
            total: json.meta.total,
            page: json.meta.page,
            pageSize: json.meta.pageSize,
            totalPages: json.meta.totalPages,
          });
          if (json.meta.page !== p) setPage(json.meta.page);
          const ds = (json.meta.coze_datasets || []) as {
            id: string;
            name: string;
            type?: CozeDatasetType;
          }[];
          const normalized = ds.map((d) => ({
            id: d.id,
            name: d.name,
            type: (d.type || "text") as CozeDatasetType,
          }));
          setCozeConfigured(Boolean(json.meta.coze_dataset_configured));
          setCozeDatasets(normalized);
          const nextDatasetId =
            datasetId && normalized.some((d) => d.id === datasetId)
              ? datasetId
              : normalized[0]?.id || "";
          // 尚未选定知识库时先写入默认值，由 effect 再按库筛选加载
          if (!datasetId && nextDatasetId && nextDatasetId !== uploadDatasetId) {
            setUploadDatasetId(nextDatasetId);
            setFiles([]);
            return;
          }
          setUploadDatasetId(nextDatasetId);
        }
        setFiles(json.data || []);
      }
    } finally {
      setFilesLoading(false);
    }
  }

  function selectFolder(id: number) {
    expandAncestors(id);
    if ((tree.get(id) || []).length > 0) {
      setExpandedIds((prev) => new Set(prev).add(id));
    }
    if (id === activeId) return;
    setPage(1);
    setActiveId(id);
  }

  useEffect(() => {
    loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId) loadFiles(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, page, pageSize, uploadDatasetId]);

  async function createFolder(e?: React.FormEvent) {
    e?.preventDefault();
    if (!newFolder.trim()) {
      ui.error("请填写目录名称");
      return;
    }
    const formEl =
      e?.currentTarget instanceof HTMLFormElement
        ? e.currentTarget
        : (document.getElementById("kb-folder-form") as HTMLFormElement | null);
    const rawParent = formEl
      ? String(new FormData(formEl).get("parent_id") ?? "root")
      : folderParentId == null
        ? "root"
        : String(folderParentId);
    const parentId =
      rawParent === "root" || rawParent === "" ? null : Number(rawParent);
    if (parentId != null && Number.isNaN(parentId)) {
      ui.error("父目录无效");
      return;
    }

    const res = await fetch("/api/knowledge/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newFolder.trim(),
        parent_id: parentId,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "创建失败");
      ui.error("创建目录失败", json.error);
      return;
    }
    setNewFolder("");
    setFolderOpen(false);
    setFolderParentId(null);
    ui.success(parentId == null ? "根目录已创建" : "子目录已创建");
    if (parentId != null) {
      setExpandedIds((prev) => new Set(prev).add(parentId));
    }
    if (json.data?.id) {
      setActiveId(json.data.id);
      setPage(1);
    }
    await loadFolders();
  }

  function openCreateFolder(parentId: number | null) {
    setFolderParentId(parentId);
    setNewFolder("");
    setFolderOpen(true);
  }

  async function deleteFolder(id: number) {
    const folder = folders.find((f) => f.id === id);
    const fileCount = Number(folder?.file_count || 0);
    const childCount = Number(folder?.child_count || 0);
    if (fileCount > 0) {
      ui.error("无法删除目录", `目录内仍有 ${fileCount} 个文件，请先删除文件后再删目录`);
      return;
    }
    if (childCount > 0) {
      ui.error("无法删除目录", `目录内仍有 ${childCount} 个子目录，请先删除子目录后再删本目录`);
      return;
    }
    const ok = await ui.confirm({
      title: "确认删除目录？",
      description: `将删除空目录「${folder?.name || id}」。此操作不可恢复。`,
      confirmText: "删除目录",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/knowledge/folders?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "删除失败");
      ui.error("删除目录失败", json.error);
      return;
    }
    if (activeId === id) {
      setActiveId(null);
      setPage(1);
    }
    ui.success("目录已删除");
    await loadFolders();
  }

  async function uploadFile(file: File) {
    if (!file || !activeId) return;
    const folder = folders.find((f) => f.id === activeId);
    const target =
      cozeDatasets.find((d) => d.id === uploadDatasetId) || cozeDatasets[0];
    const localOnly = target?.type === "table";

    let replace = false;
    if (localOnly) {
      const existingInView = files.filter(
        (f) =>
          f.coze_sync_status === "local_only" ||
          f.coze_sync_status === "linked_table" ||
          f.coze_sync_status === "mapped" ||
          (!f.coze_document_id &&
            (f.file_name.toLowerCase().endsWith(".xls") ||
              f.file_name.toLowerCase().endsWith(".xlsx") ||
              f.file_name.toLowerCase().endsWith(".csv")))
      );
      const existingName = existingInView[0]?.file_name;
      const ok = await ui.confirm({
        title: existingName ? "确认替换表格存档？" : "确认上传表格存档？",
        description: existingName
          ? `表格知识库「${target?.name || "当前库"}」只能保留一张表。\n继续上传将覆盖已有存档「${existingName}」。\n\n新文件「${file.name}」仅保存在本系统，可下载，不会写入知识库。`
          : `表格知识库「${target?.name || "当前库"}」只能保留一张表；以后再上传会覆盖本文件。\n\n将「${file.name}」保存到目录「${folder?.name || activeId}」（仅本系统存档，可下载，不会写入知识库）。`,
        confirmText: existingName ? "覆盖并上传" : "确认上传",
        danger: Boolean(existingName),
      });
      if (!ok) return;
      replace = Boolean(existingName);
    } else {
      const ok = await ui.confirm({
        title: "确认上传到知识库？",
        description: `将「${file.name}」上传到目录「${folder?.name || activeId}」，并同步到「${
          target?.name || target?.id || "默认知识库"
        }」（${COZE_DATASET_TYPE_LABELS[target?.type || "text"]}）。`,
        confirmText: "确认上传",
      });
      if (!ok) return;
    }

    setUploading(true);
    try {
      const doUpload = async (withReplace: boolean) => {
        const form = new FormData();
        form.set("folder_id", String(activeId));
        form.set("file", file);
        if (uploadDatasetId) form.set("dataset_id", uploadDatasetId);
        if (localOnly) form.set("local_only", "1");
        if (withReplace) form.set("replace", "1");
        return fetch("/api/knowledge/files", { method: "POST", body: form });
      };

      let res = await doUpload(replace);
      let json = await res.json();

      // 其他目录已有存档时，再确认一次覆盖
      if (
        localOnly &&
        res.status === 409 &&
        json.detail?.code === "TABLE_ARCHIVE_EXISTS"
      ) {
        const existName =
          json.detail?.existing?.[0]?.file_name || json.error || "已有存档";
        const okReplace = await ui.confirm({
          title: "确认覆盖已有表格存档？",
          description: `该表格知识库已有存档「${existName}」（可能在其他目录）。每个表格库只能保留一张表，继续将覆盖。`,
          confirmText: "覆盖并上传",
          danger: true,
        });
        if (!okReplace) return;
        res = await doUpload(true);
        json = await res.json();
      }

      if (!res.ok) {
        const detail =
          typeof json.detail === "object" && json.detail?.apiMsg
            ? String(json.detail.apiMsg)
            : typeof json.detail === "string"
              ? json.detail
              : "";
        ui.error(
          "上传失败",
          detail
            ? `${json.error || "上传失败，文件未保存"}\n原始：${detail}`
            : json.error || "上传失败，文件未保存"
        );
        await loadFiles(activeId);
      } else {
        ui.success(
          localOnly || json.meta?.local_only
            ? json.meta?.replaced
              ? "已覆盖并保存"
              : "已保存到本系统"
            : "已上传并同步",
          localOnly
            ? `${file.name}（存档可下载；AI 检索请在知识库后台按列结构导入）`
            : file.name
        );
        setUploadOpen(false);
        await Promise.all([loadFiles(activeId), loadFolders()]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function downloadFile(file: KbFile) {
    if (
      String(file.uri || "").startsWith("kb://") ||
      String(file.uri || "").startsWith("coze://")
    ) {
      ui.error(
        "无法下载",
        "该文件仅存在于知识库，本系统无本地副本。请到知识库后台查看或导出。"
      );
      return;
    }
    try {
      const res = await fetch(`/api/knowledge/files/${file.public_id || file.id}/download`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        ui.error("下载失败", json.error || "请稍后重试");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.file_name || "download";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      ui.error("下载失败", "请稍后重试");
    }
  }

  async function deleteFile(id: number) {
    const file = files.find((f) => f.id === id);
    const ok = await ui.confirm({
      title: "确认删除文件？",
      description: `将删除「${file?.file_name || id}」，此操作不可恢复。`,
      confirmText: "删除文件",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/knowledge/files?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "删除失败");
      ui.error("删除失败", json.error);
    } else {
      ui.success("文件已删除");
      if (activeId) await Promise.all([loadFiles(activeId), loadFolders()]);
      else await loadFolders();
    }
  }

  async function loadQaSessions() {
    const res = await fetch("/api/knowledge/qa");
    const json = await res.json();
    if (res.ok) setQaSessions(json.data || []);
  }

  async function loadQaSession(id: number) {
    const res = await fetch(`/api/knowledge/qa?session_id=${id}`);
    const json = await res.json();
    if (!res.ok) {
      ui.error("加载对话失败", json.error);
      return;
    }
    setSessionId(id);
    setQaMessages(
      (json.data || []).map(
        (m: { role: string; content: string; sources_json?: unknown }) => {
          const meta = m.sources_json as
            | {
                sources?: { id?: number; file_name: string; snippet?: string }[];
                duration_ms?: number;
              }
            | { id?: number; file_name: string; snippet?: string }[]
            | null;
          let sources: { id?: number; file_name: string; snippet?: string }[] = [];
          let duration_ms: number | null = null;
          if (Array.isArray(meta)) sources = meta;
          else if (meta && typeof meta === "object") {
            if (Array.isArray(meta.sources)) sources = meta.sources;
            if (meta.duration_ms) duration_ms = Number(meta.duration_ms);
          }
          return {
            role: m.role as "user" | "assistant",
            content: m.content,
            sources,
            duration_ms,
          };
        }
      )
    );
  }

  useEffect(() => {
    void loadQaSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function askQa(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    const q = question.trim();
    setQaMessages((prev) => [...prev, { role: "user", content: q }]);
    setQuestion("");
    setQaThinkingStartedAt(Date.now());
    setQaLoading(true);
    setError("");
    try {
      const res = await fetch("/api/knowledge/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          folder_id: activeId,
          session_id: sessionId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("问答失败", json.error);
        setQaMessages((prev) => prev.slice(0, -1));
        return;
      }
      setSessionId(json.data.session_id || null);
      setQaMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: json.data.answer || "",
          sources: json.data.sources || [],
          duration_ms: json.data.duration_ms ?? null,
        },
      ]);
      await loadQaSessions();
    } finally {
      setQaLoading(false);
      setQaThinkingStartedAt(null);
    }
  }

  function renderNodes(parentId: number | null, depth = 0): React.ReactNode {
    const nodes = tree.get(parentId) || [];
    return nodes.map((f) => {
      const active = activeId === f.id;
      const childCount = Number(f.child_count ?? (tree.get(f.id) || []).length);
      const fileCount = Number(f.file_count || 0);
      const hasChildren = childCount > 0;
      const canDelete = fileCount === 0 && childCount === 0;
      const expanded = expandedIds.has(f.id);
      return (
        <div key={f.id} className="relative">
          {depth > 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-0 top-0 w-px bg-[var(--color-border)]"
              style={{ left: `${10 + (depth - 1) * 14}px` }}
            />
          )}
          <div
            className={cn(
              "group relative mb-0.5 flex items-center gap-0.5 rounded-lg transition-colors",
              active
                ? "bg-[#eff6ff] text-[var(--color-accent)] shadow-[inset_3px_0_0_var(--color-accent)]"
                : "text-[var(--color-text)] hover:bg-slate-50"
            )}
            style={{ paddingLeft: 4 + depth * 14 }}
          >
            {hasChildren ? (
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-white/80 hover:text-[var(--color-text)]"
                title={expanded ? "收起" : "展开"}
                aria-expanded={expanded}
                aria-label={expanded ? `收起 ${f.name}` : `展开 ${f.name}`}
                onClick={(e) => toggleExpand(f.id, e)}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  className={cn("transition-transform", expanded && "rotate-90")}
                  aria-hidden
                >
                  <path
                    d="M9 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : (
              <span className="inline-block h-7 w-7 shrink-0" aria-hidden />
            )}
            <button
              type="button"
              className="flex min-h-9 min-w-0 flex-1 items-center gap-2 py-1.5 pr-1.5 text-left"
              onClick={() => selectFolder(f.id)}
              onDoubleClick={(e) => {
                if (hasChildren) toggleExpand(f.id, e);
              }}
              title={f.name}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  active ? "bg-white text-[var(--color-accent)]" : "bg-slate-100 text-slate-500"
                )}
                aria-hidden
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3.5 8.5A2.5 2.5 0 0 1 6 6h3.2c.5 0 1 .2 1.3.6L12 8h6a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5v-9Z"
                    fill="currentColor"
                    opacity="0.9"
                  />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm leading-5",
                    active ? "font-semibold" : "font-medium"
                  )}
                >
                  {f.name}
                </span>
                {(hasChildren || fileCount > 0) && (
                  <span className="block text-[10px] leading-4 text-[var(--color-muted)]">
                    {[
                      fileCount > 0 ? `${fileCount} 个文件` : null,
                      hasChildren
                        ? `${childCount} 个子目录${expanded ? "" : " · 已收起"}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </span>
            </button>
            {canManage && (
              <IconButton
                icon="trash"
                label={
                  !canDelete
                    ? fileCount > 0
                      ? `目录内有 ${fileCount} 个文件，请先删除文件`
                      : `目录内有 ${childCount} 个子目录，请先删除子目录`
                    : `删除目录 ${f.name}`
                }
                variant="danger"
                size="sm"
                className={cn(
                  "mr-1 opacity-0 group-hover:opacity-100",
                  !canDelete && "cursor-not-allowed text-slate-300 group-hover:opacity-60",
                  active && canDelete && "opacity-70"
                )}
                onClick={() => {
                  if (!canDelete) {
                    if (fileCount > 0) {
                      ui.error(
                        "无法删除目录",
                        `目录内仍有 ${fileCount} 个文件，请先删除文件后再删目录`
                      );
                    } else {
                      ui.error(
                        "无法删除目录",
                        `目录内仍有 ${childCount} 个子目录，请先删除子目录后再删本目录`
                      );
                    }
                    return;
                  }
                  void deleteFolder(f.id);
                }}
              />
            )}
          </div>
          {hasChildren && expanded && (
            <div className="relative">{renderNodes(f.id, depth + 1)}</div>
          )}
        </div>
      );
    });
  }

  return (
    <div className="flex flex-col gap-4 xl:h-[calc(100dvh-6.5rem)] xl:max-h-[calc(100dvh-6.5rem)] xl:min-h-0 xl:overflow-hidden">
      {pageLoading ? (
        <KnowledgeSkeleton />
      ) : (
      <>
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">知识库</h1>
          <p className="text-sm text-[var(--color-muted)]">
            上传文件会同步到已绑定知识库；目录仅用于本系统分类
            {cozeConfigured
              ? " · 问答走智能体绑定的知识库"
              : " · 尚未配置智能体/知识库（请超管在公司管理中配置）"}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setLimitsOpen(true)}>
          上传限制说明
        </Button>
      </div>

      <Modal
        open={limitsOpen}
        title="知识库上传限制"
        description="上传时请按所选知识库类型遵守以下限制"
        onClose={() => setLimitsOpen(false)}
        size="lg"
        footer={
          <Button type="button" variant="secondary" onClick={() => setLimitsOpen(false)}>
            关闭
          </Button>
        }
      >
        <div className="space-y-3">
          {COZE_UPLOAD_LIMITS.map((item) => (
            <div
              key={item.type}
              className="rounded-lg border border-[var(--color-border)] px-3 py-3"
            >
              <div className="mb-2 text-sm font-semibold">
                {COZE_DATASET_TYPE_LABELS[item.type]}
              </div>
              <ul className="space-y-1 text-sm text-[var(--color-muted)]">
                <li>格式：{item.formats}</li>
                <li>数量：{item.maxFiles}</li>
                <li>大小：{item.maxSize}</li>
                {item.extra ? <li>其他：{item.extra}</li> : null}
              </ul>
            </div>
          ))}
          <p className="text-xs text-[var(--color-muted)]">
            单个知识库文件数接近 300 时，可联系系统管理员创建新知识库。
          </p>
        </div>
      </Modal>

      <Modal
        open={uploadOpen}
        title="上传文件"
        description={`将上传到目录「${
          folders.find((f) => f.id === activeId)?.name || "—"
        }」· 知识库「${
          uploadDataset
            ? `${uploadDataset.name || "未命名知识库"}（${COZE_DATASET_TYPE_LABELS[uploadDataset.type]}）`
            : "—"
        }」`}
        onClose={() => {
          if (!uploading) setUploadOpen(false);
        }}
        size="lg"
        footer={
          <Button
            type="button"
            variant="secondary"
            disabled={uploading}
            onClick={() => setUploadOpen(false)}
          >
            关闭
          </Button>
        }
      >
        <div className="space-y-3">
          {!cozeConfigured ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              尚未配置知识库。请超级管理员在「公司管理 → AI 配置」中添加知识库。
            </div>
          ) : tableUploadBlocked ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              当前为表格知识库：只能上传一张表存档；继续上传将覆盖已有文件。存档仅保存在本系统、可下载，不会写入知识库。
            </div>
          ) : null}
          <FileDropzone
            accept={uploadAccept}
            disabled={uploading || !cozeConfigured || !uploadDatasetId}
            clearAfterSelect
            label={
              tableUploadBlocked ? "点击或拖入表格文件" : "点击或拖入文件上传"
            }
            hint={
              tableUploadBlocked
                ? "支持 xls / xlsx / csv（仅本系统存档）"
                : "选择后将确认并上传到当前目录"
            }
            onFile={(f) => {
              if (f) void uploadFile(f);
            }}
          />
          {uploading && (
            <p className="text-xs text-[var(--color-muted)]">上传中…</p>
          )}
        </div>
      </Modal>

      {error && (
        <div className="shrink-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)_400px] xl:overflow-hidden">
        <aside className="surface flex min-h-0 flex-col overflow-hidden xl:h-full">
          <div className="shrink-0 border-b border-[var(--color-border)] bg-gradient-to-b from-slate-50 to-white px-3 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eff6ff] text-[var(--color-accent)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M3.5 8.5A2.5 2.5 0 0 1 6 6h3.2c.5 0 1 .2 1.3.6L12 8h6a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5v-9Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">目录</div>
                <div className="text-[11px] text-[var(--color-muted)]">
                  {folders.length > 0
                    ? `共 ${folders.length} 个 · 仅 CRM 内分类`
                    : "仅 CRM 内分类，不同步知识库"}
                </div>
              </div>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1 px-2 py-2 max-xl:max-h-[min(18rem,50dvh)]">
            {folders.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] bg-slate-50/70 px-3 py-8 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M3.5 8.5A2.5 2.5 0 0 1 6 6h3.2c.5 0 1 .2 1.3.6L12 8h6a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5v-9Z"
                      fill="currentColor"
                      opacity="0.7"
                    />
                  </svg>
                </span>
                <div className="text-sm font-medium text-[var(--color-text)]">暂无目录</div>
                <div className="text-xs text-[var(--color-muted)]">
                  {canManage ? "可先「新建根目录」" : "请联系管理员创建目录"}
                </div>
              </div>
            ) : (
              <div className="space-y-0.5">{renderNodes(null)}</div>
            )}
          </ScrollArea>
          {canManage && (
            <div className="shrink-0 border-t border-[var(--color-border)] bg-slate-50/50 p-3">
              <div className="flex gap-2">
                <Button
                  className="min-w-0 flex-1"
                  variant="secondary"
                  onClick={() => openCreateFolder(null)}
                >
                  新建根目录
                </Button>
                <Button
                  className="min-w-0 flex-1"
                  variant="secondary"
                  disabled={activeId == null}
                  onClick={() => activeId != null && openCreateFolder(activeId)}
                >
                  新建子目录
                </Button>
              </div>
            </div>
          )}
        </aside>

        <section className="surface flex min-h-0 flex-col overflow-hidden p-4 xl:h-full">
          {!activeId ? (
            <div className="text-sm text-[var(--color-muted)]">请选择左侧目录</div>
          ) : (
            <>
              <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
                <div className="mr-auto min-w-0 font-semibold">
                  当前目录：{folders.find((f) => f.id === activeId)?.name}
                </div>
                {canManage ? (
                  <>
                    {cozeDatasets.length > 0 && (
                      <div className="w-44 sm:w-52">
                        <Select
                          value={uploadDatasetId}
                          onChange={(id) => {
                            if (id === uploadDatasetId) return;
                            setPage(1);
                            setFiles([]);
                            setUploadDatasetId(id);
                          }}
                          options={cozeDatasets.map((d) => ({
                            value: d.id,
                            label: `${d.name || "未命名知识库"}（${COZE_DATASET_TYPE_LABELS[d.type]}）`,
                          }))}
                          placeholder="选择知识库"
                        />
                      </div>
                    )}
                    <Button
                      type="button"
                      disabled={uploading || !cozeConfigured || !uploadDatasetId}
                      onClick={() => setUploadOpen(true)}
                    >
                      上传文件
                    </Button>
                    {uploading && (
                      <span className="text-xs text-[var(--color-muted)]">上传中…</span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-[var(--color-muted)]">
                    仅管理员/经理可上传
                  </span>
                )}
              </div>
              {!canManage ? null : !cozeConfigured ? (
                <div className="mb-3 shrink-0 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  尚未配置知识库。请超级管理员在「公司管理 → AI 配置」中添加知识库。
                </div>
              ) : tableUploadBlocked ? (
                <div className="mb-3 shrink-0 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  当前为表格知识库：只能上传一张表存档；继续上传将覆盖已有文件。存档仅保存在本系统、可下载，不会写入知识库；AI
                  检索依赖知识库后台已导入的数据。可联系系统管理员把文件关联到知识库。
                </div>
              ) : null}
              <ScrollArea className="min-h-0 flex-1 max-xl:max-h-[min(22rem,55dvh)]">
                <ul className="space-y-2">
                  {filesLoading && files.length === 0 && (
                    <li className="text-sm text-[var(--color-muted)]">加载中…</li>
                  )}
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="font-medium">{f.file_name}</div>
                        <div className="text-xs text-[var(--color-muted)]">
                          {f.uploader_name || "—"} ·{" "}
                          {f.size_bytes ? `${Math.round(f.size_bytes / 1024)} KB` : "—"} ·{" "}
                          {new Date(f.created_at).toLocaleString("zh-CN")}
                          {String(f.uri || "").startsWith("kb://") ||
                          String(f.uri || "").startsWith("coze://")
                            ? " · 仅知识库"
                            : f.coze_sync_status === "local_only"
                              ? " · 仅本系统存档"
                              : f.coze_sync_status === "linked_table" ||
                                  f.coze_sync_status === "mapped"
                                ? " · 已关联表格库（存档）"
                              : f.coze_document_id
                                ? " · 已同步"
                                : f.coze_sync_status === "failed"
                                  ? " · 同步失败"
                                  : f.coze_sync_status
                                    ? ` · ${f.coze_sync_status}`
                                    : ""}
                        </div>
                        {f.coze_sync_status === "failed" && f.coze_sync_error ? (
                          <div className="mt-1 break-all text-xs text-red-600">
                            {f.coze_sync_error}
                          </div>
                        ) : f.coze_sync_status === "local_only" ? (
                          <div className="mt-1 text-xs text-amber-700">
                            仅本系统存档，可下载；不会写入表格知识库。可联系系统管理员把文件关联到知识库。
                          </div>
                        ) : f.coze_sync_status === "linked_table" ||
                          f.coze_sync_status === "mapped" ? (
                          <div className="mt-1 text-xs text-emerald-700">
                            已关联到表格知识库（归类用）。本文件仍为存档；AI 检索的是知识库内结构化数据。
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <IconButton
                          icon="download"
                          label="下载"
                          variant="secondary"
                          onClick={() => void downloadFile(f)}
                        />
                        {canManage && (
                          <IconButton
                            icon="trash"
                            label="删除"
                            variant="danger"
                            onClick={() => deleteFile(f.id)}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                  {files.length === 0 && !filesLoading && (
                    <li className="text-sm text-[var(--color-muted)]">该目录暂无文件</li>
                  )}
                </ul>
              </ScrollArea>
              {!filesLoading && (
                <div className="mt-3 shrink-0">
                  <PaginationBar
                    meta={fileMeta}
                    pageSize={pageSize}
                    loading={filesLoading}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(1);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </section>

        <aside className="surface flex min-h-0 flex-col overflow-hidden p-4 xl:h-full">
          <div className="mb-2 shrink-0 space-y-2">
            <div className="font-semibold">知识库问答</div>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  value={sessionId ? String(sessionId) : ""}
                  onChange={(v) => {
                    if (!v) {
                      setSessionId(null);
                      setQaMessages([]);
                      setQuestion("");
                      return;
                    }
                    void loadQaSession(Number(v));
                  }}
                  options={[
                    { value: "", label: sessionId ? "当前对话" : "新对话" },
                    ...qaSessions.slice(0, 20).map((s) => {
                      const when = new Date(s.created_at).toLocaleString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      return {
                        value: String(s.id),
                        label: `${when} · ${(s.title || "未命名").slice(0, 24)}`,
                      };
                    }),
                  ]}
                  placeholder="对话记录"
                  className="w-full"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="min-h-9 shrink-0 px-3 text-xs"
                onClick={() => {
                  setSessionId(null);
                  setQaMessages([]);
                  setQuestion("");
                }}
              >
                新对话
              </Button>
            </div>
          </div>
          <p className="mb-2 shrink-0 text-xs text-[var(--color-muted)]">
            {cozeConfigured
              ? "由智能体检索已绑定知识库回答；对话会自动保存"
              : "未配置智能体时，临时读取本目录文本文件回答；对话会自动保存"}
          </p>
          <div className="mb-3 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-slate-50/60 p-2 max-xl:min-h-[12rem] max-xl:max-h-[min(18rem,45dvh)]">
            {qaMessages.length === 0 && !qaLoading && (
              <div className="p-1 text-xs text-[var(--color-muted)]">暂无对话，先提一个问题吧</div>
            )}
            {qaMessages.map((m, i) => (
              <div key={`${m.role}-${i}`} className={cn(m.role === "user" ? "ml-4" : "mr-4")}>
                <div
                  className={cn(
                    "rounded-lg px-2 py-1.5 text-sm",
                    m.role === "user"
                      ? "bg-[var(--color-accent)] text-white whitespace-pre-wrap"
                      : "border border-[var(--color-border)] bg-white"
                  )}
                >
                  {m.role === "user" ? (
                    m.content
                  ) : (
                    <AiMessageContent content={m.content} />
                  )}
                  {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-t border-[var(--color-border)] pt-2">
                      <div className="text-[10px] font-medium tracking-wide text-[var(--color-muted)]">
                        参考来源
                      </div>
                      {m.sources.map((s, si) => (
                        <div
                          key={`${s.file_name}-${si}`}
                          className="rounded-md bg-slate-50 px-2 py-1.5 text-[11px] leading-relaxed"
                        >
                          <div className="font-medium text-slate-700">{s.file_name}</div>
                          {s.snippet ? (
                            <p className="mt-0.5 text-[var(--color-muted)]">
                              “{s.snippet}”
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {m.role === "assistant" && m.duration_ms != null && m.duration_ms > 0 && (
                  <div className="mt-0.5 px-1 text-[10px] tabular-nums text-[var(--color-muted)]">
                    用时 {formatAiDuration(m.duration_ms)}
                  </div>
                )}
              </div>
            ))}
            {qaLoading && (
              <AiThinkingIndicator
                className="mr-0 max-w-full"
                hints={["检索知识库", "整理参考资料", "生成回答"]}
                startedAt={qaThinkingStartedAt ?? undefined}
              />
            )}
          </div>
          <form onSubmit={askQa} className="shrink-0 space-y-2">
            <textarea
              className="input textarea max-h-28"
              placeholder="例如：客户嫌贵怎么回？"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={qaLoading}>
              {qaLoading ? "思考中…" : "提问"}
            </Button>
          </form>
        </aside>
      </div>

      <Modal
        open={folderOpen}
        title="新建目录"
        description="请确认创建位置：根目录为一级；选中某个目录则为子目录"
        onClose={() => {
          setFolderOpen(false);
          setFolderParentId(null);
          setNewFolder("");
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFolderOpen(false);
                setFolderParentId(null);
                setNewFolder("");
              }}
            >
              取消
            </Button>
            <Button type="submit" form="kb-folder-form">
              创建目录
            </Button>
          </>
        }
      >
        <form id="kb-folder-form" onSubmit={createFolder} className="space-y-3">
          <div className="field">
            <label>创建位置</label>
            <Select
              value={folderParentId == null ? "root" : String(folderParentId)}
              onChange={(v) => {
                setFolderParentId(v === "root" || !v ? null : Number(v));
              }}
              options={[
                { value: "root", label: "根目录（一级目录）" },
                ...folders.map((f) => ({
                  value: String(f.id),
                  label:
                    f.parent_id == null
                      ? f.name
                      : `${folders.find((p) => p.id === f.parent_id)?.name || "…"} / ${f.name}`,
                })),
              ]}
              placeholder="选择挂载位置"
              className="w-full"
            />
            <input
              type="hidden"
              name="parent_id"
              value={folderParentId == null ? "root" : String(folderParentId)}
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {folderParentId == null
                ? "将创建与现有根目录同级的一级目录"
                : `将创建在「${folders.find((f) => f.id === folderParentId)?.name || "所选目录"}」之下`}
            </p>
          </div>
          <div className="field">
            <label>目录名称</label>
            <input
              className="input"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              placeholder="例如：话术库"
              required
            />
          </div>
        </form>
      </Modal>
      </>
      )}
    </div>
  );
}
