/** 每个预付费音色默认可训练次数（展示分母 / 分配默认值） */
export const VOICE_TRAINING_TIMES_LIMIT = 15;

/** 单次语音合成文案字数上限 */
export const VOICE_SYNTH_TEXT_MAX = 200;

/** 合成可选 ICL 版本（与火山 model_type / Resource-Id 对应） */
export type VoiceIclModelType = 1 | 4 | 5;

export const VOICE_ICL_OPTIONS: {
  modelType: VoiceIclModelType;
  label: string;
  hint: string;
}[] = [
  { modelType: 1, label: "声音复刻 ICL 1.0", hint: "通常更清晰、杂音少" },
  { modelType: 5, label: "声音复刻 ICL 3.0", hint: "更新一档，情感更强" },
];

export const DEFAULT_VOICE_ICL_MODEL_TYPE: VoiceIclModelType = 5;

export function normalizeVoiceIclModelType(raw: unknown): VoiceIclModelType {
  const n = Number(raw);
  if (n === 1 || n === 5) return n;
  // 旧值 4（ICL 2.0）归到 5
  if (n === 4) return 5;
  return DEFAULT_VOICE_ICL_MODEL_TYPE;
}

/** model_type → X-Api-Resource-Id */
export function resourceIdForIclModelType(modelType: VoiceIclModelType): string {
  return modelType === 1 ? "seed-icl-1.0" : "seed-icl-2.0";
}
