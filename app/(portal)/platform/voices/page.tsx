"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useUi } from "@/components/ui/Feedback";
import { CardListSkeleton } from "@/components/ui/Skeleton";
import { useAppRouter } from "@/hooks/useAppRouter";
import { VOICE_TRAINING_TIMES_LIMIT } from "@/lib/voice-constants";
import { formatDateTime, formatSynthDurationSec } from "@/lib/utils";
import { downloadExport, exportStamp } from "@/lib/download-export";

type CompanyOpt = {
  id: number;
  name: string;
  voice_clone_slots: number;
  /** 已分配合成分钟 */
  synth_minutes_quota: number;
  /** 已使用合成分钟（复刻+官方） */
  synth_used_minutes: number;
};

type VoiceRow = {
  id: number;
  company_id: number;
  company_name?: string;
  name: string;
  slot_index: number;
  provider_speaker_id?: string | null;
  status: string;
  error_message?: string | null;
  available_training_times?: number | null;
  volc_state?: string | null;
  meta?: {
    order_id?: string;
    note?: string;
    available_training_times?: number | null;
  };
  creator_name?: string | null;
  updated_at?: string;
  synth_total?: number;
  synth_success?: number;
  synth_failed?: number;
  synth_saved?: number;
  /** 仅成功合成累计时长（秒） */
  synth_success_duration_sec?: number;
};

type OfficialVoiceItem = {
  speakerId: string;
  name: string;
  gender: "female" | "male";
  hint?: string;
  enabled: boolean;
};

type CompanyOfficialRow = {
  speaker_id: string;
  name: string;
  gender?: string | null;
  hint?: string | null;
  synth_total: number;
  synth_success: number;
  synth_failed: number;
  synth_saved: number;
  synth_success_duration_sec: number;
};

type UsageLogItem = {
  id: number;
  company_name?: string | null;
  user_name?: string | null;
  source_label: string;
  status: string;
  error_message?: string | null;
  text_content: string;
  text_char_count: number;
  context_text?: string | null;
  duration_sec?: number | null;
  saved: boolean;
  created_at: string;
  icl_model_type?: number | null;
  speaker_label?: string | null;
};

type UsageStats = {
  total: number;
  success: number;
  failed: number;
  saved: number;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "待公司上传",
  training: "训练中",
  ready: "可用",
  failed: "训练失败",
};

