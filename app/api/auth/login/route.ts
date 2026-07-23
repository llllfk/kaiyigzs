import { NextRequest } from "next/server";
import { loginWithAccountPassword, AuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk } from "@/lib/api";
import { clientIp, enforceRateLimit } from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const account = String(body.account || body.email || body.phone || "").trim();
    const password = String(body.password || "");
    if (!account || !password) {
      throw new AuthError("请输入手机号/邮箱和密码", 400);
    }
    const ip = clientIp(request);
    await enforceRateLimit({ key:`login:ip:${ip}`, limit:20, windowSeconds:900, blockSeconds:900 });
    await enforceRateLimit({ key:`login:account:${account.toLowerCase()}`, limit:8, windowSeconds:900, blockSeconds:900 });
    const user = await loginWithAccountPassword(account, password, { ip, userAgent:request.headers.get("user-agent") || "" });
    writeAuditLog({
      user,
      action: "login",
      summary: `${user.phone || user.email || user.name} 登录`,
      ip,
    });
    return jsonOk(user);
  } catch (err) {
    return handleApiError(err);
  }
}
