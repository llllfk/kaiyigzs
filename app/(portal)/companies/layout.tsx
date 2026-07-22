import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function CompaniesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") {
    redirect(user ? "/dashboard" : "/login");
  }
  return children;
}
