import type { SessionUser } from "@/types";

export type NavLeaf = { href: string; label: string };

export type NavEntry =
  | { type: "link"; href: string; label: string }
  | { type: "group"; id: string; label: string; children: NavLeaf[] };

export function pathActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/platform" || href === "/team") return false;
  return pathname.startsWith(href + "/");
}

/** 门户侧栏菜单（桌面 / 完整手机菜单） */
export function navFor(user: SessionUser): NavEntry[] {
  const acting = Boolean(user.act_as_company_id);
  if (user.role === "super_admin" && !acting) {
    return [
      {
        type: "group",
        id: "platform",
        label: "平台",
        children: [
          { href: "/platform", label: "平台概况" },
          { href: "/companies", label: "公司管理" },
          { href: "/platform/voices", label: "音色管理" },
        ],
      },
      {
        type: "group",
        id: "system",
        label: "系统",
        children: [
          { href: "/audit", label: "审计日志" },
          { href: "/settings", label: "设置" },
        ],
      },
    ];
  }

  const entries: NavEntry[] = [
    { type: "link", href: "/dashboard", label: "工作台" },
    {
      type: "group",
      id: "customers",
      label: "客户",
      children: [
        { href: "/customers", label: "客户" },
        { href: "/pool", label: "公海" },
      ],
    },
    {
      type: "group",
      id: "sales",
      label: "销售",
      children: [
        { href: "/opportunities", label: "商机" },
        { href: "/quotes", label: "报价" },
        { href: "/tasks", label: "待办" },
      ],
    },
    {
      type: "group",
      id: "insights",
      label: "洞察",
      children: [
        { href: "/knowledge", label: "知识库" },
        { href: "/competitors", label: "竞品" },
        { href: "/insights", label: "分析" },
        { href: "/reports", label: "经营报表" },
        { href: "/uploads", label: "解析记录" },
        { href: "/voices/records", label: "声音合成" },
      ],
    },
  ];

  const collab: NavLeaf[] = [{ href: "/notifications", label: "通知" }];
  if (
    user.role === "company_admin" ||
    user.role === "sales_manager" ||
    acting
  ) {
    collab.push({ href: "/team", label: "团队" });
  }
  entries.push({ type: "group", id: "collab", label: "协作", children: collab });

  const system: NavLeaf[] = [];
  if (user.role === "company_admin" || acting) {
    system.push({ href: "/audit", label: "审计" });
  }
  system.push({ href: "/settings", label: "设置" });
  entries.push({ type: "group", id: "system", label: "系统", children: system });

  return entries;
}

/** 简洁底栏固定入口（按角色；不含「功能」页里的项） */
export function compactBottomItems(user: SessionUser): NavLeaf[] {
  const acting = Boolean(user.act_as_company_id);
  if (user.role === "super_admin" && !acting) {
    return [
      { href: "/platform", label: "平台" },
      { href: "/companies", label: "公司" },
      { href: "/apps", label: "功能" },
      { href: "/audit", label: "审计" },
      { href: "/settings", label: "设置" },
    ];
  }
  return [
    { href: "/dashboard", label: "工作台" },
    { href: "/customers", label: "客户" },
    { href: "/apps", label: "功能" },
    { href: "/tasks", label: "待办" },
    { href: "/knowledge", label: "知识库" },
  ];
}

export function flattenNavLeaves(entries: NavEntry[]): NavLeaf[] {
  const out: NavLeaf[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.type === "link") {
      if (!seen.has(e.href)) {
        seen.add(e.href);
        out.push({ href: e.href, label: e.label });
      }
      continue;
    }
    for (const c of e.children) {
      if (!seen.has(c.href)) {
        seen.add(c.href);
        out.push(c);
      }
    }
  }
  return out;
}

/** 简洁模式下「功能」页展示的入口（侧栏有、底栏没有） */
export function compactExtraNavLinks(user: SessionUser): NavLeaf[] {
  const bottomHrefs = new Set(compactBottomItems(user).map((i) => i.href));
  return flattenNavLeaves(navFor(user)).filter((l) => !bottomHrefs.has(l.href));
}
