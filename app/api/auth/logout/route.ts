import { clearSessionCookie, getSessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { jsonOk } from "@/lib/api";

export async function POST() {
  const user = await getSessionUser();
  if (user) {
    await writeAuditLog({
      user,
      action: "logout",
      summary: `${user.email} 退出`,
    });
  }
  await clearSessionCookie();
  return jsonOk({ ok: true });
}
