export type StageChangeSource =
  | "create"
  | "edit"
  | "funnel"
  | "manual"
  | "ai_accept"
  | "review_sync";

export const STAGE_CHANGE_SOURCE_LABELS: Record<StageChangeSource, string> = {
  create: "新建商机",
  edit: "编辑保存",
  funnel: "漏斗拖拽",
  manual: "手动调整",
  ai_accept: "采纳 AI 建议",
  review_sync: "复盘同步",
};
