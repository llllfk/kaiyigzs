import { NextRequest } from "next/server";
import { loginWithEmailPassword, AuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email || "");
    const password = String(body.password || "");
    if (!email || !password) {
      throw new AuthError("请输入邮箱和密码", 400);
    }
    const user = await loginWithEmailPassword(email, password);
    await writeAuditLog({
      user,
      action: "login",
      summary: `${user.email} 登录`,
      ip: request.headers.get("x-forwarded-for"),
    });
    return jsonOk(user);
  } catch (err) {
    return handleApiError(err);
  }
}
