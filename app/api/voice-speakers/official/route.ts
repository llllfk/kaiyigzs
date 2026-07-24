import { requireSession, AuthError } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { listEnabledOfficialVoicesPublic } from "@/lib/volc-official-voices";

function requireCompanyId(user: Awaited<ReturnType<typeof requireSession>>) {
  if (!user.company_id) throw new AuthError("请先进入公司视图", 403);
  return user.company_id;
}

/** 公司端：仅返回平台已启用的官方音色（脱敏） */
export async function GET() {
  try {
    const user = await requireSession();
    requireCompanyId(user);
    const items = await listEnabledOfficialVoicesPublic();
    return jsonOk({ items });
  } catch (err) {
    return handleApiError(err);
  }
}
