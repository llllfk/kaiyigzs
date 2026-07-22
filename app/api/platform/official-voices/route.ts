import { NextRequest } from "next/server";
import { requireSession, AuthError, isActingAsCompany } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import {
  getOfficialVoiceDef,
  listOfficialVoicesForPlatform,
  OFFICIAL_TTS_RESOURCE_ID,
  saveEnabledOfficialVoiceIds,
} from "@/lib/volc-official-voices";
import {
  resolveVolcVoiceCredentials,
  synthesizeWithClone,
  volcVoiceCredsValid,
} from "@/lib/volc-voice";

function assertPlatformSuperAdmin(
  user: Awaited<ReturnType<typeof requireSession>>
) {
  if (user.role !== "super_admin" || isActingAsCompany(user)) {
    throw new AuthError("仅平台超级管理员可配置官方音色", 403);
  }
}

/** 目录 + 启用状态 */
export async function GET() {
  try {
    const user = await requireSession();
    assertPlatformSuperAdmin(user);
    const items = await listOfficialVoicesForPlatform();
    return jsonOk({
      items,
      enabled_ids: items.filter((v) => v.enabled).map((v) => v.speakerId),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/** 试听目录内任意官方音色（短文本合成，不要求已启用） */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    assertPlatformSuperAdmin(user);

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "preview");
    if (action !== "preview") return jsonError("不支持的操作");

    const speaker = String(body.speaker || "").trim();
    const def = getOfficialVoiceDef(speaker);
    if (!def) return jsonError("不支持的官方音色", 400);

    const creds = await resolveVolcVoiceCredentials();
    if (!volcVoiceCredsValid(creds) || !creds) {
      return jsonError("未配置声音复刻凭证", 400);
    }

    const previewText =
      String(body.text || "").trim() ||
      `您好，我是${def.name}，这是官方音色试听效果。`;

    const { audio } = await synthesizeWithClone({
      creds,
      speakerId: def.speakerId,
      text: previewText.slice(0, 80),
      resourceId: OFFICIAL_TTS_RESOURCE_ID,
      voiceSource: "official",
      uid: `crm-platform-preview-${user.id}`,
      format: "mp3",
    });

    return jsonOk({
      speaker_id: def.speakerId,
      name: def.name,
      demo_audio: `data:audio/mpeg;base64,${audio.toString("base64")}`,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/** 保存全平台启用的官方音色 ID */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireSession();
    assertPlatformSuperAdmin(user);

    const body = await request.json().catch(() => ({}));
    const raw = body.enabled_ids;
    if (!Array.isArray(raw)) {
      return jsonError("请提交 enabled_ids 数组");
    }
    const ids = raw.map((x: unknown) => String(x || "").trim()).filter(Boolean);
    const enabled = await saveEnabledOfficialVoiceIds(ids);

    await writeAuditLog({
      user,
      companyId: null,
      action: "platform.official_voices_update",
      targetType: "platform_env",
      summary: `更新全平台官方音色：已启用 ${enabled.length} 个`,
    });

    const items = await listOfficialVoicesForPlatform();
    return jsonOk({ enabled_ids: enabled, items });
  } catch (err) {
    return handleApiError(err);
  }
}
