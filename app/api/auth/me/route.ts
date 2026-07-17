import { getSessionUser } from "@/lib/auth";
import { jsonOk, jsonError } from "@/lib/api";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError("未登录", 401);
  return jsonOk(user);
}
