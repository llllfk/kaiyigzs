"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { Modal } from "@/components/ui/Modal";
import { EMPTY_PAGE_META, pageRowNo, type PageMeta } from "@/lib/pagination";
import { useUi } from "@/components/ui/Feedback";
import { useAppRouter } from "@/hooks/useAppRouter";
import { ROLE_LABELS, type UserRole } from "@/types";
import { StatusTag } from "@/components/ui/StatusTag";
import {
  CardListSkeleton,
  DetailPageSkeleton,
  TableSkeleton,
} from "@/components/ui/Skeleton";
import {
  CozeDatasetsEditor,
  datasetsFromCompanyConfig,
  summarizeDatasets,
  type DatasetFormRow,
} from "@/components/companies/CozeDatasetsEditor";
import dynamic from "next/dynamic";

const TableKbMapModal = dynamic(
  () =>
    import("@/components/companies/TableKbMapModal").then(
      (module) => module.TableKbMapModal
    ),
  { ssr: false }
);

type Company = {
  id: number;
  name: string;
  status: string;
  user_count?: number;
  active_user_count?: number;
  admin_name?: string;
  config?: {
    voice_clone_slots?: number;
    synth_minutes_quota?: number;
    coze?: {
      bot_id?: string;
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

type CompanyUser = {
  id: number;
  role: UserRole;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  manager_name?: string | null;
  created_at: string;
};

export default function CompanyDetailPage() {
  const ui = useUi();
  const router = useAppRouter();
  const params = useParams<{ id: string }>();
  const companyId = params.id;

  const [company, setCompany] = useState<Company | null>(null);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [cozeOpen, setCozeOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [entering, setEntering] = useState(false);
  const [botId, setBotId] = useState("");
  const [datasets, setDatasets] = useState<DatasetFormRow[]>([]);
  const [volcApiKey, setVolcApiKey] = useState("");
  const [voiceSlots, setVoiceSlots] = useState("0");
  const [synthMinutes, setSynthMinutes] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  const hydrateAiForm = useCallback((c: Company) => {
    setBotId(c.config?.coze?.bot_id || "");
    setDatasets(datasetsFromCompanyConfig(c.config?.coze));
    setVolcApiKey("");
    setVoiceSlots(String(c.config?.voice_clone_slots ?? 0));
    setSynthMinutes(String(c.config?.synth_minutes_quota ?? 0));
  }, []);

  const loadCompany = useCallback(async () => {
    const res = await fetch(`/api/companies/${companyId}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "加载公司失败");
      setCompany(null);
      return;
    }
    setCompany(json.data);
    hydrateAiForm(json.data);
  }, [companyId, hydrateAiForm]);

  const loadUsers = useCallback(
    async (opts?: { keyword?: string; status?: string; page?: number; pageSize?: number }) => {
      const keyword = opts?.keyword ?? q;
      const st = opts?.status ?? status;
      const p = opts?.page ?? page;
      const size = opts?.pageSize ?? pageSize;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          company_id: String(companyId),
          page: String(p),
          pageSize: String(size),
        });
        if (st) params.set("status", st);
        if (keyword.trim()) params.set("q", keyword.trim());
        const res = await fetch(`/api/users?${params}`);
        const json = await res.json();
        if (!res.ok) {
          ui.error("加载用户失败", json.error);
          return;
        }
        setUsers(json.data || []);
        if (json.meta) {
          setMeta(json.meta);
          if (json.meta.page !== p) setPage(json.meta.page);
        }
      } finally {
        setLoading(false);
      }
    },
    [companyId, page, pageSize, q, status, ui]
  );

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, page, pageSize, status]);

  function onSearch() {
    if (page === 1) loadUsers({ keyword: q, page: 1 });
    else setPage(1);
  }

  function onStatusChange(v: string) {
    setStatus(v);
    setPage(1);
  }

  async function saveCoze(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
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
      description: `将「${company.name}」绑定智能体 ${botId.trim()}，知识库 ${cleaned.length} 个（${summarizeDatasets(cleaned)}）。复刻槽位：${voiceSlots}。合成分钟：${synthMinutes}。豆包 API Key：${
        volcApiKey.trim() ? "使用本次填写的值" : "留空，将清空公司凭证"
      }。`,
      confirmText: "确认保存",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        id: company.id,
        coze_bot_id: botId.trim(),
        coze_datasets: cleaned,
        voice_clone_slots: Number(voiceSlots),
        synth_minutes_quota: Math.max(0, Math.floor(Number(synthMinutes) || 0)),
        // 以输入框为准：有值覆盖，空则清空；并清掉旧版字段
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
      ui.success("配置已保存", company.name);
      setCozeOpen(false);
      await loadCompany();
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !company) {
    return <div className="text-red-600">{error}</div>;
  }
  if (!company) {
    return <DetailPageSkeleton />;
  }

  const bot = company.config?.coze?.bot_id;
  const ds = datasetsFromCompanyConfig(company.config?.coze);
  const volcConfigured = Boolean(company.config?.volc_asr?.configured);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
            <StatusTag kind="company" value={company.status} />
            <span>
              成员 {company.user_count ?? meta.total} · 启用 {company.active_user_count ?? "—"} · 管理员{" "}
              {company.admin_name || "—"}
            </span>
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            智能体：{bot || "用默认"} · 知识库：{summarizeDatasets(ds)} · 复刻槽位：
            {company.config?.voice_clone_slots ?? 0} · 合成分钟：
            {company.config?.synth_minutes_quota ?? 0} · 豆包识别：
            {volcConfigured ? "已配置 API Key" : "用系统默认"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={entering || company.status !== "active"}
            onClick={async () => {
              setEntering(true);
              try {
                const res = await fetch("/api/auth/company-view", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ company_id: company.id }),
                });
                const json = await res.json();
                if (!res.ok) {
                  ui.error("进入失败", json.error);
                  return;
                }
                ui.success("已进入公司业务视图", company.name);
                router.push("/dashboard");
                router.refresh();
              } finally {
                setEntering(false);
              }
            }}
          >
            {entering ? "进入中…" : "查看公司数据"}
          </Button>
          <Button
            variant="secondary"
            className="shrink-0 whitespace-nowrap"
            onClick={() => {
              hydrateAiForm(company);
              setCozeOpen(true);
            }}
          >
            配置
          </Button>
          <Button variant="secondary" onClick={() => setMapOpen(true)}>
            表格库关联
          </Button>
          <Button variant="secondary" onClick={() => router.push("/companies")}>
            返回列表
          </Button>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">用户现况</h2>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-32 shrink-0">
            <Select
              value={status}
              onChange={onStatusChange}
              options={[
                { value: "", label: "全部状态" },
                { value: "active", label: "启用" },
                { value: "inactive", label: "停用" },
              ]}
            />
          </div>
          <div className="w-56 max-w-full shrink-0">
            <input
              className="input"
              placeholder="搜索姓名/邮箱/手机"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
          </div>
          <Button variant="secondary" onClick={onSearch}>
            查询
          </Button>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : (
        <div className="surface hidden overflow-x-auto md:block">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
              <tr>
                <th className="w-14 px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">姓名</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">手机</th>
                <th className="px-4 py-3 font-medium">邮箱</th>
                <th className="px-4 py-3 font-medium">上级</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-[var(--color-muted)]">
                    暂无用户
                  </td>
                </tr>
              )}
              {users.map((u, i) => (
                <tr key={u.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">
                    {pageRowNo(meta, i)}
                  </td>
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3">{ROLE_LABELS[u.role] || u.role}</td>
                  <td className="px-4 py-3">{u.phone || "—"}</td>
                  <td className="px-4 py-3">{u.email || "—"}</td>
                  <td className="px-4 py-3">{u.manager_name || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusTag kind="user" value={u.status} />
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {new Date(u.created_at).toLocaleString("zh-CN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        <div className="grid gap-3 md:hidden">
          {loading && <CardListSkeleton count={4} />}
          {!loading && users.length === 0 && (
            <div className="text-sm text-[var(--color-muted)]">暂无用户</div>
          )}
          {!loading &&
            users.map((u) => (
            <div key={u.id} className="surface p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold">{u.name}</div>
                <StatusTag kind="user" value={u.status} />
              </div>
              <div className="mt-1 text-xs text-[var(--color-muted)]">
                {ROLE_LABELS[u.role] || u.role}
              </div>
              <div className="mt-1 text-xs text-[var(--color-muted)]">
                {u.phone || "—"}
                {u.email ? ` · ${u.email}` : ""}
              </div>
            </div>
          ))}
        </div>

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
      </section>

      <Modal
        open={cozeOpen}
        title={`配置 · ${company.name}`}
        description="绑定扣子智能体与知识库，并配置该公司专用的火山/豆包语音识别凭证。未配置时回退系统默认。"
        onClose={() => setCozeOpen(false)}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setCozeOpen(false)}>
              取消
            </Button>
            <Button type="submit" form="company-detail-coze-form" disabled={submitting}>
              {submitting ? "保存中…" : "保存"}
            </Button>
          </>
        }
      >
        <form id="company-detail-coze-form" onSubmit={saveCoze} className="space-y-4">
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
              平台分配该公司可创建的复刻音色数量。0 表示关闭。
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
              {company.config?.volc_asr?.has_api_key
                ? ` 当前已配置 ${company.config.volc_asr.api_key_masked || ""}。`
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

      <TableKbMapModal
        open={mapOpen}
        companyId={company.id}
        companyName={company.name}
        onClose={() => setMapOpen(false)}
      />
    </div>
  );
}
