import { NextRequest } from "next/server";
import { requireSession, AuthError, isActingAsCompany } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import {
  listPlatformEnv,
  savePlatformEnv,
  ensurePlatformEnvLoaded,
} from "@/lib/runtime-env";

function assertPlatformSuperAdmin(
  user: Awaited<ReturnType<typeof requireSession>>
) {
  if (user.role !== "super_admin" || isActingAsCompany(user)) {
    throw new AuthError("仅平台超级管理员可管理环境变量", 403);
  }
}

export async function GET() {
  try {
    const user = await requireSession();
    assertPlatformSuperAdmin(user);
    await ensurePlatformEnvLoaded();
    const items = await listPlatformEnv();
    return jsonOk(items);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSession();
    assertPlatformSuperAdmin(user);

    const body = await request.json().catch(() => ({}));
    const raw = body.values;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return jsonError("请提交 values 对象");
    }

    const updates: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      updates[String(k)] = v == null ? "" : String(v);
    }

    const result = await savePlatformEnv(updates);
    await writeAuditLog({
      user,
      companyId: null,
      action: "platform.env_update",
      targetType: "platform_env",
      summary: `更新平台环境变量：写入 ${result.saved.length} 项，清除覆盖 ${result.cleared.length} 项`,
    });

    const items = await listPlatformEnv();
    return jsonOk({ ...result, items });
  } catch (err) {
    return handleApiError(err);
  }
}
