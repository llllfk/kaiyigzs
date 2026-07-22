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
import { formatDateTime } from "@/lib/utils";
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
  const [password, setPassword] = useState("Sales123!");
  const [submitting, setSubmitting] = useState(false);

  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState("active");
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
  const roleOptions = asCompanyAdmin
    ? [
        { value: "sales_manager", label: "销售经理" },
        { value: "sales", label: "销售" },
      ]
    : [{ value: "sales", label: "销售" }];

  function canManage(u: UserRow) {
    if (!me) return false;
    if (u.id === me.id) return false;
    if (u.role === "company_admin" || u.role === "super_admin") return false;
    // 仅公司管理员可编辑团队成员；销售经理只可查看/创建下属
    if (!asCompanyAdmin) return false;
    return u.role === "sales_manager" || u.role === "sales";
  }

  function openCreate() {
    setName("");
    setEmail("");
    setPhone("");
    setRole(roleOptions[0]?.value || "sales");
    setPassword("Sales123!");
    setOpen(true);
  }

  function openEdit(u: UserRow) {
    setEditTarget(u);
    setEditName(u.name || "");
    setEditEmail(u.email || "");
    setEditPhone(u.phone || "");
    setEditStatus(u.status === "inactive" ? "inactive" : "active");
    setEditPassword("");
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    const roleLabel =
      roleOptions.find((o) => o.value === role)?.label ||
      ROLE_LABELS[role as UserRole] ||
      role;
    const ok = await ui.confirm({
      title: "确认创建账号？",
      description: `将创建${roleLabel}账号「${name}」（${phone}${
        email ? ` / ${email}` : ""
      }），初始密码为所填密码。`,
      confirmText: "确认创建",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, role, password }),
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
    if (editPassword && editPassword.length < 6) {
      ui.error("密码至少 6 位");
      return;
    }
    const ok = await ui.confirm({
      title: "确认保存账号？",
      description: `将更新「${editName.trim()}」的账号信息${
        editPassword ? "，并重置密码" : ""
      }。`,
      confirmText: "保存",
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
      ui.success("账号已更新", editName.trim());
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
        description="可修改状态、姓名、手机号、邮箱；密码留空则不改"
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
            <p className="sm:col-span-2 text-xs text-[var(--color-muted)]">
              角色：{ROLE_LABELS[editTarget.role]}（不可在此修改）
            </p>
          </form>
        )}
      </Modal>

      {viewMode === "table" ? (
        loading ? (
          <TableSkeleton rows={6} cols={9} />
        ) : (
          <div className="surface overflow-x-auto">
            <table className="w-full min-w-[60rem] text-sm">
              <thead className="bg-slate-50 text-left text-[var(--color-muted)]">
                <tr>
                  <th className="w-14 whitespace-nowrap px-4 py-3">#</th>
                  <th className="whitespace-nowrap px-4 py-3">姓名</th>
                  <th className="whitespace-nowrap px-4 py-3">手机号</th>
                  <th className="whitespace-nowrap px-4 py-3">邮箱</th>
                  <th className="whitespace-nowrap px-4 py-3">角色</th>
                  <th className="whitespace-nowrap px-4 py-3">状态</th>
                  <th className="whitespace-nowrap px-4 py-3">创建时间</th>
                  <th className="whitespace-nowrap px-4 py-3">上次登录</th>
                  <th className="whitespace-nowrap px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-[var(--color-muted)]">
                      暂无成员
                    </td>
                  </tr>
                )}
                {list.map((u, i) => (
                  <tr key={u.id} className="border-t border-[var(--color-border)]">
                    <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">
                      {pageRowNo(meta, i)}
                    </td>
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3">{u.phone || "—"}</td>
                    <td className="px-4 py-3">{u.email || "—"}</td>
                    <td className="px-4 py-3">{ROLE_LABELS[u.role]}</td>
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
                      {canManage(u) ? (
                        <IconButton
                          icon="pencil"
                          label="编辑"
                          variant="secondary"
                          onClick={() => openEdit(u)}
                        />
                      ) : (
                        <span className="text-[var(--color-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
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
          {list.map((u) => (
            <div
              key={u.id}
              className="surface card-interactive relative h-full w-full p-4"
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
              </div>
              <div className="mt-1 text-xs text-[var(--color-muted)]">
                创建于 {formatDateTime(u.created_at)}
                {" · "}
                上次登录{" "}
                {u.last_login_at ? formatDateTime(u.last_login_at) : "从未登录"}
              </div>
              {canManage(u) ? (
                <div className="card-actions flex items-center gap-1.5">
                  <IconButton
                    icon="pencil"
                    label="编辑"
                    variant="secondary"
                    onClick={() => openEdit(u)}
                  />
                </div>
              ) : null}
            </div>
          ))}
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
