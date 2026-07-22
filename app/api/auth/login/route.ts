import { NextRequest } from "next/server";
import { loginWithAccountPassword, AuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const account = String(body.account || body.email || body.phone || "").trim();
    const password = String(body.password || "");
    if (!account || !password) {
      throw new AuthError("请输入手机号/邮箱和密码", 400);
    }
    const user = await loginWithAccountPassword(account, password);
    writeAuditLog({
      user,
      action: "login",
      summary: `${user.phone || user.email || user.name} 登录`,
      ip: request.headers.get("x-forwarded-for"),
    });
    return jsonOk(user);
  } catch (err) {
    return handleApiError(err);
  }
}
