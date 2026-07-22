/**
 * 火山豆包官方音色（seed-tts-2.0）精选目录 + 全平台启用列表
 * 启用 ID 存 platform_env.VOLC_OFFICIAL_VOICES_ENABLED（JSON 数组）
 */

import pool from "@/lib/db";
import { ensurePlatformEnvLoaded } from "@/lib/runtime-env";

export const OFFICIAL_VOICES_ENV_KEY = "VOLC_OFFICIAL_VOICES_ENABLED";
export const OFFICIAL_TTS_RESOURCE_ID = "seed-tts-2.0";

export type OfficialVoiceGender = "female" | "male";

export type OfficialVoiceDef = {
  speakerId: string;
  name: string;
  gender: OfficialVoiceGender;
  resourceId: typeof OFFICIAL_TTS_RESOURCE_ID;
  hint?: string;
};

/** 精选官方 2.0 音色（可后续在代码中增补） */
export const OFFICIAL_VOICE_CATALOG: OfficialVoiceDef[] = [
  {
    speakerId: "zh_female_xiaohe_uranus_bigtts",
    name: "小何 2.0",
    gender: "female",
    resourceId: OFFICIAL_TTS_RESOURCE_ID,
    hint: "通用女声，自然亲切",
  },
  {
    speakerId: "zh_female_vv_uranus_bigtts",
    name: "Vivi 2.0",
    gender: "female",
    resourceId: OFFICIAL_TTS_RESOURCE_ID,
    hint: "多语种，情感丰富",
  },
  {
    speakerId: "zh_female_qingxinnvsheng_uranus_bigtts",
    name: "清新女声 2.0",
    gender: "female",
    resourceId: OFFICIAL_TTS_RESOURCE_ID,
    hint: "清新淡雅",
  },
  {
    speakerId: "zh_female_sophie_uranus_bigtts",
    name: "魅力苏菲 2.0",
    gender: "female",
    resourceId: OFFICIAL_TTS_RESOURCE_ID,
  },
  {
    speakerId: "zh_female_cancan_uranus_bigtts",
    name: "灿灿 2.0",
    gender: "female",
    resourceId: OFFICIAL_TTS_RESOURCE_ID,
  },
  {
    speakerId: "zh_female_tianmeitaozi_uranus_bigtts",
    name: "甜美桃子 2.0",
    gender: "female",
    resourceId: OFFICIAL_TTS_RESOURCE_ID,
  },
  {
    speakerId: "zh_female_shuangkuaisisi_uranus_bigtts",
    name: "爽快思思 2.0",
    gender: "female",
    resourceId: OFFICIAL_TTS_RESOURCE_ID,
    hint: "爽朗活泼",
  },
  {
    speakerId: "zh_female_linjianvhai_uranus_bigtts",
    name: "邻家女孩 2.0",
    gender: "female",
    resourceId: OFFICIAL_TTS_RESOURCE_ID,
  },
  {
    speakerId: "zh_male_m191_uranus_bigtts",
    name: "云舟 2.0",
    gender: "male",
    resourceId: OFFICIAL_TTS_RESOURCE_ID,
    hint: "通用男声",
  },
  {
    speakerId: "zh_male_taocheng_uranus_bigtts",
    name: "小天 2.0",
    gender: "male",
    resourceId: OFFICIAL_TTS_RESOURCE_ID,
    hint: "年轻男声",
  },
  {
    speakerId: "zh_male_liufei_uranus_bigtts",
    name: "刘飞 2.0",
    gender: "male",
    resourceId: OFFICIAL_TTS_RESOURCE_ID,
  },
  {
    speakerId: "zh_male_ruyayichen_uranus_bigtts",
    name: "儒雅逸辰 2.0",
    gender: "male",
    resourceId: OFFICIAL_TTS_RESOURCE_ID,
  },
];

const CATALOG_BY_ID = new Map(
  OFFICIAL_VOICE_CATALOG.map((v) => [v.speakerId, v])
);

export function getOfficialVoiceDef(speakerId: string): OfficialVoiceDef | null {
  return CATALOG_BY_ID.get(String(speakerId || "").trim()) || null;
}

export function parseEnabledOfficialVoiceIds(raw: string | null | undefined): string[] {
  if (!raw || !String(raw).trim()) return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const item of parsed) {
      const id = String(item || "").trim();
      if (id && CATALOG_BY_ID.has(id) && !out.includes(id)) out.push(id);
    }
    return out;
  } catch {
    return [];
  }
}

export async function loadEnabledOfficialVoiceIds(): Promise<string[]> {
  await ensurePlatformEnvLoaded();
  const res = await pool.query(
    `SELECT value FROM platform_env WHERE key = $1 LIMIT 1`,
    [OFFICIAL_VOICES_ENV_KEY]
  );
  const fromDb = parseEnabledOfficialVoiceIds(res.rows[0]?.value);
  if (fromDb.length) return fromDb;
  // 无库覆盖时尝试 process.env（一般为空）
  return parseEnabledOfficialVoiceIds(process.env[OFFICIAL_VOICES_ENV_KEY]);
}

export async function saveEnabledOfficialVoiceIds(
  ids: string[]
): Promise<string[]> {
  await ensurePlatformEnvLoaded();
  const cleaned: string[] = [];
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (id && CATALOG_BY_ID.has(id) && !cleaned.includes(id)) cleaned.push(id);
  }
  const value = JSON.stringify(cleaned);
  if (cleaned.length === 0) {
    await pool.query(`DELETE FROM platform_env WHERE key = $1`, [
      OFFICIAL_VOICES_ENV_KEY,
    ]);
    delete process.env[OFFICIAL_VOICES_ENV_KEY];
  } else {
    await pool.query(
      `INSERT INTO platform_env (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [OFFICIAL_VOICES_ENV_KEY, value]
    );
    process.env[OFFICIAL_VOICES_ENV_KEY] = value;
  }
  return cleaned;
}

export async function listOfficialVoicesForPlatform() {
  const enabled = new Set(await loadEnabledOfficialVoiceIds());
  return OFFICIAL_VOICE_CATALOG.map((v) => ({
    ...v,
    enabled: enabled.has(v.speakerId),
  }));
}

export async function listEnabledOfficialVoicesPublic() {
  const enabled = await loadEnabledOfficialVoiceIds();
  return enabled
    .map((id) => CATALOG_BY_ID.get(id))
    .filter((v): v is OfficialVoiceDef => Boolean(v))
    .map((v) => ({
      speaker_id: v.speakerId,
      name: v.name,
      gender: v.gender,
      hint: v.hint || null,
    }));
}

export function assertOfficialSpeakerEnabled(
  speakerId: string,
  enabledIds: string[]
): OfficialVoiceDef {
  const def = getOfficialVoiceDef(speakerId);
  if (!def) throw new Error("不支持的官方音色");
  if (!enabledIds.includes(def.speakerId)) {
    throw new Error("该官方音色未对平台开放");
  }
  return def;
}
