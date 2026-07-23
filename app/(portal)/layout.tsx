import { redirect } from "next/navigation";
import { getSessionUser, withCompanyContext } from "@/lib/auth";
import { AppShell } from "@/components/shared/AppShell";
import { loadUserUiPrefs } from "@/lib/ui-prefs.server";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const raw = await getSessionUser();
  if (!raw) redirect("/login");
  const user = withCompanyContext(raw);
  const uiPrefs = await loadUserUiPrefs(user.id);

  // 未读数由 AppShell 客户端拉取，避免每次站内跳转都阻塞布局查库
  return (
    <AppShell user={user} initialUiPrefs={uiPrefs}>
      {children}
    </AppShell>
  );
}
