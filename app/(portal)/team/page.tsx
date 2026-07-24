"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { Modal } from "@/components/ui/Modal";
import { useUi } from "@/components/ui/Feedback";
import { StatusTag } from "@/components/ui/StatusTag";
import { IconButton } from "@/components/ui/IconButton";
import { CardListSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { ViewModeToggle, useViewMode } from "@/components/ui/ViewModeToggle";
import { EMPTY_PAGE_META, pageRowNo, type PageMeta } from "@/lib/pagination";
import { pageCacheFetchJson, pageCachePeek } from "@/lib/page-cache";
import { formatDateTime, normalizePhone } from "@/lib/utils";
import { ROLE_LABELS, type UserRole } from "@/types";
import { useSessionUser } from "@/components/shared/SessionUserContext";

const TEAM_SEED_URL = "/api/users?page=1&pageSize=10";

type UserRow = {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  role: UserRole;
  status: string;
  manager_id: number | null;
  manager_name?: string | null;
  created_at: string;
  last_login_at?: string | null;
};

const STATUS_OPTIONS = [
  { value: "active", label: "启用" },
  { value: "inactive", label: "停用" },
];

export default function TeamPage() {
  const ui = useUi();
  const me = useSessionUser();
  const [viewMode, changeViewMode] = useViewMode("crm:team-view");
  const seed = pageCachePeek<{ data?: UserRow[]; meta?: PageMeta }>(TEAM_SEED_URL);
  const [list, setList] = useState<UserRow[]>(() => seed?.data || []);
  const [loading, setLoading] = useState(() => seed == null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PageMeta>(seed?.meta || EMPTY_PAGE_META);
  const hasRowsRef = useRef((seed?.data?.length || 0) > 0);
  hasRowsRef.current = list.length > 0;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("sales");
  const [managerId, setManagerId] = useState("");
  const [managerOptions, setManagerOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editRole, setEditRole] = useState("sales");
  const [editManagerId, setEditManagerId] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = opts?.force === true;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      const url = `/api/users?${params}`;
      const cached = pageCachePeek<{ data?: UserRow[]; meta?: PageMeta }>(url);
      if (!force && cached?.data) {
        setList(cached.data);
        if (cached.meta) setMeta(cached.meta);
        setLoading(false);
      } else {
        if (cached?.data) {
          setList(cached.data);
          if (cached.meta) setMeta(cached.meta);
        }
        const soft = hasRowsRef.current || Boolean(cached?.data);
        if (!soft) setLoading(true);
      }
      try {
        const { res, json } = await pageCacheFetchJson<{
          data?: UserRow[];
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

  const asCompanyAdmin =
    me?.role === "company_admin" || Boolean(me?.act_as_company_id);

  async function loadManagerOptions() {
    if (!asCompanyAdmin) {
      setManagerOptions([]);
      return [] as { value: string; label: string }[];
    }
    try {
      const res = await fetch("/api/users");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return [];
      const rows = (json.data || []) as UserRow[];
      const opts = rows
        .filter((u) => u.role === "sales_manager" && u.status === "active")
        .map((u) => ({
          value: String(u.id),
          label: `${u.name}${u.phone ? `（${u.phone}）` : ""}`,
        }));
      setManagerOptions(opts);
      return opts;
    } catch {
      return [];
    }
  }

  const roleOptions = asCompanyAdmin
    ? [
        { value: "sales_manager", label: "销售经理" },
        { value: "sales", label: "销售" },
      ]
    : [{ value: "sales", label: "销售" }];

  function isSelf(u: UserRow) {
    if (!me) return false;
    if (Number(u.id) === Number(me.id)) return true;
    const myPhone = normalizePhone(me.phone);
    const rowPhone = normalizePhone(u.phone);
    return Boolean(myPhone && rowPhone && myPhone === rowPhone);
  }

  function canManage(u: UserRow) {
    if (!me) return false;
    if (isSelf(u)) return false;
    if (u.role === "company_admin" || u.role === "super_admin") return false;
    // 仅公司管理员可编辑团队成员；销售经理只可查看/创建下属
    if (!asCompanyAdmin) return false;
    return u.role === "sales_manager" || u.role === "sales";
  }

  async function onMemberClick(u: UserRow) {
    if (isSelf(u)) {
      const go = await ui.confirm({
        title: "修改本人信息请到设置页面",
        description: "姓名、手机号、密码等请在「设置」中修改。",
        confirmText: "去设置",
        cancelText: "知道了",
      });
      if (go) window.location.assign("/settings");
      return;
    }
    if (canManage(u)) openEdit(u);
  }

  function openCreate() {
    setName("");
    setEmail("");
    setPhone("");
    setRole(roleOptions[0]?.value || "sales");
    setManagerId("");
    setPassword("");
    setOpen(true);
    if (asCompanyAdmin) {
      void loadManagerOptions().then((opts) => {
        if (opts.length === 1) setManagerId(opts[0].value);
      });
    } else {
      setManagerOptions([]);
    }
  }

  function openEdit(u: UserRow) {
    setEditTarget(u);
    setEditName(u.name || "");
    setEditEmail(u.email || "");
    setEditPhone(u.phone || "");
    setEditStatus(u.status === "inactive" ? "inactive" : "active");
    const nextRole =
      u.role === "sales_manager" || u.role === "sales" ? u.role : "sales";
    setEditRole(nextRole);
    setEditManagerId(
      nextRole === "sales" && u.manager_id != null ? String(u.manager_id) : ""
    );
    setEditPassword("");
    if (asCompanyAdmin) {
      void loadManagerOptions().then((opts) => {
        if (
          nextRole === "sales" &&
          !u.manager_id &&
          opts.length === 1
        ) {
          setEditManagerId(opts[0].value);
        }
      });
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    const roleLabel =
      roleOptions.find((o) => o.value === role)?.label ||
      ROLE_LABELS[role as UserRole] ||
      role;
    if (role === "sales" && asCompanyAdmin && !managerId) {
      ui.error("请选择所属销售经理");
      return;
    }
    const managerLabel =
      managerOptions.find((o) => o.value === managerId)?.label || "";
    const ok = await ui.confirm({
      title: "确认创建账号？",
      description:
        role === "sales"
          ? asCompanyAdmin
            ? `将创建销售账号「${name}」（${phone}${
                email ? ` / ${email}` : ""
              }），所属经理：${managerLabel || "未选择"}。`
            : `将创建下属销售账号「${name}」（${phone}${
                email ? ` / ${email}` : ""
              }），归属为您的直属销售。`
          : `将创建${roleLabel}账号「${name}」（${phone}${
              email ? ` / ${email}` : ""
            }），初始密码为所填密码。`,
      confirmText: "确认创建",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name,
        email,
        phone,
        role,
        password,
      };
      if (role === "sales" && asCompanyAdmin && managerId) {
        body.manager_id = Number(managerId);
      }
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("创建失败", json.error);
        return;
      }
      ui.success("账号已创建", `${name}（${phone}）`);
      setOpen(false);
      await load({ force: true });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    if (!editName.trim() || !editPhone.trim()) {
      ui.error("姓名和手机号必填");
      return;
    }
    if (editPassword && editPassword.length < 10) {
      ui.error("密码至少 10 位，并同时包含字母和数字");
      return;
    }
    const roleChanged =
      asCompanyAdmin &&
      (editRole === "sales" || editRole === "sales_manager") &&
      editRole !== editTarget.role;
    if (asCompanyAdmin && editRole === "sales" && !editManagerId) {
      ui.error("请选择所属销售经理");
      return;
    }
    const nextRoleLabel = ROLE_LABELS[editRole as UserRole] || editRole;
    const prevRoleLabel = ROLE_LABELS[editTarget.role] || editTarget.role;
    const nextManagerLabel =
      managerOptions.find((o) => o.value === editManagerId)?.label ||
      editManagerId;
    const prevManagerId =
      editTarget.manager_id == null ? "" : String(editTarget.manager_id);
    const managerChanged =
      asCompanyAdmin &&
      editRole === "sales" &&
      editManagerId !== prevManagerId;
    const ok = await ui.confirm({
      title: roleChanged ? "确认修改角色？" : "确认保存账号？",
      description: roleChanged
        ? `将把「${editName.trim()}」的角色从「${prevRoleLabel}」改为「${nextRoleLabel}」。${
            editTarget.role === "sales_manager" && editRole === "sales"
              ? `其名下销售将取消经理归属；本人将归属经理：${
                  nextManagerLabel || "未选择"
                }。`
              : ""
          }${
            editRole === "sales" &&
            editTarget.role === "sales" &&
            managerChanged
              ? `所属经理改为：${nextManagerLabel || "未选择"}。`
              : ""
          }${editPassword ? " 同时会重置密码。" : ""}`
        : `将更新「${editName.trim()}」的账号信息${
            managerChanged
              ? `，所属经理改为「${nextManagerLabel || "未选择"}」`
              : ""
          }${editPassword ? "，并重置密码" : ""}。`,
      confirmText: roleChanged ? "确认改角色" : "保存",
    });
    if (!ok) return;

    setEditing(true);
    try {
      const body: Record<string, unknown> = {
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        status: editStatus,
      };
      if (editPassword.trim()) body.password = editPassword.trim();
      if (asCompanyAdmin && roleChanged) body.role = editRole;
      if (asCompanyAdmin && editRole === "sales" && editManagerId) {
        body.manager_id = Number(editManagerId);
      }

      const res = await fetch(`/api/users/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        ui.error("保存失败", json.error);
        return;
      }
      ui.success(
        roleChanged ? "角色已更新" : "账号已更新",
        editName.trim()
      );
      setEditTarget(null);
      await load({ force: true });
    } finally {
      setEditing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">团队</h1>
          <p className="text-sm text-[var(--color-muted)]">
            公司管理员可创建与编辑经理、销售；销售经理可创建下属销售，不可编辑成员
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={changeViewMode} />
          <Button onClick={openCreate}>创建账号</Button>
        </div>
      </div>

      <Modal
        open={open}
        title="创建账号"
        description="新账号可使用手机号或邮箱登录"
        onClose={() => setOpen(false)}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" form="team-create-form" disabled={submitting}>
              {submitting ? "创建中…" : "创建账号"}
            </Button>
          </>
        }
      >
        <form
          id="team-create-form"
          onSubmit={createUser}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
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
          <div className="field">
            <label>角色</label>
            <Select value={role} onChange={setRole} options={roleOptions} />
          </div>
          {role === "sales" && asCompanyAdmin ? (
            <div className="field sm:col-span-2">
              <label>所属销售经理</label>
              <Select
                value={managerId}
                onChange={setManagerId}
                options={managerOptions}
                placeholder="请选择销售经理"
              />
              {managerOptions.length === 0 ? (
                <p className="mt-1 text-xs text-amber-700">
                  暂无可用销售经理，请先创建销售经理账号。
                </p>
              ) : null}
            </div>
          ) : null}
          {role === "sales" && !asCompanyAdmin ? (
            <p className="sm:col-span-2 text-xs text-[var(--color-muted)]">
              将自动归属为您的直属销售。
            </p>
          ) : null}
          <div className="field sm:col-span-2">
            <label>初始密码</label>
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        title="编辑账号"
        description="可修改状态、角色、所属经理、姓名、手机号、邮箱；密码留空则不改"
        onClose={() => !editing && setEditTarget(null)}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={editing}
              onClick={() => setEditTarget(null)}
            >
              取消
            </Button>
            <Button type="submit" form="team-edit-form" disabled={editing}>
              {editing ? "保存中…" : "保存"}
            </Button>
          </>
        }
      >
        {editTarget && (
          <form
            id="team-edit-form"
            onSubmit={submitEdit}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <div className="field">
              <label>姓名</label>
              <input
                className="input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>状态</label>
              <Select
                value={editStatus}
                onChange={setEditStatus}
                options={STATUS_OPTIONS}
              />
            </div>
            {asCompanyAdmin ? (
              <div className="field">
                <label>角色</label>
                <Select
                  value={editRole}
                  onChange={(v) => {
                    setEditRole(v);
                    if (v !== "sales") setEditManagerId("");
                    else if (
                      !editManagerId &&
                      editTarget.manager_id != null
                    ) {
                      setEditManagerId(String(editTarget.manager_id));
                    }
                  }}
                  options={[
                    { value: "sales_manager", label: "销售经理" },
                    { value: "sales", label: "销售" },
                  ]}
                />
              </div>
            ) : (
              <p className="field text-xs text-[var(--color-muted)] sm:col-span-1">
                角色：{ROLE_LABELS[editTarget.role]}（不可在此修改）
              </p>
            )}
            {asCompanyAdmin && editRole === "sales" ? (
              <div className="field sm:col-span-2">
                <label>所属销售经理</label>
                <Select
                  value={editManagerId}
                  onChange={setEditManagerId}
                  options={managerOptions.filter(
                    (o) => o.value !== String(editTarget.id)
                  )}
                  placeholder="请选择销售经理"
                />
                {managerOptions.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-700">
                    暂无可用销售经理，请先创建销售经理账号。
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="field">
              <label>手机号</label>
              <input
                className="input"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
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
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
            <div className="field sm:col-span-2">
              <label>新密码（留空不改）</label>
              <input
                className="input"
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="至少 6 位"
                autoComplete="new-password"
              />
            </div>
            {asCompanyAdmin && editRole !== editTarget.role ? (
              <p className="sm:col-span-2 text-xs text-amber-700">
                保存后角色将变为「{ROLE_LABELS[editRole as UserRole] || editRole}」，请确认权限是否合适。
              </p>
            ) : null}
          </form>
        )}
      </Modal>

      {viewMode === "table" ? (
        loading ? (
          <TableSkeleton rows={6} cols={10} />
        ) : (
          <div className="surface overflow-x-auto">
            <table className="w-full min-w-[66rem] text-sm">
              <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
                <tr>
                  <th className="w-14 whitespace-nowrap px-4 py-3">序号</th>
                  <th className="whitespace-nowrap px-4 py-3">姓名</th>
                  <th className="whitespace-nowrap px-4 py-3">手机号</th>
                  <th className="whitespace-nowrap px-4 py-3">邮箱</th>
                  <th className="whitespace-nowrap px-4 py-3">角色</th>
                  <th className="whitespace-nowrap px-4 py-3">所属经理</th>
                  <th className="whitespace-nowrap px-4 py-3">状态</th>
                  <th className="whitespace-nowrap px-4 py-3">创建时间</th>
                  <th className="whitespace-nowrap px-4 py-3">上次登录</th>
                  <th className="whitespace-nowrap px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-6 text-[var(--color-muted)]">
                      暂无成员
                    </td>
                  </tr>
                )}
                {list.map((u, i) => {
                  const rowClickable = isSelf(u) || canManage(u);
                  return (
                  <tr
                    key={u.id}
                    className={
                      rowClickable
                        ? "table-row-link cursor-pointer border-t border-[var(--color-border)]"
                        : "border-t border-[var(--color-border)]"
                    }
                    onClick={rowClickable ? () => void onMemberClick(u) : undefined}
                  >
                    <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">
                      {pageRowNo(meta, i)}
                    </td>
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3">{u.phone || "—"}</td>
                    <td className="px-4 py-3">{u.email || "—"}</td>
                    <td className="px-4 py-3">{ROLE_LABELS[u.role]}</td>
                    <td className="px-4 py-3">
                      {u.role === "sales" ? u.manager_name || "—" : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusTag kind="user" value={u.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--color-muted)]">
                      {formatDateTime(u.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--color-muted)]">
                      {u.last_login_at ? formatDateTime(u.last_login_at) : "从未登录"}
                    </td>
                    <td className="px-4 py-3">
                      {isSelf(u) ? (
                        <span className="text-sm text-[var(--color-accent)]">本人</span>
                      ) : canManage(u) ? (
                        <IconButton
                          icon="pencil"
                          label="编辑"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(u);
                          }}
                        />
                      ) : (
                        <span className="text-[var(--color-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : loading ? (
        <CardListSkeleton count={4} className="sm:grid-cols-2" />
      ) : list.length === 0 ? (
        <div className="text-sm text-[var(--color-muted)]">暂无成员</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {list.map((u) => {
            const isSelfCard = isSelf(u);
            const editable = canManage(u);
            const clickable = isSelfCard || editable;
            return (
              <div
                key={u.id}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                className={
                  clickable
                    ? "surface card-interactive relative h-full w-full cursor-pointer p-4"
                    : "surface relative h-full w-full p-4"
                }
                onClick={clickable ? () => void onMemberClick(u) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void onMemberClick(u);
                        }
                      }
                    : undefined
                }
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="card-corner-status">
                    <StatusTag kind="user" value={u.status} />
                  </div>
                  <div className="min-w-0 font-semibold">{u.name}</div>
                </div>
                <div className="mt-1 text-xs text-[var(--color-muted)]">
                  {u.phone || "—"}
                  {u.email ? ` · ${u.email}` : ""} · {ROLE_LABELS[u.role]}
                  {u.role === "sales" && u.manager_name
                    ? ` · 经理 ${u.manager_name}`
                    : ""}
                </div>
                <div className="mt-1 text-xs text-[var(--color-muted)]">
                  创建于 {formatDateTime(u.created_at)}
                  {" · "}
                  上次登录{" "}
                  {u.last_login_at ? formatDateTime(u.last_login_at) : "从未登录"}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
