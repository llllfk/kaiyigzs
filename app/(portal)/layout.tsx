import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import pool from "@/lib/db";
import { AppShell } from "@/components/shared/AppShell";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let unread = 0;
  try {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [user.id]
    );
    unread = res.rows[0]?.c || 0;
  } catch {
    unread = 0;
  }

  return (
    <AppShell user={user} unread={unread}>
      {children}
    </AppShell>
  );
}
