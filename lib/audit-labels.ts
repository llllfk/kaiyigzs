/** Audit log action categories (prefix of `action`, plus auth for login/logout) */

export const AUDIT_CATEGORY_OPTIONS = [
  { value: "", label: "全部类别" },
  { value: "auth", label: "登录认证" },
  { value: "user", label: "用户账号" },
  { value: "customer", label: "客户" },
  { value: "opportunity", label: "商机" },
  { value: "quote", label: "报价" },
  { value: "task", label: "待办" },
  { value: "pool", label: "公海" },
  { value: "kb", label: "知识库" },
  { value: "media", label: "上传记录" },
  { value: "company", label: "公司" },
  { value: "voice", label: "声音复刻" },
  { value: "platform", label: "平台" },
  { value: "competitor", label: "竞品" },
] as const;

export type AuditCategory = Exclude<
  (typeof AUDIT_CATEGORY_OPTIONS)[number]["value"],
  ""
>;

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  AUDIT_CATEGORY_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label])
);

export function auditCategoryOf(action: string): string {
  if (action === "login" || action === "logout") return "auth";
  const i = action.indexOf(".");
  return i > 0 ? action.slice(0, i) : action || "other";
}

export function auditCategoryLabel(action: string): string {
  const cat = auditCategoryOf(action);
  return CATEGORY_LABELS[cat] || cat;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  login: "登录",
  logout: "退出",
  "user.create": "创建用户",
  "user.update": "更新用户",
  "user.update_phone": "更新手机号",
  "user.update_profile": "更新个人资料",
  "customer.create": "创建客户",
  "customer.update": "修改客户",
  "customer.delete": "删除客户",
  "customer.assign": "分配客户",
  "opportunity.create": "创建商机",
  "opportunity.update": "更新商机",
  "opportunity.stage_change": "变更商机阶段",
  "opportunity.stage_accept": "采纳阶段建议",
  "opportunity.review": "商机复盘",
  "opportunity.delete": "删除商机",
  "quote.create": "创建报价",
  "quote.delete": "删除报价",
  "quote.void": "作废报价",
  "quote.submit": "提交报价审批",
  "quote.auto_approve": "报价自动通过",
  "quote.approve": "通过报价",
  "quote.reject": "驳回报价",
  "quote.revise": "修订报价",
  "quote.withdraw": "撤回报价",
  "quote.rule.update": "更新报价规则",
  "quote.share.create": "生成报价确认链接",
  "quote.share.revoke": "撤销报价确认链接",
  "task.delete": "删除待办",
  "task.remind": "催办待办",
  "task.remind_bulk": "一键催办",
  "pool.release": "放入公海",
  "pool.claim": "领取公海客户",
  "pool.assign": "分配公海客户",
  "pool.rule.update": "更新公海规则",
  "kb.folder.create": "创建知识库目录",
  "kb.folder.delete": "删除知识库目录",
  "kb.file.upload": "上传知识库文件",
  "kb.file.upload_local": "上传文件（仅本系统）",
  "kb.file.link_table": "关联表格存档到知识库",
  "kb.file.unlink_table": "解除表格存档关联",
  "kb.file.delete": "删除知识库文件",
  "kb.file.sync_failed": "知识库上传失败",
  "kb.file.delete_sync_failed": "删除同步失败记录",
  "kb.file.sync_from_remote": "从知识库同步文件",
  "kb.file.sync_from_coze": "从知识库同步文件",
  "kb.file.map": "映射表格到知识库",
  "kb.file.unmap": "解除表格映射",
  "media.upload": "上传媒体记录",
  "media.upload_analyze_failed": "上传解析失败",
  "media.confirm_analysis": "确认保存解析",
  "media.reanalyze": "重新解析媒体",
  "media.update": "更新解析记录",
  "media.rename": "重命名媒体文件",
  "media.delete": "删除解析记录",
  "company.create": "创建公司",
  "auth.enter_company_view": "进入公司业务视图",
  "auth.exit_company_view": "退出公司业务视图",
  "company.coze_config": "更新 AI 配置",
  "company.volc_asr_config": "更新豆包语音识别配置",
  "company.voice_clone_slots": "设置声音复刻槽位",
  "company.synth_minutes_quota": "设置声音合成分钟数",
  "voice.create": "创建复刻音色",
  "voice.train": "训练复刻音色",
  "voice.delete": "删除复刻音色",
  "voice.synthesize": "语音合成",
  "voice.synthesize_download": "下载合成音频",
  "platform.official_voices_update": "更新官方音色开放列表",
  "voice.platform_assign": "平台分配音色 Speaker ID",
  "voice.platform_update": "平台更新音色配置",
  "platform.env_update": "更新平台环境变量",
  "competitor.create": "添加竞品",
  "competitor.update": "更新竞品",
  "competitor.delete": "删除竞品",
  "seed.demo": "导入演示数据",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] || action;
}

