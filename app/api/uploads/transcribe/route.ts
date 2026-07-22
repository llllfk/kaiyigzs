import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { handleApiError, jsonOk, jsonError } from "@/lib/api";
import {
  asrConfigured,
  formatCallDialogue,
  transcribeAudio,
} from "@/lib/transcribe";

/**
 * 仅语音识别 + 双人对话整理，不落库、不分析。
 * 供前端把结果填入文本框供用户校对后再上传。
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.company_id) return jsonError("缺少公司信息", 400);
    if (!(await asrConfigured(user.company_id))) {
      return jsonError(
        "未配置语音识别。请在公司管理配置豆包识别凭证，或设置全局 VOLC_ASR_API_KEY / APP_ID + ACCESS_TOKEN"
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const customerName = String(form.get("customer_name") || "").trim();

    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      return jsonError("请上传录音文件");
    }

    const blob = file as File;
    const body = Buffer.from(await blob.arrayBuffer());
    if (!body.length) return jsonError("录音文件为空");
    if (body.length > 200 * 1024 * 1024) {
      return jsonError("单文件不能超过 200MB");
    }

    const fileName = blob.name || "call-audio";
    const mime = blob.type || null;

    const { text: raw, provider, durationMs } = await transcribeAudio({
      fileName,
      mime,
      body,
      companyId: user.company_id,
      userId: user.id,
    });
    if (!raw.trim()) {
      return jsonError("语音识别结果为空，请换一段录音或手动粘贴转写");
    }

    const transcript = await formatCallDialogue({
      rawText: raw,
      customerName: customerName || null,
      companyId: user.company_id,
      userId: user.id,
    });

    return jsonOk({
      transcript,
      provider,
      duration_ms: durationMs ?? null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
