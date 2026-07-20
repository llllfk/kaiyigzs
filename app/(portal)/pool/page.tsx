"use client";

import { useCallback, useEffect, useState } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useUi } from "@/components/ui/Feedback";
import { customerLabel } from "@/lib/utils";
import { EMPTY_PAGE_META, type PageMeta } from "@/lib/pagination";
import { ROLE_LABELS, type UserRole } from "@/types";
import { CardListSkeleton } from "@/components/ui/Skeleton";

type PoolItem = {
  id: number;
  company_name: string | null;
  name: string;
  industry: string | null;
  source: string | null;
  last_touch_at: string | null;
  released_at: string | null;
};

type TeamUser = { id: number; name: string; role: string };

export default function PoolPage() {
  const ui = useUi();
  const [items, setItems] = useState<PoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [days, setDays] = useState(7);
  const [recycled, setRecycled] = useState(0);
  const [canAssign, setCanAssign] = useState(false);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [q, setQ] = useState("");
  const [assignTarget, setAssignTarget] = useState<PoolItem | null>(null);
  const [assignOwner, setAssignOwner] = useState("");
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(
    async (opts?: { keyword?: string; page?: number; pageSize?: number }) => {
      const keyword = opts?.keyword ?? q;
      const p = opts?.page ?? page;
      const size = opts?.pageSize ?? pageSize;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: keyword,
          page: String(p),
          pageSize: String(size),
        });
        const res = await fetch(`/api/pool?${params}`);
        const json = await res.json();
        if (!res.ok) {
          ui.error("加载公海失败", json.error);
          return;
        }
        setItems(json.data.items || []);
        setTotal(Number(json.data.total ?? json.data.items?.length ?? 0));
        setDays(json.data.recycle_days || 7);
        setRecycled(json.data.recycled_just_now || 0);
        setCanAssign(Boolean(json.data.can_assign));
        if (json.meta) {
          setMeta(json.meta);
          if (json.meta.page !== p) setPage(json.meta.page);
        }
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, q, ui]
  );

  useEffect(() => {
    Promise.all([fetch("/api/users"), fetch("/api/auth/me")])
      .then(async ([usersRes, meRes]) => {
        const [usersJson, meJson] = await Promise.all([usersRes.json(), meRes.json()]);
        const myId = meJson.data?.id != null ? Number(meJson.data.id) : NaN;
        if (usersJson.data) {
          setTeam(
            usersJson.data.filter((u: TeamUser) => {
              const roleOk =
                u.role === "sales" ||
                u.role === "sales_manager" ||
                u.role === "company_admin";
              if (!roleOk) return false;
              if (!Number.isFinite(myId)) return true;
              return Number(u.id) !== myId;
            })
          );
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  function onSearch() {
    if (page === 1) load({ keyword: q, page: 1 });
    else setPage(1);
  }

  async function claim(c: PoolItem) {
    const ok = await ui.confirm({
      title: "确认领取客户？",
      description: `将「${customerLabel(c)}」领取到你的私海，之后需按时跟进，超时会按规则回收。`,
      confirmText: "确认领取",
    });
    if (!ok) return;
    const res = await fetch("/api/pool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim", customer_id: c.id }),
    });
    const json = await res.json();
    if (!res.ok) ui.error("领取失败", json.error);
    else {
      ui.success("领取成功", "客户已进入你的私海");
      await load();
    }
  }

  function openAssign(c: PoolItem) {
    setAssignTarget(c);
    setAssignOwner("");
  }

  function closeAssign() {
    if (assigning) return;
    setAssignTarget(null);
    setAssignOwner("");
  }

  async function confirmAssign() {
    if (!assignTarget) return;
    if (!assignOwner) {
      ui.error("请选择销售", "请选择要分配给谁");
      return;
    }
    const target = team.find((u) => String(u.id) === assignOwner);
    setAssigning(true);
    try {
      const res = await fetch("/api/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim",
          customer_id: assignTarget.id,
          owner_id: Number(assignOwner),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        ui.error("分配失败", json.error);
        return;
      }
      ui.success("分配成功", `已分配给 ${target?.name || "所选销售"}`);
      setAssignTarget(null);
      setAssignOwner("");
      await load();
    } finally {
      setAssigning(false);
    }
  }

  async function runRecycle() {
    const ok = await ui.confirm({
      title: "立即执行公海回收？",
      description: `将按当前规则（超过 ${days} 天未跟进）扫描私海客户并回收至公海。`,
      confirmText: "立即回收",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch("/api/pool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "recycle" }),
    });
    const json = await res.json();
    if (!res.ok) ui.error("回收失败", json.error);
    else {
      ui.success("回收完成", `共回收 ${json.data?.recycled || 0} 个客户`);
      await load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            公海
            <span className="ml-2 text-base font-semibold text-[var(--color-accent)]">
              {total}
            </span>
            <span className="ml-1 text-sm font-normal text-[var(--color-muted)]">个客户</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)]">
            未分配或超时未跟进的客户池。当前规则：超过{" "}
            <span className="font-semibold text-[var(--color-accent)]">{days}</span>{" "}
            天未跟进自动回收
            {recycled > 0 ? ` · 本次打开已回收 ${recycled} 个` : ""}
            {q.trim() ? ` · 当前筛选 ${items.length} 个` : ""}
          </p>
        </div>
        {canAssign && (
          <Button variant="secondary" onClick={runRecycle}>
            立即回收
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-64 max-w-full shrink-0">
          <input
            className="input"
            placeholder="搜索公海客户"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
          />
        </div>
        <Button variant="secondary" onClick={onSearch}>
          搜索
        </Button>
      </div>

      <div
        className={`pool-card-grid grid w-full gap-3 grid-cols-1${items.length >= 2 ? " sm:grid-cols-2" : ""}`}
        style={{
          ["--pool-cols" as string]: String(Math.min(4, Math.max(1, items.length || 1))),
        }}
      >
        {loading && <CardListSkeleton count={4} className="col-span-full sm:grid-cols-2" />}
        {!loading && items.length === 0 && (
          <div className="text-sm text-[var(--color-muted)]">暂无公海客户</div>
        )}
        {!loading &&
          items.map((c) => (
          <div
            key={c.id}
            className="surface card-interactive relative h-full w-full p-4"
          >
            <AppLink
              href={`/customers/${c.id}`}
              className="break-words font-semibold text-[var(--color-accent)]"
            >
              {c.company_name || c.name}
            </AppLink>
            <div className="mt-0.5 text-sm">{c.name}</div>
            <div className="mt-1 text-xs text-[var(--color-muted)]">
              {c.industry || "未填行业"} · {c.source || "未填来源"}
            </div>
            <div className="mt-1 text-xs text-[var(--color-muted)]">
              最近触达：
              {c.last_touch_at
                ? new Date(c.last_touch_at).toLocaleString("zh-CN")
                : "—"}
            </div>
            <div className="card-actions flex flex-col items-stretch gap-2">
              <Button onClick={() => claim(c)}>领取到私海</Button>
              {canAssign && (
                <Button variant="secondary" onClick={() => openAssign(c)}>
                  分配
                </Button>
              )}
            </div>
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

      <Modal
        open={Boolean(assignTarget)}
        title="分配客户"
        description={
          assignTarget
            ? `将「${customerLabel(assignTarget)}」分配给指定销售`
            : undefined
        }
        onClose={closeAssign}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeAssign} disabled={assigning}>
              取消
            </Button>
            <Button type="button" onClick={() => void confirmAssign()} disabled={assigning || !assignOwner}>
              {assigning ? "分配中…" : "确认分配"}
            </Button>
          </>
        }
      >
        <div className="field">
          <label className="text-sm font-medium">分配给谁</label>
          <Select
            value={assignOwner}
            onChange={setAssignOwner}
            placeholder="请选择销售"
            searchable
            options={team.map((u) => ({
              value: String(u.id),
              label: `${u.name}（${ROLE_LABELS[u.role as UserRole] || u.role}）`,
            }))}
          />
        </div>
      </Modal>
    </div>
  );
}
