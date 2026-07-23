"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ROLE_LABELS, type SessionUser } from "@/types";
import { Button } from "@/components/ui/Button";
import { useUi } from "@/components/ui/Feedback";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAppRouter } from "@/hooks/useAppRouter";
import {
  NOTIFICATION_TYPE_HINTS,
  NOTIFICATION_TYPE_LABELS,
  notificationTypesForUser,
  normalizeNotificationPrefs,
} from "@/lib/notification-prefs";
import { useSessionUserContext } from "@/components/shared/SessionUserContext";
import {
  MOBILE_NAV_LABELS,
  normalizeUiPrefs,
  type MobileNavStyle,
} from "@/lib/ui-prefs";
import { cn } from "@/lib/utils";

type PlatformEnvItem = {
  key: string;
  group: string;
  label: string;
  description?: string;
  secret: boolean;
  placeholder?: string;
  source: "override" | "env" | "unset";
  has_override: boolean;
  value_masked: string | null;
  edit_value: string;
  editable: boolean;
  block_reason: string | null;
};

const GROUP_ORDER = ["session", "coze", "asr", "openai", "storage", "other"] as const;
const GROUP_LABELS: Record<string, string> = {
  session: "会话与安全",
  coze: "扣子 Coze",
  asr: "语音识别（全局兜底）",
  openai: "OpenAI / 通用 AI",
  storage: "对象存储",
  other: "其它",
};

const SOURCE_LABEL: Record<PlatformEnvItem["source"], string> = {
  override: "数据库覆盖",
  env: "环境文件/系统",
  unset: "未设置",
};

