import pool from "@/lib/db";
import {
  buildOwnerFilter,
  canSearchCustomersByOwner,
  getVisibleOwnerIds,
  narrowOwnerId,
} from "@/lib/permissions";
import { parseOwnerIdParam } from "@/lib/utils";
import { isCustomerStatus, type CustomerStatus, type SessionUser } from "@/types";
import {
  resolvePagination,
  type PageMeta,
} from "@/lib/pagination";

export type CustomerListRow = {
  id: number;
  public_id: string;
  company_name: string | null;
  name: string;
  phone: string | null;
  industry: string | null;
  source: string | null;
  status: CustomerStatus;
  owner_name?: string | null;
  opportunity_count?: number;
  last_follow_at?: string | null;
  created_at?: string;
  [key: string]: unknown;
};

export type ListCustomersQuery = {
  q?: string;
  owner_q?: string;
  from?: string;
  to?: string;
  status?: string;
  owner_id?: string | null;
  /** 默认 true；false 时最多返回 200 条且无 meta */
  paginate?: boolean;
  page?: number;
  pageSize?: number;
};

export class CustomersListError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "CustomersListError";
    this.status = status;
  }
}

/** 客户列表查询（API GET 与 RSC 首屏共用） */
export async function listCustomers(
  user: SessionUser,
  query: ListCustomersQuery = {}
): Promise<{ rows: CustomerListRow[]; meta?: PageMeta }> {
  const q = query.q?.trim() || "";
  const ownerQ = canSearchCustomersByOwner(user)
    ? query.owner_q?.trim() || ""
    : "";
  const from = query.from?.trim() || "";
  const to = query.to?.trim() || "";
  const statusParam = query.status?.trim() || "";
  const paginate = query.paginate !== false;
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;

  const owners = await getVisibleOwnerIds(user);
  const filter = buildOwnerFilter(owners, user.company_id, "c");
  const scopedOwnerId = narrowOwnerId(
    owners,
    parseOwnerIdParam(query.owner_id ?? null)
  );

  const params: unknown[] = [...filter.params];
  let where = filter.sql;

  if (scopedOwnerId != null) {
    params.push(scopedOwnerId);
    where += ` AND c.owner_id = $${params.length}`;
  }

  if (q) {
    params.push(`%${q}%`);
    where += ` AND (
        c.name ILIKE $${params.length}
        OR c.company_name ILIKE $${params.length}
        OR c.industry ILIKE $${params.length}
        OR c.phone ILIKE $${params.length}
      )`;
  }

  if (ownerQ) {
    params.push(`%${ownerQ}%`);
    where += ` AND u.name ILIKE $${params.length}`;
  }

  if (statusParam) {
    if (!isCustomerStatus(statusParam)) {
      throw new CustomersListError("客户状态无效，可选：跟进中 / 暂停 / 无效");
    }
    params.push(statusParam);
    where += ` AND c.status = $${params.length}`;
  }

  if (from) {
    params.push(from);
    where += ` AND c.created_at >= $${params.length}::date`;
  }
  if (to) {
    params.push(to);
    where += ` AND c.created_at < ($${params.length}::date + INTERVAL '1 day')`;
  }

  const fromSql = `FROM customers c
      LEFT JOIN users u ON u.id = c.owner_id
      WHERE ${where}`;

  const selectSql = `SELECT c.*, u.name AS owner_name,
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.customer_id = c.id) AS opportunity_count,
      (SELECT MAX(f.followed_at) FROM follow_ups f WHERE f.customer_id = c.id) AS last_follow_at`;

  if (!paginate) {
    const result = await pool.query(
      `${selectSql} ${fromSql} ORDER BY c.created_at DESC LIMIT 200`,
      params
    );
    return { rows: result.rows as CustomerListRow[] };
  }

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total ${fromSql}`,
    params
  );
  const total = countRes.rows[0]?.total ?? 0;
  const { meta, offset, limit } = resolvePagination(total, page, pageSize);

  const listParams = [...params, limit, offset];
  const result = await pool.query(
    `${selectSql} ${fromSql}
       ORDER BY c.created_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return { rows: result.rows as CustomerListRow[], meta };
}
