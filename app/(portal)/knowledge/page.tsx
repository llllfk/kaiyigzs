"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { cn } from "@/lib/utils";

type Folder = {
  id: number;
  parent_id: number | null;
  name: string;
};
type KbFile = {
  id: number;
  file_name: string;
  size_bytes: number | null;
  uploader_name?: string;
  created_at: string;
  uploader_id: number;
};

type Me = { id: number; role: string };

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
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<KbFile[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [question, setQuestion] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [qaAnswer, setQaAnswer] = useState("");
  const [qaSources, setQaSources] = useState<{ id: number; file_name: string }[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);

  const tree = useMemo(() => buildTree(folders), [folders]);
  const canManage =
    me?.role === "company_admin" || me?.role === "sales_manager";

  async function loadFolders() {
    const [fRes, meRes] = await Promise.all([
      fetch("/api/knowledge/folders"),
      fetch("/api/auth/me"),
    ]);
    const fJson = await fRes.json();
    const meJson = await meRes.json();
    if (!fRes.ok) setError(fJson.error || "加载目录失败");
    else {
      setFolders(fJson.data || []);
      if (!activeId && fJson.data?.[0]) setActiveId(fJson.data[0].id);
    }
    if (meRes.ok) setMe(meJson.data);
  }

  async function loadFiles(folderId: number) {
    const res = await fetch(`/api/knowledge/files?folder_id=${folderId}`);
    const json = await res.json();
    if (!res.ok) setError(json.error || "加载文件失败");
    else setFiles(json.data || []);
  }

  useEffect(() => {
    loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId) loadFiles(activeId);
  }, [activeId]);

  async function createFolder() {
    if (!newFolder.trim()) return;
    const res = await fetch("/api/knowledge/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolder, parent_id: activeId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "创建失败");
      return;
    }
    setNewFolder("");
    await loadFolders();
  }

  async function deleteFolder(id: number) {
    const res = await fetch(`/api/knowledge/folders?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "删除失败");
      return;
    }
    if (activeId === id) setActiveId(null);
    await loadFolders();
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("folder_id", String(activeId));
      form.set("file", file);
      const res = await fetch("/api/knowledge/files", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) setError(json.error || "上传失败");
      else await loadFiles(activeId);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function deleteFile(id: number) {
    const res = await fetch(`/api/knowledge/files?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) setError(json.error || "删除失败");
    else if (activeId) await loadFiles(activeId);
  }

  async function askQa(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setQaLoading(true);
    setError("");
    try {
      const res = await fetch("/api/knowledge/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          folder_id: activeId,
          session_id: sessionId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "问答失败");
        return;
      }
      setQaAnswer(json.data.answer || "");
      setQaSources(json.data.sources || []);
      setSessionId(json.data.session_id || null);
    } finally {
      setQaLoading(false);
    }
  }

  function renderNodes(parentId: number | null, depth = 0): React.ReactNode {
    const nodes = tree.get(parentId) || [];
    return nodes.map((f) => (
      <div key={f.id}>
        <div
          className={cn(
            "flex items-center gap-1 rounded-lg px-2 py-2 text-sm hover:bg-[#eff6ff]",
            activeId === f.id && "bg-[#eff6ff] font-semibold text-[var(--color-accent)]"
          )}
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          <button
            type="button"
            className="min-h-10 flex-1 text-left"
            onClick={() => setActiveId(f.id)}
          >
            {f.name}
          </button>
          {canManage && (
            <button
              type="button"
              className="text-xs text-red-500 px-2"
              onClick={() => deleteFolder(f.id)}
            >
              删
            </button>
          )}
        </div>
        {renderNodes(f.id, depth + 1)}
      </div>
    ));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">知识库</h1>
        <p className="text-sm text-[var(--color-muted)]">
          管理员/经理维护目录，全员可上传下载
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_1fr_320px]">
        <aside className="surface p-3">
          <div className="mb-2 text-sm font-semibold">目录</div>
          <ScrollArea className="max-h-[50vh] lg:max-h-[60vh]">
            {folders.length === 0 && (
              <div className="px-2 py-3 text-sm text-[var(--color-muted)]">暂无目录</div>
            )}
            {renderNodes(null)}
          </ScrollArea>
          {canManage && (
            <div className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
              <input
                className="input"
                placeholder={activeId ? "在当前目录下新建" : "新建根目录"}
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
              />
              <Button className="w-full" variant="secondary" onClick={createFolder}>
                新建目录
              </Button>
            </div>
          )}
        </aside>

        <section className="surface p-4">
          {!activeId ? (
            <div className="text-sm text-[var(--color-muted)]">请选择左侧目录</div>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-semibold">
                  当前目录：{folders.find((f) => f.id === activeId)?.name}
                </div>
                <label className="btn btn-primary cursor-pointer">
                  {uploading ? "上传中…" : "上传文件"}
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploading}
                    onChange={uploadFile}
                  />
                </label>
              </div>
              <ul className="space-y-2">
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
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a
                        className="btn btn-secondary"
                        href={`/api/knowledge/files/${f.id}/download`}
                      >
                        下载
                      </a>
                      {(me?.id === f.uploader_id || canManage) && (
                        <Button variant="danger" onClick={() => deleteFile(f.id)}>
                          删除
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
                {files.length === 0 && (
                  <li className="text-sm text-[var(--color-muted)]">该目录暂无文件</li>
                )}
              </ul>
            </>
          )}
        </section>

        <aside className="surface flex flex-col p-4">
          <div className="mb-2 font-semibold">知识库问答</div>
          <p className="mb-3 text-xs text-[var(--color-muted)]">
            基于当前目录文本文件回答（txt/md/csv）
          </p>
          <form onSubmit={askQa} className="space-y-2">
            <textarea
              className="input textarea"
              placeholder="例如：客户嫌贵怎么回？"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={qaLoading}>
              {qaLoading ? "思考中…" : "提问"}
            </Button>
          </form>
          {qaAnswer && (
            <div className="mt-3 flex-1 overflow-auto rounded-lg border border-[var(--color-border)] bg-slate-50 p-3 text-sm whitespace-pre-wrap">
              {qaAnswer}
              {qaSources.length > 0 && (
                <div className="mt-3 border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-muted)]">
                  来源：{qaSources.map((s) => s.file_name).join("、")}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
