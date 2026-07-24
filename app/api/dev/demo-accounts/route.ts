import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.DEV_DEMO_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const definitions = [
    ["超级管理员", "平台菜单", "admin@kaiyi.local", "13800000001", process.env.DEV_ADMIN_PASSWORD],
    ["公司管理员", "完整业务菜单", "company@kaiyi.local", "13800000002", process.env.DEV_COMPANY_PASSWORD],
    ["销售经理", "团队业务菜单", "manager@kaiyi.local", "13800000003", process.env.DEV_MANAGER_PASSWORD],
    ["销售", "个人业务菜单", "sales@kaiyi.local", "13800000004", process.env.DEV_SALES_PASSWORD],
  ];
  const accounts = definitions
    .filter((item) => Boolean(item[4]))
    .map(([label, hint, email, phone, password]) => ({ label, hint, email, phone, password }));

  return NextResponse.json(
    { data: accounts },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
