"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { Modal } from "@/components/ui/Modal";
import { useUi } from "@/components/ui/Feedback";
import { StatusTag } from "@/components/ui/StatusTag";
import { Select } from "@/components/ui/Select";
import { useAppRouter } from "@/hooks/useAppRouter";
import { CardListSkeleton } from "@/components/ui/Skeleton";
import { EMPTY_PAGE_META, type PageMeta } from "@/lib/pagination";
import { pageCacheFetchJson, pageCachePeek } from "@/lib/page-cache";
import {
  CozeDatasetsEditor,
  datasetsFromCompanyConfig,
  summarizeDatasets,
  type DatasetFormRow,
} from "@/components/companies/CozeDatasetsEditor";

type Company = {
  id: number;
  name: string;
  status: string;
  user_count?: number;
  admin_name?: string;
  config?: {
    voice_clone_slots?: number;
    synth_minutes_quota?: number;
    coze?: {
      bot_id?: string;
      api_base?: string;
      dataset_id?: string;
      datasets?: DatasetFormRow[];
    };
    volc_asr?: {
      api_key_masked?: string | null;
      has_api_key?: boolean;
      configured?: boolean;
    };
  };
};

const SLOT_OPTIONS = [
  { value: "0", label: "0（关闭）" },
  { value: "1", label: "1 个" },
  { value: "2", label: "2 个" },
];

const COMPANIES_SEED_URL = "/api/companies?page=1&pageSize=10";

