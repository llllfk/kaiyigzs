/**
 * 公司 config JSON 的读写辅助（脱敏后返回前端）。
 */

import { maskCozeApiKey } from "@/lib/ai";
import { normalizeCozeDatasets } from "@/lib/coze-datasets";
import { decryptCompanyConfig } from "@/lib/config-crypto";

export type CompanyVolcAsrConfig = {
  api_key?: string;
  app_id?: string;
  access_token?: string;
  resource_id?: string;
};

/** 平台分配的声音复刻软配额：0 / 1 / 2 */
export type VoiceCloneSlots = 0 | 1 | 2;

export type CompanyConfig = {
  coze?: {
    api_key?: string;
    bot_id?: string;
    api_base?: string;
    dataset_id?: string;
    datasets?: { id?: string; name?: string; type?: string }[];
  };
  volc_asr?: CompanyVolcAsrConfig;
  /** 该公司可用的复刻音色槽位数（平台管理员设置） */
  voice_clone_slots?: VoiceCloneSlots;
  /**
   * 公司公用声音合成分钟数（复刻 + 官方共用）。
   * 平台管理员设置；0 表示未开通/不可合成。
   */
  synth_minutes_quota?: number;
};

export function normalizeVoiceCloneSlots(raw: unknown): VoiceCloneSlots {
  const n = Number(raw);
  if (n === 1 || n === 2) return n;
  return 0;
}

export function getCompanyVoiceCloneSlots(
  config: CompanyConfig | Record<string, unknown> | null | undefined
): VoiceCloneSlots {
  if (!config || typeof config !== "object") return 0;
  return normalizeVoiceCloneSlots(
    (config as CompanyConfig).voice_clone_slots
  );
}

/** 合成分钟配额：整数分钟，最小 0 */
export function normalizeSynthMinutesQuota(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 10_000_000);
}

export function getCompanySynthMinutesQuota(
  config: CompanyConfig | Record<string, unknown> | null | undefined
): number {
  if (!config || typeof config !== "object") return 0;
  return normalizeSynthMinutesQuota(
    (config as CompanyConfig).synth_minutes_quota
  );
}

export function sanitizeCompanyRow(row: Record<string, unknown>) {
  const config = decryptCompanyConfig((row.config || {}) as CompanyConfig & Record<string, unknown>);
  const coze = config.coze || {};
  const apiKey = String(coze.api_key || "");
  const datasets = normalizeCozeDatasets(coze as Record<string, unknown>);
  const volc = config.volc_asr || {};
  const volcApiKey = String(volc.api_key || "");
  const hasVolc = Boolean(volcApiKey.trim());
  const voiceCloneSlots = getCompanyVoiceCloneSlots(config);
  const synthMinutesQuota = getCompanySynthMinutesQuota(config);

  return {
    ...row,
    config: {
      ...config,
      voice_clone_slots: voiceCloneSlots,
      synth_minutes_quota: synthMinutesQuota,
      coze: {
        bot_id: coze.bot_id || "",
        api_base: coze.api_base || "",
        dataset_id:
          datasets.find((d) => d.type === "text")?.id || datasets[0]?.id || "",
        datasets,
        api_key_masked: maskCozeApiKey(apiKey),
        has_api_key: Boolean(apiKey),
      },
      volc_asr: {
        api_key_masked: maskCozeApiKey(volcApiKey),
        has_api_key: hasVolc,
        configured: hasVolc,
      },
    },
  };
}

/** 合并 PATCH 中的火山 ASR 字段；空字符串清空 API Key */
export function mergeVolcAsrConfig(
  prev: CompanyVolcAsrConfig | undefined,
  body: Record<string, unknown>
): CompanyVolcAsrConfig {
  const next: CompanyVolcAsrConfig = { ...(prev || {}) };

  if (body.volc_asr_api_key !== undefined) {
    const key = String(body.volc_asr_api_key || "").trim();
    // 空 = 清空；有值 = 覆盖。不再「留空保持原值」
    next.api_key = key === "__CLEAR__" ? "" : key;
  }
  if (body.volc_asr_app_id !== undefined) {
    next.app_id = String(body.volc_asr_app_id || "").trim();
  }
  if (body.volc_asr_access_token !== undefined) {
    const token = String(body.volc_asr_access_token || "").trim();
    next.access_token = token === "__CLEAR__" ? "" : token;
  }
  if (body.volc_asr_resource_id !== undefined) {
    next.resource_id = String(body.volc_asr_resource_id || "").trim();
  }

  return next;
}