export default function PlatformVoicesPage() {
  const ui = useUi();
  const router = useAppRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<VoiceRow[]>([]);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [volcRaw, setVolcRaw] = useState<unknown>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [assignName, setAssignName] = useState("公司音色");
  const [assignSpeakerId, setAssignSpeakerId] = useState("");
  const [assignNote, setAssignNote] = useState("");

  const [edit, setEdit] = useState<VoiceRow | null>(null);
  const [speakerId, setSpeakerId] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [syncing, setSyncing] = useState(false);

  const [officialItems, setOfficialItems] = useState<OfficialVoiceItem[]>([]);
  const [officialDraft, setOfficialDraft] = useState<Set<string>>(new Set());
  const [officialLoading, setOfficialLoading] = useState(true);
  const [officialSaving, setOfficialSaving] = useState(false);
  const [officialPreviewId, setOfficialPreviewId] = useState<string | null>(
    null
  );
  const [officialPreviewUrl, setOfficialPreviewUrl] = useState<string | null>(
    null
  );
  const [officialPreviewLoading, setOfficialPreviewLoading] = useState(false);
  const [officialSettingsOpen, setOfficialSettingsOpen] = useState(false);

  const [usageOpen, setUsageOpen] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageTitle, setUsageTitle] = useState("");
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [usageItems, setUsageItems] = useState<UsageLogItem[]>([]);
  const [usageQuery, setUsageQuery] = useState("");
  const [usagePage, setUsagePage] = useState(1);
  const [usageTotalPages, setUsageTotalPages] = useState(1);
  const [usageExporting, setUsageExporting] = useState(false);

  /** 选中公司后，下方表格只展示该公司复刻 + 用过的官方音色 */
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
    null
  );
  const [companyOfficial, setCompanyOfficial] = useState<CompanyOfficialRow[]>(
    []
  );
  const [companyOfficialLoading, setCompanyOfficialLoading] = useState(false);

  const usedByCompany = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of items) {
      const cid = Number(row.company_id);
      if (!cid) continue;
      map.set(cid, (map.get(cid) || 0) + 1);
    }
    return map;
  }, [items]);

  const assignableCompanies = useMemo(() => {
    return companies.filter((c) => {
      const cid = Number(c.id);
      const slots = Number(c.voice_clone_slots) || 0;
      if (!cid || slots <= 0) return false;
      return (usedByCompany.get(cid) || 0) < slots;
    });
  }, [companies, usedByCompany]);

  const selectedCompany = useMemo(
    () =>
      selectedCompanyId
        ? companies.find((c) => Number(c.id) === selectedCompanyId) || null
        : null,
    [companies, selectedCompanyId]
  );

  const filteredCloneItems = useMemo(() => {
    if (!selectedCompanyId) return items;
    return items.filter((r) => Number(r.company_id) === selectedCompanyId);
  }, [items, selectedCompanyId]);

  const loadCompanyOfficial = useCallback(
    async (companyId: number) => {
      setCompanyOfficialLoading(true);
      try {
        const res = await fetch(
          `/api/platform/voice-usage?company_id=${companyId}`
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          ui.error("加载公司官方音色失败", json.error);
          setCompanyOfficial([]);
          return;
        }
        setCompanyOfficial(
          Array.isArray(json.data?.official) ? json.data.official : []
        );
      } finally {
        setCompanyOfficialLoading(false);
      }
    },
    [ui]
  );

  function selectCompany(id: number) {
    if (selectedCompanyId === id) {
      setSelectedCompanyId(null);
      setCompanyOfficial([]);
      return;
    }
    setSelectedCompanyId(id);
    void loadCompanyOfficial(id);
  }

  const load = useCallback(
    async (sync = false) => {
      if (sync) setSyncing(true);
      else setLoading(true);
      try {
        const [voicesRes, companiesRes] = await Promise.all([
          fetch(`/api/platform/voice-speakers${sync ? "?sync=1" : ""}`),
          fetch("/api/companies"),
        ]);
        const voicesJson = await voicesRes.json().catch(() => ({}));
        const companiesJson = await companiesRes.json().catch(() => ({}));

        // 槽位以音色接口为准（SQL 直读），公司列表补全活跃公司名称
        const fromVoices = Array.isArray(voicesJson.data?.companies)
          ? (voicesJson.data.companies as {
              id: number | string;
              name: string;
              voice_clone_slots?: number;
              synth_minutes_quota?: number;
              synth_used_minutes?: number;
            }[])
          : [];
        const fromCompanies =
          companiesRes.ok && Array.isArray(companiesJson.data)
            ? (
                companiesJson.data as {
                  id: number | string;
                  name: string;
                  status?: string;
                  config?: {
                    voice_clone_slots?: number;
                    synth_minutes_quota?: number;
                  };
                }[]
              ).filter((c) => c.status === "active")
            : [];

        const byId = new Map<number, CompanyOpt>();
        for (const c of fromCompanies) {
          const id = Number(c.id);
          if (!id) continue;
          byId.set(id, {
            id,
            name: c.name,
            voice_clone_slots: Number(c.config?.voice_clone_slots) || 0,
            synth_minutes_quota: Number(c.config?.synth_minutes_quota) || 0,
            synth_used_minutes: 0,
          });
        }
        for (const c of fromVoices) {
          const id = Number(c.id);
          if (!id) continue;
          const slots = Number(c.voice_clone_slots) || 0;
          const quota = Number(c.synth_minutes_quota) || 0;
          const usedMin = Number(c.synth_used_minutes) || 0;
          const prev = byId.get(id);
          byId.set(id, {
            id,
            name: prev?.name || c.name,
            voice_clone_slots: Math.max(prev?.voice_clone_slots || 0, slots),
            synth_minutes_quota: Math.max(
              prev?.synth_minutes_quota || 0,
              quota
            ),
            // 用量以音色接口汇总为准
            synth_used_minutes: usedMin || prev?.synth_used_minutes || 0,
          });
        }
        setCompanies(Array.from(byId.values()).sort((a, b) => b.id - a.id));

        if (!voicesRes.ok) {
          ui.error("加载失败", voicesJson.error);
          return;
        }
        setItems(voicesJson.data?.items || []);
        setSyncError(voicesJson.data?.sync_error || null);
        setVolcRaw(voicesJson.data?.volc_statuses || null);
        if (sync) {
          const summary = voicesJson.data?.sync_summary as
            | { total?: number; ok?: number; failed?: number }
            | undefined;
          if (voicesJson.data?.sync_error && !(summary?.ok && summary.ok > 0)) {
            ui.error("查询剩余次数失败", voicesJson.data.sync_error);
          } else if (summary) {
            ui.success(
              `已查询剩余训练次数：成功 ${summary.ok ?? 0}/${summary.total ?? 0}` +
                (summary.failed ? `，失败 ${summary.failed}` : "")
            );
          } else if (!voicesJson.data?.sync_error) {
            ui.success("已查询火山剩余训练次数");
          }
        }
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [ui]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const loadOfficial = useCallback(async () => {
    setOfficialLoading(true);
    try {
      const res = await fetch("/api/platform/official-voices");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("加载官方音色失败", json.error);
        return;
      }
      const items = (json.data?.items || []) as OfficialVoiceItem[];
      setOfficialItems(items);
      setOfficialDraft(
        new Set(items.filter((v) => v.enabled).map((v) => v.speakerId))
      );
    } finally {
      setOfficialLoading(false);
    }
  }, [ui]);

  useEffect(() => {
    void loadOfficial();
  }, [loadOfficial]);

  function toggleOfficial(id: string) {
    setOfficialDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openOfficialSettings() {
    setOfficialDraft(
      new Set(officialItems.filter((v) => v.enabled).map((v) => v.speakerId))
    );
    setOfficialPreviewUrl(null);
    setOfficialPreviewId(null);
    setOfficialSettingsOpen(true);
  }

  async function saveOfficial() {
    setOfficialSaving(true);
    try {
      const res = await fetch("/api/platform/official-voices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled_ids: Array.from(officialDraft) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      const items = (json.data?.items || []) as OfficialVoiceItem[];
      setOfficialItems(items);
      setOfficialDraft(
        new Set(items.filter((v) => v.enabled).map((v) => v.speakerId))
      );
      ui.success("已保存官方音色开放列表");
      setOfficialSettingsOpen(false);
    } finally {
      setOfficialSaving(false);
    }
  }

  async function previewOfficial(speakerId: string) {
    setOfficialPreviewLoading(true);
    setOfficialPreviewId(speakerId);
    try {
      const res = await fetch("/api/platform/official-voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", speaker: speakerId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("试听失败", json.error || res.statusText);
        return;
      }
      const url = String(json.data?.demo_audio || "");
      if (!url) {
        ui.error("试听失败", "未返回音频");
        return;
      }
      setOfficialPreviewUrl(url);
    } finally {
      setOfficialPreviewLoading(false);
    }
  }

  async function exportUsageCsv() {
    if (!usageQuery || usageExporting) return;
    setUsageExporting(true);
    try {
      await downloadExport(
        `/api/platform/voice-usage?${usageQuery}&format=csv`,
        `音色使用明细-${exportStamp()}.csv`
      );
      ui.success("已导出使用明细 CSV");
    } catch (err) {
      ui.error("导出失败", err instanceof Error ? err.message : undefined);
    } finally {
      setUsageExporting(false);
    }
  }

  async function loadUsage(query: string, page = 1) {
    setUsageLoading(true);
    try {
      const res = await fetch(
        `/api/platform/voice-usage?${query}&page=${page}&pageSize=20`
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("加载使用明细失败", json.error);
        return;
      }
      setUsageStats(json.data?.stats || null);
      setUsageItems(json.data?.items || []);
      setUsagePage(Number(json.data?.page) || page);
      setUsageTotalPages(Number(json.data?.totalPages) || 1);
    } finally {
      setUsageLoading(false);
    }
  }

  function openCloneUsage(row: VoiceRow) {
    const companyQ =
      selectedCompanyId != null ? `&company_id=${selectedCompanyId}` : "";
    const q = `source=clone&voice_speaker_id=${row.id}${companyQ}`;
    setUsageQuery(q);
    setUsageTitle(
      `使用明细 · ${row.company_name || ""} · ${row.name}（声音复刻）`
    );
    setUsageOpen(true);
    setUsageStats(null);
    setUsageItems([]);
    void loadUsage(q, 1);
  }

  function openOfficialUsage(
    speakerId: string,
    name: string,
    companyScoped = false
  ) {
    const companyQ =
      companyScoped && selectedCompanyId != null
        ? `&company_id=${selectedCompanyId}`
        : "";
    const q = `source=official&official_speaker_id=${encodeURIComponent(
      speakerId
    )}${companyQ}`;
    setUsageQuery(q);
    setUsageTitle(
      companyScoped && selectedCompany
        ? `使用明细 · ${selectedCompany.name} · ${name}（官方音色）`
        : `使用明细 · ${name}（官方音色）`
    );
    setUsageOpen(true);
    setUsageStats(null);
    setUsageItems([]);
    void loadUsage(q, 1);
  }

  function openAssign() {
    setCompanyId(assignableCompanies[0] ? String(assignableCompanies[0].id) : "");
    setAssignName("公司音色");
    setAssignSpeakerId("");
    setAssignNote("");
    setAssignOpen(true);
  }

  async function saveAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) {
      ui.error("请选择公司");
      return;
    }
    if (!assignSpeakerId.trim()) {
      ui.error("请填写 Speaker ID");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/platform/voice-speakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: Number(companyId),
          provider_speaker_id: assignSpeakerId.trim(),
          name: assignName.trim() || "公司音色",
          note: assignNote.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("分配失败", json.error);
        return;
      }
      ui.success("已分配 Speaker ID，公司可上传样音训练");
      setAssignOpen(false);
      await load(false);
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(row: VoiceRow) {
    setEdit(row);
    setSpeakerId(row.provider_speaker_id || "");
    setName(row.name || "");
    setNote(row.meta?.note || "");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/platform/voice-speakers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: edit.id,
          provider_speaker_id: speakerId.trim(),
          name: name.trim(),
          note: note.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      ui.success("已保存");
      setEdit(null);
      await load(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function removeRow(row: VoiceRow) {
    const ok = await ui.confirm({
      title: "删除该音色分配？",
      description: `将删除「${row.company_name} · ${row.name}」及 Speaker ID，释放槽位。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/platform/voice-speakers?id=${row.id}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      ui.error("删除失败", json.error);
      return;
    }
    ui.success("已删除");
    await load(false);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold">音色管理</h1>
          <p className="text-sm text-[var(--color-muted)]">
            平台级管理：为各公司分配复刻 Speaker ID、查看全平台使用明细，并配置全公司通用的官方音色。
            复刻名额需先在「公司管理 → 配置」按公司开通（1/2）。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openAssign} disabled={assignableCompanies.length === 0}>
            分配 Speaker ID
            {assignableCompanies.length > 0
              ? `（${assignableCompanies.length} 家可分配）`
              : ""}
          </Button>
          <Button variant="secondary" onClick={openOfficialSettings}>
            官方音色设置
            {!officialLoading
              ? `（已开放 ${officialItems.filter((v) => v.enabled).length}）`
              : ""}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void load(true)}
            disabled={syncing || loading || items.length === 0}
          >
            {syncing ? "查询中…" : "查询剩余次数"}
          </Button>
          <Button variant="secondary" onClick={() => router.push("/companies")}>
            公司槽位配置
          </Button>
        </div>
      </div>

      {!loading && companies.length > 0 && (
        <section className="surface space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">全平台公司 · 复刻名额</h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              点击公司名称，下方表格显示该公司已分配的复刻音色及用过的官方音色；再点一次可取消筛选。
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">公司</th>
                  <th className="px-3 py-2 font-medium">已用 / 名额</th>
                  <th className="px-3 py-2 font-medium">已用 / 分钟</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const used = usedByCompany.get(Number(c.id)) || 0;
                  const slots = Number(c.voice_clone_slots) || 0;
                  const usedMin = Number(c.synth_used_minutes) || 0;
                  const quotaMin = Number(c.synth_minutes_quota) || 0;
                  const state =
                    slots <= 0 ? "未开通" : used >= slots ? "已满" : "可分配";
                  const active = selectedCompanyId === Number(c.id);
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-[var(--color-border)] last:border-0 ${
                        active ? "bg-[var(--color-accent)]/5" : ""
                      }`}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className={`company-filter-link${
                            active ? " is-active" : ""
                          }`}
                          onClick={() => selectCompany(Number(c.id))}
                        >
                          {c.name}
                        </button>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {used}/{slots}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {usedMin}/{quotaMin}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            state === "可分配"
                              ? "text-emerald-700"
                              : state === "已满"
                                ? "text-amber-800"
                                : "text-[var(--color-muted)]"
                          }
                        >
                          {state}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {assignableCompanies.length === 0 && (
            <p className="text-xs text-amber-800">
              当前没有可分配名额。请到「公司管理 →
              配置」为需要复刻的公司开通槽位，或删除已占用的音色后再分配。
            </p>
          )}
        </section>
      )}

      {!loading && companies.length === 0 && (
        <div className="surface p-4 text-sm text-[var(--color-muted)]">
          暂无活跃公司，请先在「公司管理」创建公司。
        </div>
      )}

      {syncError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          同步提示：{syncError}
        </div>
      )}

      {loading && <CardListSkeleton count={3} />}

      {!loading && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">
              {selectedCompany
                ? `${selectedCompany.name} · 音色一览`
                : "全平台 · 复刻音色分配"}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {selectedCompany
                ? "含该公司已分配的声音复刻，以及该公司实际用过的官方音色。"
                : "未选择公司时展示全部复刻分配；点击上方公司可筛选。"}
            </p>
          </div>
          {selectedCompanyId != null && (
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setSelectedCompanyId(null);
                setCompanyOfficial([]);
              }}
            >
              清除筛选
            </Button>
          )}
        </div>
      )}

      {!loading &&
        selectedCompanyId == null &&
        items.length === 0 && (
          <div className="text-sm text-[var(--color-muted)]">
            暂无音色分配记录
          </div>
        )}

      {!loading &&
        selectedCompanyId != null &&
        filteredCloneItems.length === 0 &&
        !companyOfficialLoading &&
        companyOfficial.length === 0 && (
          <div className="text-sm text-[var(--color-muted)]">
            该公司暂无复刻分配，也尚未使用过官方音色。
          </div>
        )}

      <div className="overflow-x-auto surface">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
            <tr>
              {selectedCompanyId == null && (
                <th className="px-4 py-3 font-medium">公司</th>
              )}
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">Speaker ID</th>
              <th className="px-4 py-3 font-medium">合成使用</th>
              <th className="px-4 py-3 font-medium">剩余训练</th>
              <th className="px-4 py-3 font-medium">共使用时长</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              filteredCloneItems.map((row) => (
                <tr
                  key={`clone-${row.id}`}
                  className="border-b border-[var(--color-border)] last:border-0"
                >
                  {selectedCompanyId == null && (
                    <td className="px-4 py-3">{row.company_name}</td>
                  )}
                  <td className="px-4 py-3">声音复刻</td>
                  <td className="px-4 py-3">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.provider_speaker_id || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>共 {row.synth_total ?? 0} 次</div>
                    <div className="text-[var(--color-muted)]">
                      成功 {row.synth_success ?? 0} · 失败{" "}
                      {row.synth_failed ?? 0} · 已保存 {row.synth_saved ?? 0}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {row.available_training_times != null
                      ? `${row.available_training_times} / ${VOICE_TRAINING_TIMES_LIMIT}`
                      : "未同步"}
                    {row.volc_state ? (
                      <div className="mt-1 text-xs text-[var(--color-muted)]">
                        火山：{row.volc_state}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {formatSynthDurationSec(row.synth_success_duration_sec)}
                    <div className="mt-1 text-xs text-[var(--color-muted)]">
                      仅计成功合成
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {STATUS_LABEL[row.status] || row.status}
                    {row.error_message ? (
                      <div className="mt-1 text-xs text-red-600">
                        {row.error_message}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => openCloneUsage(row)}
                      >
                        详情
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => openEdit(row)}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => void removeRow(row)}
                      >
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            {!loading &&
              selectedCompanyId != null &&
              companyOfficialLoading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-3 text-[var(--color-muted)]"
                  >
                    加载该公司官方音色使用中…
                  </td>
                </tr>
              )}
            {!loading &&
              selectedCompanyId != null &&
              !companyOfficialLoading &&
              companyOfficial.map((row) => (
                <tr
                  key={`official-${row.speaker_id}`}
                  className="border-b border-[var(--color-border)] last:border-0"
                >
                  <td className="px-4 py-3">官方音色</td>
                  <td className="px-4 py-3">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.speaker_id}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>共 {row.synth_total ?? 0} 次</div>
                    <div className="text-[var(--color-muted)]">
                      成功 {row.synth_success ?? 0} · 失败{" "}
                      {row.synth_failed ?? 0} · 已保存 {row.synth_saved ?? 0}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">—</td>
                  <td className="px-4 py-3">
                    {formatSynthDurationSec(row.synth_success_duration_sec)}
                    <div className="mt-1 text-xs text-[var(--color-muted)]">
                      仅计成功合成
                    </div>
                  </td>
                  <td className="px-4 py-3">已使用</td>
                  <td className="px-4 py-3">
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() =>
                        openOfficialUsage(row.speaker_id, row.name, true)
                      }
                    >
                      详情
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {volcRaw != null && (
        <details className="surface p-4 text-xs text-[var(--color-muted)]">
          <summary className="cursor-pointer text-sm font-medium text-[var(--color-text)]">
            查询剩余次数 · 原始返回
          </summary>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all">
            {JSON.stringify(volcRaw, null, 2)}
          </pre>
        </details>
      )}

      <Modal
        open={assignOpen}
        title="分配 Speaker ID"
        description="面向全平台：从火山控制台获取 Speaker ID，分配给下方有空闲名额的任意公司；分配后该公司可上传样音训练。"
        onClose={() => setAssignOpen(false)}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAssignOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" form="platform-voice-assign" disabled={submitting}>
              {submitting ? "分配中…" : "确认分配"}
            </Button>
          </>
        }
      >
        <form id="platform-voice-assign" onSubmit={saveAssign} className="space-y-4">
          <div className="field">
            <label>公司（有空闲名额）</label>
            <select
              className="input"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              required
            >
              <option value="">请选择</option>
              {assignableCompanies.map((c) => {
                const used = usedByCompany.get(Number(c.id)) || 0;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name}（已用 {used}/{c.voice_clone_slots}）
                  </option>
                );
              })}
            </select>
          </div>
          <div className="field">
            <label>展示名称</label>
            <input
              className="input"
              value={assignName}
              onChange={(e) => setAssignName(e.target.value)}
              placeholder="公司音色"
              required
            />
          </div>
          <div className="field">
            <label>火山 Speaker ID</label>
            <input
              className="input font-mono text-sm"
              value={assignSpeakerId}
              onChange={(e) => setAssignSpeakerId(e.target.value)}
              placeholder="S_xxxxxxxx"
              required
            />
          </div>
          <div className="field">
            <label>备注</label>
            <input
              className="input"
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
              placeholder="可选"
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={officialSettingsOpen}
        title="官方音色设置"
        description="勾选后全平台公司可在语音合成中选用。走 seed-tts-2.0，按字数计费，不占复刻槽位。"
        onClose={() => {
          setOfficialSettingsOpen(false);
          setOfficialPreviewUrl(null);
          setOfficialDraft(
            new Set(
              officialItems.filter((v) => v.enabled).map((v) => v.speakerId)
            )
          );
        }}
        size="xl"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOfficialSettingsOpen(false);
                setOfficialPreviewUrl(null);
                setOfficialDraft(
                  new Set(
                    officialItems
                      .filter((v) => v.enabled)
                      .map((v) => v.speakerId)
                  )
                );
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void saveOfficial()}
              disabled={officialLoading || officialSaving}
            >
              {officialSaving ? "保存中…" : "保存"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {officialLoading ? (
            <div className="text-sm text-[var(--color-muted)]">加载中…</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {officialItems.map((v) => {
                const checked = officialDraft.has(v.speakerId);
                const previewing =
                  officialPreviewLoading && officialPreviewId === v.speakerId;
                return (
                  <div
                    key={v.speakerId}
                    className={`flex items-start gap-3 rounded-md border px-3 py-2 text-sm transition ${
                      checked
                        ? "border-sky-400 bg-sky-50"
                        : "border-[var(--color-border)] bg-white"
                    }`}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={() => toggleOfficial(v.speakerId)}
                      />
                      <span className="min-w-0">
                        <span className="font-medium text-[var(--color-text)]">
                          {v.name}
                        </span>
                        <span className="ml-2 text-xs text-[var(--color-muted)]">
                          {v.gender === "female" ? "女声" : "男声"}
                        </span>
                        {v.hint ? (
                          <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                            {v.hint}
                          </span>
                        ) : null}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-[var(--color-primary)] hover:underline disabled:opacity-50"
                      disabled={officialPreviewLoading}
                      onClick={() => void previewOfficial(v.speakerId)}
                    >
                      {previewing ? "试听中…" : "试听"}
                    </button>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-[var(--color-primary)] hover:underline"
                      onClick={() => openOfficialUsage(v.speakerId, v.name)}
                    >
                      明细
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {officialPreviewUrl && (
            <div className="field">
              <label className="text-xs text-[var(--color-muted)]">
                试听播放
                {officialPreviewId
                  ? ` · ${
                      officialItems.find(
                        (x) => x.speakerId === officialPreviewId
                      )?.name || officialPreviewId
                    }`
                  : ""}
              </label>
              <audio
                key={officialPreviewUrl}
                controls
                autoPlay
                src={officialPreviewUrl}
                className="mt-1 w-full"
              />
            </div>
          )}
          {!officialLoading && officialDraft.size === 0 && (
            <p className="text-xs text-amber-800">
              当前未勾选任何官方音色；公司端切换「官方」时将提示尚未开放。
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(edit)}
        title={edit ? `编辑音色 · ${edit.company_name}` : "编辑音色"}
        description="可修改 Speaker ID、名称或备注。"
        onClose={() => setEdit(null)}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEdit(null)}>
              取消
            </Button>
            <Button type="submit" form="platform-voice-edit" disabled={submitting}>
              {submitting ? "保存中…" : "保存"}
            </Button>
          </>
        }
      >
        <form id="platform-voice-edit" onSubmit={saveEdit} className="space-y-4">
          <div className="field">
            <label>名称</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Speaker ID</label>
            <input
              className="input font-mono text-sm"
              value={speakerId}
              onChange={(e) => setSpeakerId(e.target.value)}
              placeholder="S_xxxxxxxx"
              required
            />
          </div>
          <div className="field">
            <label>备注</label>
            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="可选"
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={usageOpen}
        title={usageTitle || "使用明细"}
        description="正式合成记录（不含试听）。含使用人、时间、文案、语气、时长与是否下载保存。"
        onClose={() => setUsageOpen(false)}
        size="xl"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={usageExporting || usageLoading || usageItems.length === 0}
              onClick={() => void exportUsageCsv()}
            >
              {usageExporting ? "导出中…" : "导出 CSV"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setUsageOpen(false)}>
              关闭
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {usageStats && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                <div className="text-xs text-[var(--color-muted)]">使用次数</div>
                <div className="text-lg font-semibold">{usageStats.total}</div>
              </div>
              <div className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                <div className="text-xs text-[var(--color-muted)]">成功</div>
                <div className="text-lg font-semibold text-emerald-700">
                  {usageStats.success}
                </div>
              </div>
              <div className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                <div className="text-xs text-[var(--color-muted)]">失败</div>
                <div className="text-lg font-semibold text-rose-700">
                  {usageStats.failed}
                </div>
              </div>
              <div className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                <div className="text-xs text-[var(--color-muted)]">已保存</div>
                <div className="text-lg font-semibold">{usageStats.saved}</div>
              </div>
            </div>
          )}

          {usageLoading && (
            <div className="text-sm text-[var(--color-muted)]">加载中…</div>
          )}

          {!usageLoading && usageItems.length === 0 && (
            <div className="text-sm text-[var(--color-muted)]">暂无合成记录</div>
          )}

          {!usageLoading && usageItems.length > 0 && (
            <div className="max-h-[min(52vh,28rem)] overflow-auto rounded-md border border-[var(--color-border)]">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 z-[1] border-b border-[var(--color-border)] bg-slate-50 text-[var(--color-muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">时间</th>
                    <th className="px-3 py-2 font-medium">使用者</th>
                    <th className="px-3 py-2 font-medium">公司</th>
                    <th className="px-3 py-2 font-medium">来源</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="px-3 py-2 font-medium">字数</th>
                    <th className="px-3 py-2 font-medium">时长</th>
                    <th className="px-3 py-2 font-medium">保存</th>
                    <th className="px-3 py-2 font-medium">文案 / 语气</th>
                  </tr>
                </thead>
                <tbody>
                  {usageItems.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-[var(--color-border)] align-top last:border-0"
                    >
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-3 py-2">{log.user_name || "—"}</td>
                      <td className="px-3 py-2">{log.company_name || "—"}</td>
                      <td className="px-3 py-2">
                        {log.source_label}
                        {log.icl_model_type != null
                          ? ` · ICL ${log.icl_model_type === 1 ? "1.0" : "3.0"}`
                          : ""}
                      </td>
                      <td className="px-3 py-2">
                        {log.status === "success" ? "成功" : "失败"}
                        {log.error_message ? (
                          <div className="mt-1 text-rose-600">{log.error_message}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{log.text_char_count}</td>
                      <td className="px-3 py-2">
                        {log.duration_sec != null ? `${log.duration_sec}s` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {log.saved ? "已保存" : "未保存"}
                      </td>
                      <td className="max-w-xs px-3 py-2">
                        <div className="whitespace-pre-wrap break-words text-[var(--color-text)]">
                          {log.text_content || "—"}
                        </div>
                        {log.context_text ? (
                          <div className="mt-1 text-[var(--color-muted)]">
                            语气：{log.context_text}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {usageTotalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={usageLoading || usagePage <= 1}
                onClick={() => void loadUsage(usageQuery, usagePage - 1)}
              >
                上一页
              </Button>
              <span className="text-xs text-[var(--color-muted)]">
                {usagePage} / {usageTotalPages}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={usageLoading || usagePage >= usageTotalPages}
                onClick={() => void loadUsage(usageQuery, usagePage + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