/** 审计对象类型（不展示内部 id） */
export const AUDIT_TARGET_TYPE_LABELS: Record<string, string> = {
  company: "公司",
  user: "用户",
  customer: "客户",
  opportunity: "商机",
  opportunity_review: "商机复盘",
  quote: "报价",
  task: "待办",
  competitor: "竞品",
  kb_file: "知识库文件",
  kb_folder: "知识库目录",
  media_asset: "解析记录",
  voice_speaker: "复刻音色",
  official_voice: "官方音色",
  platform_env: "平台配置",
};

export function auditTargetTypeLabel(targetType: string | null | undefined): string {
  if (!targetType) return "—";
  return AUDIT_TARGET_TYPE_LABELS[targetType] || targetType;
}

const STAGE_CODE_LABELS: Record<string, string> = {
  lead: "新线索",
  contact: "沟通中",
  proposal: "报价中",
  won: "成交",
  lost: "流失",
};

/** 将摘要中的商机阶段英文码换成中文（兼容历史日志） */
export function localizeStageCodesInText(text: string): string {
  return text.replace(
    /\b(lead|contact|proposal|won|lost)\b/g,
    (code) => STAGE_CODE_LABELS[code] || code
  );
}

export function stageAuditLabel(stage: string | null | undefined): string {
  if (!stage) return "—";
  return STAGE_CODE_LABELS[stage] || stage;
}

/** Strip redundant verbs / IDs so table summary is scannable */
const SUMMARY_STRIP = [
  /^创建客户\s*/u,
  /^更新客户\s*/u,
  /^修改客户\s*/u,
  /^删除客户\s*/u,
  /^变更负责人\s*/u,
  /^创建商机\s*/u,
  /^创建账号\s*/u,
  /^创建公司\s*/u,
  /^创建竞品\s*/u,
  /^添加竞品\s*/u,
  /^删除竞品\s*/u,
  /^创建知识库目录\s*/u,
  /^删除知识库目录\s*/u,
  /^上传知识库文件\s*/u,
  /^删除知识库文件\s*/u,
  /^删除知识库侧失败\s*/u,
  /^上传失败\s*/u,
  /^上传失败（未保存文件）\s*/u,
  /^上传解析失败（未保存文件）\s*/u,
  /^上传(通话|微信)\s*/u,
  /^将客户\s*/u,
  /^公海客户\s*/u,
  /^公海回收天数设为\s*/u,
  /^更新公司[「「][^」」]*[」」]AI 配置[（(]/u,
  /^绑定手机号\s*/u,
  /^清除手机号\s*/u,
  /^阶段\s*/u,
  /^采纳阶段建议\s*/u,
  /^复盘同步阶段\s*/u,
  /^提交(赢单|输单)复盘\s*/u,
];

export function readableAuditSummary(
  action: string,
  summary: string | null | undefined
): string {
  if (!summary?.trim()) return "—";
  let s = summary.replace(/\s+/g, " ").trim();

  const label = AUDIT_ACTION_LABELS[action];
  if (label && (s === label || s.startsWith(label))) {
    s = s.slice(label.length).replace(/^[：:\s]+/u, "");
  }
  for (const re of SUMMARY_STRIP) {
    s = s.replace(re, "");
  }

  s = localizeStageCodesInText(s);

  // Drop internal IDs in parentheses: （库 xxx / yyy）
  s = s.replace(/（库\s*[^）]+）/gu, "");
  s = s.replace(/（[^）]*\/\s*[^）]+）/gu, "");

  // Sync / error trails: keep name + short reason
  const errSep = s.search(/[：:]/);
  if (errSep >= 0 && (action.includes("fail") || action.includes("sync"))) {
    const head = s.slice(0, errSep).trim();
    let err = s.slice(errSep + 1).trim().split(/[。.\n]/u)[0] || "";
    if (err.length > 40) err = `${err.slice(0, 40)}…`;
    s = [head, err].filter(Boolean).join(" · ");
  }

  // AI config leftovers: 智能体=x，知识库=n个）
  s = s
    .replace(/^智能体\s*=\s*/u, "智能体 ")
    .replace(/，\s*知识库\s*=\s*/u, " · 知识库 ")
    .replace(/[）)]$/u, "")
    .replace(/\s*个$/u, " 个")
    .replace(/\s*(登录|退出)$/u, "");

  s = s.replace(/^[\s：:·，,]+|[\s：:·，,]+$/gu, "").trim();
  if (!s) return "—";
  if (s.length > 64) return `${s.slice(0, 64)}…`;
  return s;
}

/** Full original summary for tooltip */
export function fullAuditSummary(summary: string | null | undefined): string {
  return summary?.replace(/\s+/g, " ").trim() || "";
}

/** YYYY-MM-DD for local calendar day */
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Inclusive last N calendar days ending today */
export function lastNDaysRange(days = 7): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { from: toYmd(from), to: toYmd(to) };
}
