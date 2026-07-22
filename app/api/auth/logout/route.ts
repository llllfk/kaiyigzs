import { clearSessionCookie, getSessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { jsonOk } from "@/lib/api";

export async function POST() {
  const user = await getSessionUser();
  // 先清会话，避免前端干等审计写库
  await clearSessionCookie();
  if (user) {
    writeAuditLog({
      user,
      action: "logout",
      summary: `${user.email} 退出`,
    });
  }
  return jsonOk({ ok: true });
}
