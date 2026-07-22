/**
 * 平台环境变量：数据库覆盖 + 注入 process.env。
 * 优先级：platform_env 表 > 进程/文件环境变量。
 */

import pool from "@/lib/db";
import { maskCozeApiKey } from "@/lib/ai";

export type PlatformEnvGroup =
  | "session"
  | "coze"
  | "asr"
  | "voice"
  | "openai"
  | "storage"
  | "other";

export type PlatformEnvDef = {
  key: string;
  group: PlatformEnvGroup;
  label: string;
  description?: string;
  secret?: boolean;
  placeholder?: string;
  /** 默认 true；false 仅展示不可改 */
  editable?: boolean;
  blockReason?: string;
};

/** 不开放编辑（仍可展示） */
export const PLATFORM_ENV_BLOCKED = new Set(["DATABASE_URL", "NODE_ENV"]);

export const PLATFORM_ENV_GROUP_LABELS: Record<PlatformEnvGroup, string> = {
  session: "会话与安全",
  coze: "扣子 Coze",
  asr: "语音识别（全局兜底）",
  voice: "声音复刻 / 合成",
  openai: "OpenAI / 通用 AI",
  storage: "对象存储",
  other: "其它",
};

export const PLATFORM_ENV_CATALOG: PlatformEnvDef[] = [
  {
    key: "DATABASE_URL",
    group: "session",
    label: "数据库连接",
    description: "当前服务正在使用，不可在线修改",
    secret: true,
    editable: false,
    blockReason: "修改会导致当前连接中断，请在部署环境中配置",
  },
  {
    key: "NODE_ENV",
    group: "session",
    label: "运行环境",
    description: "由进程启动时决定，不可在线修改",
    editable: false,
    blockReason: "由部署/启动命令决定，不可在此修改",
  },
  {
    key: "SESSION_SECRET",
    group: "session",
    label: "会话密钥",
    description: "登录 Cookie 签名密钥，生产环境务必修改",
    secret: true,
  },
  {
    key: "COZE_AI_API_KEY",
    group: "coze",
    label: "扣子 API Key",
    description: "全局 PAT；公司可覆盖",
    secret: true,
  },
  {
    key: "COZE_BOT_ID",
    group: "coze",
    label: "默认智能体 ID",
    description: "公司未绑定时的兜底智能体",
  },
  {
    key: "COZE_DATASET_ID",
    group: "coze",
    label: "默认知识库 ID",
    description: "公司未绑定时的兜底知识库",
  },
  {
    key: "COZE_API_BASE",
    group: "coze",
    label: "扣子 API 地址",
    placeholder: "https://api.coze.cn",
  },
  {
    key: "COZE_USER_ID",
    group: "coze",
    label: "扣子默认用户标识",
    placeholder: "sales-crm",
  },
  {
    key: "COZE_ASR_WORKFLOW_ID",
    group: "asr",
    label: "扣子 ASR 工作流 ID",
    description: "可选兜底；优先用火山直连",
  },
  {
    key: "COZE_ASR_FILE_PARAM",
    group: "asr",
    label: "ASR 工作流文件参数名",
    placeholder: "file_url",
  },
  {
    key: "VOLC_ASR_API_KEY",
    group: "asr",
    label: "火山豆包 ASR API Key",
    description: "全局兜底；公司可单独配置",
    secret: true,
  },
  {
    key: "VOLC_ASR_APP_ID",
    group: "asr",
    label: "火山 ASR App ID（旧版）",
  },
  {
    key: "VOLC_ASR_ACCESS_TOKEN",
    group: "asr",
    label: "火山 ASR Access Token（旧版）",
    secret: true,
  },
  {
    key: "VOLC_ASR_RESOURCE_ID",
    group: "asr",
    label: "火山 ASR Resource ID",
    placeholder: "volc.seedasr.auc",
  },
  {
    key: "VOLC_ASR_TIMEOUT_MS",
    group: "asr",
    label: "火山 ASR 超时（毫秒）",
    placeholder: "180000",
  },
  {
    key: "DOUBAO_API_KEY",
    group: "asr",
    label: "豆包 API Key（别名）",
    description: "与 VOLC_ASR_API_KEY 等价的备用字段",
    secret: true,
  },
  {
    key: "VOLC_VOICE_APP_ID",
    group: "voice",
    label: "声音复刻 App ID",
    description: "语音应用数字 ID；下单音色必填",
  },
  {
    key: "VOLC_VOICE_API_KEY",
    group: "voice",
    label: "声音复刻 / 合成 API Key",
    description: "新版推荐；未填时回退 VOLC_ASR_API_KEY",
    secret: true,
  },
  {
    key: "VOLC_VOICE_ACCESS_TOKEN",
    group: "voice",
    label: "声音复刻 Access Token（旧版）",
    secret: true,
  },
  {
    key: "VOLC_ACCESS_KEY_ID",
    group: "voice",
    label: "火山访问控制 Access Key ID",
    description: "音色下单 OpenAPI 用（控制台 → 访问控制 → 密钥）",
    secret: true,
  },
  {
    key: "VOLC_SECRET_ACCESS_KEY",
    group: "voice",
    label: "火山访问控制 Secret Access Key",
    secret: true,
  },
  {
    key: "OPENAI_API_KEY",
    group: "openai",
    label: "OpenAI API Key",
    secret: true,
  },
  {
    key: "AI_BASE_URL",
    group: "openai",
    label: "OpenAI 兼容 Base URL",
    placeholder: "https://api.openai.com/v1",
  },
  {
    key: "AI_MODEL",
    group: "openai",
    label: "对话模型",
    placeholder: "gpt-4o-mini",
  },
  {
    key: "WHISPER_MODEL",
    group: "openai",
    label: "Whisper 模型",
    placeholder: "whisper-1",
  },
  {
    key: "AI_TIMEOUT_MS",
    group: "openai",
    label: "AI 上游超时（毫秒）",
    placeholder: "150000",
  },
  {
    key: "COZE_STORAGE_URL",
    group: "storage",
    label: "对象存储 Endpoint",
  },
  {
    key: "COZE_STORAGE_BUCKET",
    group: "storage",
    label: "Bucket 名称",
  },
  {
    key: "COZE_STORAGE_AK",
    group: "storage",
    label: "Access Key",
    secret: true,
  },
  {
    key: "COZE_STORAGE_SK",
    group: "storage",
    label: "Secret Key",
    secret: true,
  },
  {
    key: "COZE_STORAGE_PUBLIC_BASE",
    group: "storage",
    label: "公网访问 Base URL",
  },
  {
    key: "PUBLIC_APP_BASE_URL",
    group: "other",
    label: "应用公网地址",
    description: "供火山 ASR 拉取临时音频等",
  },
  {
    key: "NEXT_PUBLIC_APP_URL",
    group: "other",
    label: "前端应用 URL",
    description: "可选；与 PUBLIC_APP_BASE_URL 类似",
  },
];

