import { redirect } from "next/navigation";
import { getSessionUser, withCompanyContext } from "@/lib/auth";
import { listCustomers } from "@/lib/customers-list";
import { EMPTY_PAGE_META } from "@/lib/pagination";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage() {
  const raw = await getSessionUser();
  if (!raw) redirect("/login");
  const user = withCompanyContext(raw);

  const { rows, meta } = await listCustomers(user, {
    q: "",
    page: 1,
    pageSize: 10,
    paginate: true,
  });

  // RSC props 需可序列化（pg Date → string）
  const initialList = JSON.parse(JSON.stringify(rows)) as typeof rows;
  const initialMeta = meta
    ? (JSON.parse(JSON.stringify(meta)) as typeof meta)
    : EMPTY_PAGE_META;

  return (
    <CustomersClient
      user={user}
      initialList={initialList}
      initialMeta={initialMeta}
    />
  );
}
