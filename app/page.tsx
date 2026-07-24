import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "super_admin" && !user.act_as_company_id) redirect("/platform");
  redirect("/dashboard");
}