export default function SettingsPage() {
  const ui = useUi();
  const router = useAppRouter();
  const { user: sessionUser, updateUser, uiPrefs, setUiPrefs } =
    useSessionUserContext();
  const [user, setUser] = useState<SessionUser>(sessionUser);
  const [name, setName] = useState(sessionUser.name || "");
  const [email, setEmail] = useState(sessionUser.email || "");
  const [phone, setPhone] = useState(sessionUser.phone || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [days, setDays] = useState("7");
  const [canEdit, setCanEdit] = useState(false);
  const [canEditQuote, setCanEditQuote] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState("50000");
  const [quoteDiscount, setQuoteDiscount] = useState("10");
  const [quoteShareDays, setQuoteShareDays] = useState("7");
  const [quoteShareViews, setQuoteShareViews] = useState("10");
  const [savingQuote, setSavingQuote] = useState(false);

  const [envItems, setEnvItems] = useState<PlatformEnvItem[]>([]);
  const [envLoading, setEnvLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [envSaving, setEnvSaving] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});
  const [savingNotif, setSavingNotif] = useState(false);
  const [mobileNav, setMobileNav] = useState<MobileNavStyle>(uiPrefs.mobile_nav);
  const [savingUi, setSavingUi] = useState(false);

  useEffect(() => {
    setMobileNav(uiPrefs.mobile_nav);
  }, [uiPrefs.mobile_nav]);

  const isPlatformAdmin =
    user?.role === "super_admin" && !user?.act_as_company_id;

  async function loadMe() {
    const res = await fetch("/api/auth/me");
    const json = await res.json();
    if (!res.ok || !json.data) return;
    const allowed = notificationTypesForUser(sessionUser);
    if (json.data.notification_prefs != null) {
      setNotifPrefs(
        normalizeNotificationPrefs(json.data.notification_prefs, allowed)
      );
    }
    if (json.data.ui_prefs != null) {
      const next = normalizeUiPrefs(json.data.ui_prefs);
      setMobileNav(next.mobile_nav);
      setUiPrefs(next);
    }
  }

  async function saveUiPrefs() {
    setSavingUi(true);
    try {
      const next = normalizeUiPrefs({ mobile_nav: mobileNav });
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ui_prefs: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("保存手机导航失败", json.error || `请求失败（${res.status}）`);
        return;
      }
      const saved = normalizeUiPrefs(json.data?.ui_prefs ?? next);
      setMobileNav(saved.mobile_nav);
      setUiPrefs(saved);
      ui.success("手机导航已保存");
    } catch (e) {
      ui.error(
        "保存手机导航失败",
        e instanceof Error ? e.message : "网络异常，请稍后重试"
      );
    } finally {
      setSavingUi(false);
    }
  }

  const loadEnv = useCallback(async () => {
    setEnvLoading(true);
    try {
      const res = await fetch("/api/platform/env");
      const json = await res.json();
      if (!res.ok) {
        if (res.status !== 403) ui.error("加载环境变量失败", json.error);
        setEnvItems([]);
        return;
      }
      setEnvItems((json.data || []) as PlatformEnvItem[]);
      setEditingKey(null);
      setDraftValue("");
    } finally {
      setEnvLoading(false);
    }
  }, [ui]);

  useEffect(() => {
    loadMe();
    fetch("/api/company/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setDays(String(j.data.pool_recycle_days || 7));
          setCanEdit(Boolean(j.data.can_edit_pool_rules));
          setCanEditQuote(Boolean(j.data.can_edit_quote_rules));
          const qs = j.data.quote_settings || {};
          setQuoteAmount(String(qs.approval_amount ?? 50000));
          setQuoteDiscount(String(qs.approval_discount_pct ?? 10));
          setQuoteShareDays(String(qs.share_valid_days ?? 7));
          setQuoteShareViews(String(qs.share_max_views ?? 10));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isPlatformAdmin) loadEnv();
  }, [isPlatformAdmin, loadEnv]);

  const groupedEnv = useMemo(() => {
    const map = new Map<string, PlatformEnvItem[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const it of envItems) {
      const list = map.get(it.group) || [];
      list.push(it);
      map.set(it.group, list);
    }
    return GROUP_ORDER.map((g) => ({
      group: g,
      label: GROUP_LABELS[g] || g,
      items: map.get(g) || [],
    })).filter((g) => g.items.length > 0);
  }, [envItems]);

  const notifTypes = useMemo(
    () => (user ? notificationTypesForUser(user) : []),
    [user]
  );

  async function saveNotificationPrefs() {
    if (!user) return;
    setSavingNotif(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_prefs: notifPrefs }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      const allowed = notificationTypesForUser(user);
      setNotifPrefs(
        normalizeNotificationPrefs(json.data?.notification_prefs, allowed)
      );
      ui.success("通知偏好已保存");
    } finally {
      setSavingNotif(false);
    }
  }

  function startEdit(it: PlatformEnvItem) {
    if (!it.editable) return;
    setEditingKey(it.key);
    setDraftValue(it.secret ? "" : it.edit_value);
  }

  function cancelEdit() {
    setEditingKey(null);
    setDraftValue("");
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      ui.error("姓名和手机号必填");
      return;
    }
    const ok = await ui.confirm({
      title: "确认保存个人资料？",
      description: "将更新姓名、手机号与邮箱；手机号和邮箱可用于登录。",
      confirmText: "确认保存",
    });
    if (!ok) return;
    setSavingProfile(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      setUser(json.data);
      updateUser(json.data);
      setName(json.data.name || "");
      setEmail(json.data.email || "");
      setPhone(json.data.phone || "");
      ui.success("个人资料已保存");
      router.refresh();
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) {
      ui.error("请填写当前密码");
      return;
    }
    if (newPassword.length < 10) {
      ui.error("新密码至少 10 位，并同时包含字母和数字");
      return;
    }
    if (newPassword !== confirmPassword) {
      ui.error("两次输入的新密码不一致");
      return;
    }
    const ok = await ui.confirm({
      title: "确认修改密码？",
      description: "修改后请使用新密码登录。",
      confirmText: "确认修改",
    });
    if (!ok) return;
    setSavingPassword(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          password: newPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("修改失败", json.error);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      ui.success("密码已修改");
    } finally {
      setSavingPassword(false);
    }
  }

  async function savePoolRule(e: React.FormEvent) {
    e.preventDefault();
    const ok = await ui.confirm({
      title: "确认修改公海回收规则？",
      description: `将未跟进回收天数设置为 ${days} 天，会影响后续自动回收。`,
      confirmText: "保存规则",
    });
    if (!ok) return;
    const res = await fetch("/api/company/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pool_recycle_days: Number(days) }),
    });
    const json = await res.json();
    if (!res.ok) ui.error("保存失败", json.error);
    else {
      setDays(String(json.data.pool_recycle_days));
      ui.success("规则已保存", `超过 ${json.data.pool_recycle_days} 天未跟进将回收至公海`);
    }
  }

  async function saveQuoteRules(e: React.FormEvent) {
    e.preventDefault();
    const ok = await ui.confirm({
      title: "确认保存报价规则？",
      description: "将影响后续报价是否需要审批，以及客户确认链接的有效期与查看次数。",
      confirmText: "保存规则",
    });
    if (!ok) return;
    setSavingQuote(true);
    try {
      const res = await fetch("/api/company/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote_settings: {
            approval_amount: Number(quoteAmount),
            approval_discount_pct: Number(quoteDiscount),
            share_valid_days: Number(quoteShareDays),
            share_max_views: Number(quoteShareViews),
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      const qs = json.data.quote_settings;
      setQuoteAmount(String(qs.approval_amount));
      setQuoteDiscount(String(qs.approval_discount_pct));
      setQuoteShareDays(String(qs.share_valid_days));
      setQuoteShareViews(String(qs.share_max_views));
      ui.success("报价规则已保存");
    } finally {
      setSavingQuote(false);
    }
  }

  async function saveOneEnv(it: PlatformEnvItem) {
    const value = draftValue.trim();
    const ok = await ui.confirm({
      title: value ? `确认保存 ${it.label}？` : `确认清除 ${it.label} 的覆盖？`,
      description: value
        ? `将写入数据库覆盖，立即生效。`
        : `将清除数据库覆盖，回退到环境文件/系统值。`,
      confirmText: value ? "确认保存" : "确认清除",
    });
    if (!ok) return;
    setEnvSaving(true);
    try {
      const res = await fetch("/api/platform/env", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: { [it.key]: value } }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      setEnvItems((json.data?.items || []) as PlatformEnvItem[]);
      setEditingKey(null);
      setDraftValue("");
      ui.success(
        value ? "已保存覆盖" : "已清除覆盖",
        it.key
      );
    } finally {
      setEnvSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-sm text-[var(--color-muted)]">
          {isPlatformAdmin ? "个人资料与平台环境变量" : "个人资料与公司规则"}
        </p>
      </div>

      <section className="surface max-w-2xl p-5 md:p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold">手机导航</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            仅影响手机端。简洁=底部导航栏；完整=无底栏，点左上角「菜单」从左侧栏进入全部功能。电脑端始终为左侧栏。
          </p>
        </div>
        <div
          className="inline-flex rounded-lg border border-[var(--color-border)] bg-white p-0.5"
          role="group"
          aria-label="手机导航样式"
        >
          {(["compact", "full"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition",
                mobileNav === v
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              )}
              aria-pressed={mobileNav === v}
              onClick={() => setMobileNav(v)}
            >
              {MOBILE_NAV_LABELS[v]}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end border-t border-[var(--color-border)] pt-4">
          <Button
            type="button"
            disabled={savingUi || mobileNav === uiPrefs.mobile_nav}
            onClick={() => void saveUiPrefs()}
          >
            {savingUi ? "保存中…" : "保存手机导航"}
          </Button>
        </div>
      </section>

      <section className="surface max-w-2xl p-5 md:p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold">个人资料</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            可修改姓名、手机号、邮箱；手机号必填，邮箱可选，均需全平台唯一。
          </p>
        </div>

        {!user ? (
          <div className="space-y-3" aria-busy aria-label="加载中">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="field">
                <label>姓名</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>角色</label>
                <div className="input flex items-center bg-slate-50 text-[var(--color-muted)]">
                  {ROLE_LABELS[user.role]}
                </div>
              </div>
              <div className="field">
                <label>手机号</label>
                <input
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="例如 13800000000"
                  inputMode="tel"
                  required
                />
              </div>
              <div className="field">
                <label>邮箱（可选）</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
              <p className="text-xs text-[var(--color-muted)]">
                {user.role === "super_admin" && !user.act_as_company_id
                  ? "平台账号"
                  : user.act_as_company_name
                    ? `当前公司视图：${user.act_as_company_name}`
                    : null}
              </p>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? "保存中…" : "保存资料"}
              </Button>
            </div>
          </form>
        )}
      </section>

      {user && notifTypes.length > 0 && (
        <section className="surface max-w-2xl p-5 md:p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold">通知偏好</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              按你的角色（{ROLE_LABELS[user.role]}
              {user.act_as_company_name ? ` · ${user.act_as_company_name}` : ""}
              ）可选类型；关闭后系统将不再向你推送该类通知。
            </p>
          </div>
          <ul className="divide-y divide-[var(--color-border)]">
            {notifTypes.map((t) => (
              <li
                key={t}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {NOTIFICATION_TYPE_LABELS[t]}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                    {NOTIFICATION_TYPE_HINTS[t]}
                  </div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={notifPrefs[t] !== false}
                    onChange={(e) =>
                      setNotifPrefs((prev) => ({
                        ...prev,
                        [t]: e.target.checked,
                      }))
                    }
                  />
                  <span className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-[var(--color-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-accent)]/40 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
                  <span className="sr-only">开启 {NOTIFICATION_TYPE_LABELS[t]}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end border-t border-[var(--color-border)] pt-4">
            <Button
              type="button"
              disabled={savingNotif}
              onClick={() => void saveNotificationPrefs()}
            >
              {savingNotif ? "保存中…" : "保存通知偏好"}
            </Button>
          </div>
        </section>
      )}

      {user && (
        <section className="surface max-w-2xl p-5 md:p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold">修改密码</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              需验证当前密码；新密码至少 10 位，并同时包含字母和数字。
            </p>
          </div>
          <form onSubmit={savePassword} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="field">
                <label>当前密码</label>
                <input
                  className="input"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="field">
                <label>新密码</label>
                <input
                  className="input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="至少 6 位"
                  required
                />
              </div>
              <div className="field">
                <label>确认新密码</label>
                <input
                  className="input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="再输入一次"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end border-t border-[var(--color-border)] pt-4">
              <Button type="submit" disabled={savingPassword}>
                {savingPassword ? "修改中…" : "修改密码"}
              </Button>
            </div>
          </form>
        </section>
      )}

      {user && (user.role !== "super_admin" || user.act_as_company_id) && (
        <form onSubmit={savePoolRule} className="surface max-w-2xl space-y-3 p-5 md:p-6">
          <div>
            <h2 className="text-base font-semibold">公海回收规则</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              由公司管理员或销售经理制定。私海客户超过设定天数未写跟进记录，将自动进入公海。
            </p>
          </div>
          <div className="field max-w-xs">
            <label>未跟进回收天数</label>
            <input
              className="input"
              type="number"
              min={1}
              max={365}
              value={days}
              disabled={!canEdit}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
          {canEdit ? (
            <Button type="submit">保存规则</Button>
          ) : (
            <div className="text-sm text-[var(--color-muted)]">
              当前角色仅可查看，修改请联系管理员或销售经理
            </div>
          )}
        </form>
      )}

      {user && (user.role !== "super_admin" || user.act_as_company_id) && (
        <form onSubmit={saveQuoteRules} className="surface max-w-2xl space-y-3 p-5 md:p-6">
          <div>
            <h2 className="text-base font-semibold">报价规则</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              仅公司管理员可改。超过金额或折扣阈值需审批；客户确认链接按下方有效期与查看次数生效。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field">
              <label>审批金额阈值（元）</label>
              <input
                className="input"
                type="number"
                min={0}
                step="100"
                value={quoteAmount}
                disabled={!canEditQuote}
                onChange={(e) => setQuoteAmount(e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--color-muted)]">报价合计超过此金额需审批</p>
            </div>
            <div className="field">
              <label>审批折扣阈值（%）</label>
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                step="1"
                value={quoteDiscount}
                disabled={!canEditQuote}
                onChange={(e) => setQuoteDiscount(e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--color-muted)]">任一行折扣超过此比例需审批</p>
            </div>
            <div className="field">
              <label>客户链接有效期（天）</label>
              <input
                className="input"
                type="number"
                min={1}
                max={365}
                value={quoteShareDays}
                disabled={!canEditQuote}
                onChange={(e) => setQuoteShareDays(e.target.value)}
              />
            </div>
            <div className="field">
              <label>有效期内最多查看次数</label>
              <input
                className="input"
                type="number"
                min={1}
                max={9999}
                value={quoteShareViews}
                disabled={!canEditQuote}
                onChange={(e) => setQuoteShareViews(e.target.value)}
              />
            </div>
          </div>
          {canEditQuote ? (
            <Button type="submit" disabled={savingQuote}>
              {savingQuote ? "保存中…" : "保存报价规则"}
            </Button>
          ) : (
            <div className="text-sm text-[var(--color-muted)]">
              当前角色仅可查看，修改请联系公司管理员
            </div>
          )}
        </form>
      )}

      {isPlatformAdmin && (
        <div className="surface max-w-4xl space-y-5 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">平台环境变量</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                先查看当前生效值与来源，再点「编辑」修改可配置项。数据库覆盖优先于环境文件；改完立即生效。
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={envSaving || envLoading}
              onClick={() => loadEnv()}
            >
              刷新
            </Button>
          </div>

          {envLoading ? (
            <div className="space-y-3" aria-busy>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            groupedEnv.map((g) => (
              <section
                key={g.group}
                className="space-y-2 border-t border-[var(--color-border)] pt-4 first:border-0 first:pt-0"
              >
                <h3 className="text-sm font-medium">{g.label}</h3>
                <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
                  {g.items.map((it) => {
                    const isEditing = editingKey === it.key;
                    return (
                      <div key={it.key} className="space-y-3 p-3 sm:p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="font-medium">{it.label}</span>
                              <span className="font-mono text-xs text-[var(--color-muted)]">
                                {it.key}
                              </span>
                            </div>
                            {it.description ? (
                              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                                {it.description}
                              </p>
                            ) : null}
                            {!isEditing && (
                              <div className="mt-2 text-sm">
                                <span className="text-[var(--color-muted)]">
                                  {SOURCE_LABEL[it.source]}
                                  {" · "}
                                </span>
                                <span className="font-mono break-all">
                                  {it.value_masked || "（空）"}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            {isEditing ? (
                              <>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={envSaving}
                                  onClick={cancelEdit}
                                >
                                  取消
                                </Button>
                                <Button
                                  type="button"
                                  disabled={envSaving}
                                  onClick={() => saveOneEnv(it)}
                                >
                                  {envSaving ? "保存中…" : "保存"}
                                </Button>
                              </>
                            ) : (
                              <span
                                title={
                                  it.editable
                                    ? undefined
                                    : it.block_reason || "不可在线修改"
                                }
                              >
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={!it.editable || envSaving}
                                  onClick={() => startEdit(it)}
                                >
                                  编辑
                                </Button>
                              </span>
                            )}
                          </div>
                        </div>
                        {isEditing && (
                          <div className="field">
                            <label className="text-xs text-[var(--color-muted)]">
                              {it.secret
                                ? it.has_override
                                  ? "填写新值覆盖；留空保存将清除覆盖"
                                  : "填写后写入数据库覆盖"
                                : "填写覆盖值；留空保存将清除覆盖"}
                            </label>
                            <input
                              className="input font-mono text-sm"
                              type={it.secret ? "password" : "text"}
                              autoComplete="off"
                              autoFocus
                              value={draftValue}
                              onChange={(e) => setDraftValue(e.target.value)}
                              placeholder={
                                it.secret
                                  ? it.value_masked
                                    ? `当前 ${it.value_masked}`
                                    : "输入密钥"
                                  : it.placeholder || "输入值"
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  saveOneEnv(it);
                                }
                                if (e.key === "Escape") cancelEdit();
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