const CATALOG_KEYS = new Set(PLATFORM_ENV_CATALOG.map((d) => d.key));

/** 加载前的进程环境快照（视为「文件/系统」原始值） */
const baselineEnv = new Map<string, string>();
let baselineCaptured = false;
let loadPromise: Promise<void> | null = null;
let loaded = false;

function captureBaseline() {
  if (baselineCaptured) return;
  for (const def of PLATFORM_ENV_CATALOG) {
    const v = process.env[def.key];
    if (v != null && String(v) !== "") {
      baselineEnv.set(def.key, String(v));
    }
  }
  baselineCaptured = true;
}

function applyOverride(key: string, value: string) {
  process.env[key] = value;
}

function restoreBaseline(key: string) {
  const base = baselineEnv.get(key);
  if (base != null) process.env[key] = base;
  else delete process.env[key];
}

export async function ensurePlatformEnvLoaded(): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    captureBaseline();
    try {
      const res = await pool.query(`SELECT key, value FROM platform_env`);
      for (const row of res.rows) {
        const key = String(row.key || "");
        if (!key || PLATFORM_ENV_BLOCKED.has(key)) continue;
        if (!CATALOG_KEYS.has(key)) continue;
        applyOverride(key, String(row.value ?? ""));
      }
    } catch (err) {
      console.warn("[platform-env] load failed", err);
    } finally {
      loaded = true;
    }
  })();
  return loadPromise;
}

export type PlatformEnvItem = {
  key: string;
  group: PlatformEnvGroup;
  label: string;
  description?: string;
  secret: boolean;
  placeholder?: string;
  source: "override" | "env" | "unset";
  has_override: boolean;
  value_masked: string | null;
  /** 非密钥且存在库覆盖时，供表单回填 */
  edit_value: string;
  editable: boolean;
  block_reason: string | null;
};

export async function listPlatformEnv(): Promise<PlatformEnvItem[]> {
  await ensurePlatformEnvLoaded();
  const res = await pool.query(`SELECT key, value FROM platform_env`);
  const overrides = new Map<string, string>();
  for (const row of res.rows) {
    overrides.set(String(row.key), String(row.value ?? ""));
  }

  return PLATFORM_ENV_CATALOG.map((def) => {
    const editable =
      def.editable !== false && !PLATFORM_ENV_BLOCKED.has(def.key);
    const ov = editable ? overrides.get(def.key) : undefined;
    const hasOverride = ov != null && ov !== "";
    const base =
      baselineEnv.get(def.key) ??
      (process.env[def.key] != null && String(process.env[def.key]) !== ""
        ? String(process.env[def.key])
        : "");
    const effective = hasOverride ? ov! : base;
    let source: "override" | "env" | "unset" = "unset";
    if (hasOverride) source = "override";
    else if (base) source = "env";

    return {
      key: def.key,
      group: def.group,
      label: def.label,
      description: def.description,
      secret: Boolean(def.secret),
      placeholder: def.placeholder,
      source,
      has_override: hasOverride,
      value_masked: effective ? maskCozeApiKey(effective) : null,
      edit_value: !editable || def.secret ? "" : hasOverride ? ov! : "",
      editable,
      block_reason: editable ? null : def.blockReason || "不可在线修改",
    };
  });
}

/**
 * 保存覆盖：有值写入库并注入 process.env；空字符串删除覆盖并恢复 baseline。
 * 仅处理目录内、且出现在 updates 中的键。
 */
export async function savePlatformEnv(
  updates: Record<string, string>
): Promise<{ saved: string[]; cleared: string[] }> {
  await ensurePlatformEnvLoaded();
  const saved: string[] = [];
  const cleared: string[] = [];

  for (const [rawKey, rawVal] of Object.entries(updates)) {
    const key = String(rawKey || "").trim();
    if (!key || PLATFORM_ENV_BLOCKED.has(key) || !CATALOG_KEYS.has(key)) {
      continue;
    }
    const value = String(rawVal ?? "").trim();
    if (value) {
      await pool.query(
        `INSERT INTO platform_env (key, value, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
      applyOverride(key, value);
      saved.push(key);
    } else {
      await pool.query(`DELETE FROM platform_env WHERE key = $1`, [key]);
      restoreBaseline(key);
      cleared.push(key);
    }
  }

  return { saved, cleared };
}

/** 供 db 模块启动时非阻塞预热 */
export function warmPlatformEnv() {
  ensurePlatformEnvLoaded().catch((err) => {
    console.warn("[platform-env] warm failed", err);
  });
}
