"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { Modal } from "@/components/ui/Modal";
import { useUi } from "@/components/ui/Feedback";
import { CardListSkeleton } from "@/components/ui/Skeleton";
import { EMPTY_PAGE_META, type PageMeta } from "@/lib/pagination";
import { pageCacheFetchJson, pageCachePeek } from "@/lib/page-cache";

type Competitor = {
  id: number;
  name: string;
  summary: string | null;
  strengths: string | null;
  weaknesses: string | null;
  playbook: string | null;
  mention_count?: number;
};

const COMPETITORS_SEED_URL = "/api/competitors?page=1&pageSize=10";

export default function CompetitorsPage() {
  const ui = useUi();
  const seed = pageCachePeek<{ data?: Competitor[]; meta?: PageMeta }>(COMPETITORS_SEED_URL);
  const [list, setList] = useState<Competitor[]>(() => seed?.data || []);
  const [loading, setLoading] = useState(() => seed == null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PageMeta>(seed?.meta || EMPTY_PAGE_META);
  const hasRowsRef = useRef((seed?.data?.length || 0) > 0);
  hasRowsRef.current = list.length > 0;
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<Competitor | null>(null);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [playbook, setPlaybook] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(
    async (opts?: { keyword?: string; page?: number; pageSize?: number; force?: boolean }) => {
      const keyword = opts?.keyword ?? q;
      const p = opts?.page ?? page;
      const size = opts?.pageSize ?? pageSize;
      const force = opts?.force === true;
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(size),
      });
      if (keyword.trim()) params.set("q", keyword.trim());
      const url = `/api/competitors?${params}`;
      const cached = pageCachePeek<{ data?: Competitor[]; meta?: PageMeta }>(url);
      if (!force && cached?.data) {
        setList(cached.data);
        if (cached.meta) setMeta(cached.meta);
        setLoading(false);
        return;
      }
      if (cached?.data) {
        setList(cached.data);
        if (cached.meta) setMeta(cached.meta);
      }
      const soft = hasRowsRef.current || Boolean(cached?.data);
      if (!soft) setLoading(true);
      try {
        const { res, json } = await pageCacheFetchJson<{
          data?: Competitor[];
          meta?: PageMeta;
          error?: string;
        }>(url, { force });
        if (!res.ok) ui.error("加载竞品失败", json.error);
        else {
          setList(json.data || []);
          if (json.meta) {
            setMeta(json.meta);
            if (json.meta.page !== p) setPage(json.meta.page);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, q, ui]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  function onSearch() {
    if (page === 1) void load({ keyword: q, page: 1, force: true });
    else setPage(1);
  }

  function openCreate() {
    setEditItem(null);
    setName("");
    setSummary("");
    setStrengths("");
    setWeaknesses("");
    setPlaybook("");
    setOpen(true);
  }

  function openEdit(c: Competitor) {
    setEditItem(c);
    setName(c.name);
    setSummary(c.summary || "");
    setStrengths(c.strengths || "");
    setWeaknesses(c.weaknesses || "");
    setPlaybook(c.playbook || "");
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      ui.error("请填写竞品名称");
      return;
    }
    const isEdit = Boolean(editItem);
    const ok = await ui.confirm({
      title: isEdit ? "确认保存竞品？" : "确认添加竞品？",
      description: isEdit
        ? `将更新竞品「${name.trim()}」。`
        : `将新增竞品「${name.trim()}」到公司竞品库。`,
      confirmText: isEdit ? "确认保存" : "确认添加",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        summary: summary.trim() || null,
        strengths: strengths.trim() || null,
        weaknesses: weaknesses.trim() || null,
        playbook: playbook.trim() || null,
      };
      if (isEdit && editItem) {
        const res = await fetch("/api/competitors", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editItem.id, ...payload }),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("保存失败", json.error);
          return;
        }
        ui.success("竞品已更新", name.trim());
      } else {
        const res = await fetch("/api/competitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) {
          ui.error("创建失败", json.error);
          return;
        }
        ui.success("竞品已添加", name.trim());
      }
      setOpen(false);
      setEditItem(null);
      if (isEdit) await load({ force: true });
      else if (page === 1) await load({ page: 1, force: true });
      else setPage(1);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(c: Competitor) {
    const ok = await ui.confirm({
      title: "确认删除竞品？",
      description: `将删除「${c.name}」及其相关统计展示。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/competitors?id=${c.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) ui.error("删除失败", json.error);
    else {
      ui.success("竞品已删除");
      await load({ force: true });
    }
  }

  async function generatePlaybook() {
    if (!name.trim()) {
      ui.error("请先填写竞品名称");
      return;
    }
    if (playbook.trim()) {
      const ok = await ui.confirm({
        title: "用 AI 重新生成话术？",
        description: "将覆盖当前「应对话术」内容。",
        confirmText: "重新生成",
      });
      if (!ok) return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/competitors/generate-playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          summary: summary.trim(),
          strengths: strengths.trim(),
          weaknesses: weaknesses.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("生成失败", json.error);
        return;
      }
      setPlaybook(String(json.data?.playbook || ""));
      ui.success("话术已生成", "可再手工微调后保存");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">竞品库</h1>
          <p className="text-sm text-[var(--color-muted)]">
            可手工维护；AI 解析沟通记录时也会自动抽取并沉淀草稿
          </p>
        </div>
        <Button onClick={openCreate}>添加竞品</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-72 max-w-full shrink-0">
          <input
            className={`input ${q ? "pr-9" : ""}`}
            placeholder="搜索竞品名 / 简介 / 话术"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
          />
          {q ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]"
              aria-label="清除搜索"
              title="清除"
              onClick={() => {
                setQ("");
                if (page === 1) void load({ keyword: "", page: 1, force: true });
                else setPage(1);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6l12 12M18 6 6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
        <Button variant="secondary" onClick={onSearch}>
          搜索
        </Button>
      </div>

      <Modal
        open={open}
        title={editItem ? "编辑竞品" : "添加竞品"}
        description="维护竞品基础信息与应对话术"
        onClose={() => {
          setOpen(false);
          setEditItem(null);
        }}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setEditItem(null);
              }}
            >
              取消
            </Button>
            <Button type="submit" form="competitor-form" disabled={submitting}>
              {submitting
                ? editItem
                  ? "保存中…"
                  : "提交中…"
                : editItem
                  ? "保存"
                  : "添加竞品"}
            </Button>
          </>
        }
      >
        <form id="competitor-form" onSubmit={save} className="space-y-3">
          <div className="field">
            <label>竞品名称</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>简介</label>
            <input
              className="input"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field">
              <label>优势</label>
              <textarea
                className="input textarea"
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                placeholder="对方相对强的地方"
              />
            </div>
            <div className="field">
              <label>劣势</label>
              <textarea
                className="input textarea"
                value={weaknesses}
                onChange={(e) => setWeaknesses(e.target.value)}
                placeholder="可攻破的点"
              />
            </div>
          </div>
          <div className="field">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="!mb-0">应对话术</label>
              <Button
                type="button"
                variant="secondary"
                disabled={generating || submitting || !name.trim()}
                onClick={() => void generatePlaybook()}
              >
                {generating ? "生成中…" : "AI 生成话术"}
              </Button>
            </div>
            <textarea
              className="input textarea"
              value={playbook}
              onChange={(e) => setPlaybook(e.target.value)}
              placeholder="可先填优势/劣势，再点 AI 生成；生成后可继续改"
            />
          </div>
        </form>
      </Modal>

      <div className="grid gap-3 md:grid-cols-2">
        {loading && list.length === 0 && (
          <CardListSkeleton count={4} className="md:col-span-2 md:grid-cols-2" />
        )}
        {list.length === 0 && !loading && (
          <div className="text-sm text-[var(--color-muted)] md:col-span-2">
            暂无竞品
          </div>
        )}
        {list.map((c) => (
            <div key={c.id} className="surface card-interactive relative p-4">
              <div className="flex items-start justify-between gap-3 pr-16">
                <div className="min-w-0">
                  <div className="font-semibold">{c.name}</div>
                  <div className="mt-1 text-xs text-[var(--color-muted)]">
                    提及 {c.mention_count || 0} 次
                  </div>
                </div>
                <div className="card-actions flex items-center gap-1.5">
                  <IconButton
                    icon="pencil"
                    label="编辑"
                    variant="secondary"
                    onClick={() => openEdit(c)}
                  />
                  <IconButton
                    icon="trash"
                    label="删除"
                    variant="danger"
                    onClick={() => void remove(c)}
                  />
                </div>
              </div>
              {c.summary && <p className="mt-2 text-sm">{c.summary}</p>}
              {(c.strengths || c.weaknesses) && (
                <div className="mt-2 grid gap-1 text-xs text-[var(--color-muted)] sm:grid-cols-2">
                  {c.strengths ? <p>优势：{c.strengths}</p> : null}
                  {c.weaknesses ? <p>劣势：{c.weaknesses}</p> : null}
                </div>
              )}
              {c.playbook && (
                <p className="mt-2 line-clamp-2 text-sm text-[var(--color-muted)]">
                  话术：{c.playbook}
                </p>
              )}
            </div>
          ))}
      </div>

      {!loading && (
        <PaginationBar
          meta={meta}
          pageSize={pageSize}
          loading={loading}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
