import pool from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function PlatformPage() {
  try {
    const user = await requireSession();
    if (user.role !== "super_admin") redirect("/dashboard");
  } catch (e) {
    if (e instanceof AuthError) redirect("/login");
    throw e;
  }

  const [companies, users, customers] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM companies`),
    pool.query(`SELECT COUNT(*)::int AS c FROM users WHERE status='active'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM customers`),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">平台概况</h1>
        <p className="text-sm text-[var(--color-muted)]">跨公司运维视图（业务数据默认只读）</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card label="公司数" value={companies.rows[0]?.c || 0} />
        <Card label="活跃账号" value={users.rows[0]?.c || 0} />
        <Card label="客户总量" value={customers.rows[0]?.c || 0} />
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface p-5">
      <div className="text-sm text-[var(--color-muted)]">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}