export default function CompaniesPage() {
  const ui = useUi();
  const router = useAppRouter();
  const seed = pageCachePeek<{ data?: Company[]; meta?: PageMeta }>(
    COMPANIES_SEED_URL
  );
  const [list, setList] = useState<Company[]>(() => seed?.data || []);
  const [loading, setLoading] = useState(() => seed == null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PageMeta>(seed?.meta || EMPTY_PAGE_META);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const hasRowsRef = useRef((seed?.data?.length || 0) > 0);
  hasRowsRef.current = list.length > 0;

  const [cozeOpen, setCozeOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [botId, setBotId] = useState("");
  const [datasets, setDatasets] = useState<DatasetFormRow[]>([]);
  const [volcApiKey, setVolcApiKey] = useState("");
  const [voiceSlots, setVoiceSlots] = useState("0");
  const [synthMinutes, setSynthMinutes] = useState("0");

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = opts?.force === true;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      const url = `/api/companies?${params}`;
      const cached = pageCachePeek<{ data?: Company[]; meta?: PageMeta }>(url);
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
          data?: Company[];
          meta?: PageMeta;
          error?: string;
        }>(url, { force });
        if (!res.ok) ui.error("加载失败", json.error);
        else {
          setList(json.data || []);
          if (json.meta) {
            setMeta(json.meta);
            if (json.meta.page !== page) setPage(json.meta.page);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, ui]
  );

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setName("");
    setAdminName("");
    setAdminPhone("");
    setAdminEmail("");
    setAdminPassword("");
    setOpen(true);
  }

  function openCoze(c: Company, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditing(c);
    setBotId(c.config?.coze?.bot_id || "");
    setDatasets(datasetsFromCompanyConfig(c.config?.coze));
    setVolcApiKey("");
    setVoiceSlots(String(c.config?.voice_clone_slots ?? 0));
    setSynthMinutes(String(c.config?.synth_minutes_quota ?? 0));
    setCozeOpen(true);
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!adminPhone.trim()) {
      ui.error("管理员手机号必填");
      return;
    }
    const ok = await ui.confirm({
      title: "确认创建公司？",
      description: `将创建公司「${name}」，并指定管理员 ${adminName}（${adminPhone}${
        adminEmail ? ` / ${adminEmail}` : ""
      }）。`,
      confirmText: "确认创建",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          admin_name: adminName,
          admin_phone: adminPhone,
          admin_email: adminEmail,
          admin_password: adminPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("创建失败", json.error);
        return;
      }
      ui.success("公司已创建", `管理员账号 ${adminPhone}`);
      setOpen(false);
      await load({ force: true });
    } finally {
      setSubmitting(false);
    }
  }

  async function saveCoze(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!botId.trim()) {
      ui.error("请填写智能体 ID");
      return;
    }
    const cleaned = datasets
      .map((d) => ({
        id: d.id.trim(),
        name: (d.name || d.id).trim(),
        type: d.type,
      }))
      .filter((d) => d.id);
    const ok = await ui.confirm({
      title: "确认保存配置？",
      description: `将「${editing.name}」绑定智能体 ${botId.trim()}，知识库 ${cleaned.length} 个（${summarizeDatasets(cleaned)}）。复刻槽位：${voiceSlots}。合成分钟：${synthMinutes}。豆包 API Key：${
        volcApiKey.trim() ? "使用本次填写的值" : "留空，将清空公司凭证"
      }。`,
      confirmText: "确认保存",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        id: editing.id,
        coze_bot_id: botId.trim(),
        coze_datasets: cleaned,
        voice_clone_slots: Number(voiceSlots),
        synth_minutes_quota: Math.max(0, Math.floor(Number(synthMinutes) || 0)),
        volc_asr_api_key: volcApiKey.trim(),
        volc_asr_app_id: "",
        volc_asr_access_token: "__CLEAR__",
        volc_asr_resource_id: "",
      };

      const res = await fetch("/api/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      ui.success("配置已保存", editing.name);
      setCozeOpen(false);
      await load({ force: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">公司管理</h1>
          <p className="text-sm text-[var(--color-muted)]">
            点击公司查看用户现况；可为每家公司绑定智能体、知识库与豆包语音识别凭证
          </p>
        </div>
        <Button onClick={openCreate}>创建公司</Button>
      </div>

      <Modal
        open={open}
        title="创建公司"
        description="将同时创建该公司的唯一管理员账号"
        onClose={() => setOpen(false)}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" form="company-create-form" disabled={submitting}>
              {submitting ? "创建中…" : "创建公司"}
            </Button>
          </>
        }
      >
        <form id="company-create-form" onSubmit={createCompany} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="field sm:col-span-2">
            <label>公司名称</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>管理员姓名</label>
            <input
              className="input"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>管理员手机号</label>
            <input
              className="input"
              value={adminPhone}
              onChange={(e) => setAdminPhone(e.target.value)}
              placeholder="例如 13800000000"
              inputMode="tel"
              required
            />
          </div>
          <div className="field">
            <label>管理员邮箱（可选）</label>
            <input
              className="input"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
          </div>
          <div className="field sm:col-span-2">
            <label>管理员初始密码</label>
            <input
              className="input"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={cozeOpen}
        title={editing ? `配置 · ${editing.name}` : "配置"}
        description="绑定智能体与知识库，并配置该公司专用的火山/豆包语音识别。未配置时回退系统默认。"
        onClose={() => setCozeOpen(false)}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setCozeOpen(false)}>
              取消
            </Button>
            <Button type="submit" form="company-coze-form" disabled={submitting}>
              {submitting ? "保存中…" : "保存"}
            </Button>
          </>
        }
      >
        <form id="company-coze-form" onSubmit={saveCoze} className="space-y-4">
          <div className="field">
            <label>智能体 ID</label>
            <input
              className="input"
              value={botId}
              onChange={(e) => setBotId(e.target.value)}
              placeholder="智能体 ID"
              required
            />
          </div>
          <CozeDatasetsEditor value={datasets} onChange={setDatasets} />

          <div className="border-t border-[var(--color-border)] pt-4">
            <div className="mb-2 text-sm font-medium">声音复刻槽位</div>
            <p className="mb-3 text-xs text-[var(--color-muted)]">
              平台分配该公司可创建的复刻音色数量（占用火山应用总槽位）。0 表示关闭。
            </p>
            <div className="field">
              <label>可用槽位</label>
              <Select
                value={voiceSlots}
                onChange={setVoiceSlots}
                options={SLOT_OPTIONS}
              />
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] pt-4">
            <div className="mb-2 text-sm font-medium">声音合成分钟数</div>
            <p className="mb-3 text-xs text-[var(--color-muted)]">
              全公司公用配额（复刻音色与官方音色正式合成共用）。试听不计。0 表示不可合成。
            </p>
            <div className="field">
              <label>可用分钟</label>
              <input
                className="input"
                type="number"
                min={0}
                step={1}
                value={synthMinutes}
                onChange={(e) => setSynthMinutes(e.target.value)}
                placeholder="例如 120"
              />
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] pt-4">
            <div className="mb-2 text-sm font-medium">豆包语音识别（火山引擎）</div>
            <p className="mb-3 text-xs text-[var(--color-muted)]">
              保存时以输入框为准：填写则覆盖；留空则清空该公司 API Key（回退系统默认）。
              {editing?.config?.volc_asr?.has_api_key
                ? ` 当前已配置 ${editing.config.volc_asr.api_key_masked || ""}。`
                : ""}
            </p>
            <div className="field">
              <label>API Key</label>
              <input
                className="input"
                type="password"
                autoComplete="off"
                value={volcApiKey}
                onChange={(e) => setVolcApiKey(e.target.value)}
                placeholder="火山引擎语音 API Key"
              />
            </div>
          </div>
        </form>
      </Modal>

      <div className="grid gap-3 md:grid-cols-2">
        {loading && <CardListSkeleton count={4} className="md:col-span-2 md:grid-cols-2" />}
        {!loading && list.length === 0 && (
          <div className="text-sm text-[var(--color-muted)]">暂无公司</div>
        )}
        {!loading &&
          list.map((c) => {
          const bot = c.config?.coze?.bot_id;
          const ds = datasetsFromCompanyConfig(c.config?.coze);
          return (
            <div
              key={c.id}
              role="link"
              tabIndex={0}
              className="surface table-row-link cursor-pointer p-4"
              onClick={() => router.push(`/companies/${c.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/companies/${c.id}`);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold">{c.name}</div>
                    <StatusTag kind="company" value={c.status} />
                  </div>
                  <div className="mt-1 text-sm text-[var(--color-muted)]">
                    成员 {c.user_count ?? 0} · 管理员 {c.admin_name || "—"}
                  </div>
                  <div className="mt-2 text-xs text-[var(--color-muted)]">
                    智能体：{bot || "用默认"} · 知识库：{summarizeDatasets(ds)} · 复刻槽位：
                    {c.config?.voice_clone_slots ?? 0} · 合成分钟：
                    {c.config?.synth_minutes_quota ?? 0} · 豆包识别：
                    {c.config?.volc_asr?.configured ? "已配置 API Key" : "用系统默认"}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  type="button"
                  className="shrink-0 whitespace-nowrap"
                  onClick={(e) => openCoze(c, e)}
                >
                  配置
                </Button>
              </div>
            </div>
          );
        })}
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
