import {
  cn,
  TASK_URGENCY_LABELS,
  type TaskUrgency,
} from "@/lib/utils";
import {
  CUSTOMER_STATUS_LABELS,
  STAGE_LABELS,
  type CustomerStatus,
  type OpportunityStage,
} from "@/types";

const BASE =
  "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset";
const FALLBACK = "bg-slate-100 text-slate-600 ring-slate-500/15";

const USER_LABELS: Record<string, string> = {
  active: "启用",
  inactive: "停用",
  disabled: "停用",
};

const COMPANY_LABELS: Record<string, string> = {
  active: "启用",
  inactive: "停用",
};

const TASK_LABELS: Record<string, string> = {
  pending: "待办",
  confirmed: "已确认",
  done: "已完成",
  cancelled: "已取消",
};

const MEDIA_LABELS: Record<string, string> = {
  uploaded: "已上传",
  analyzing: "解析中",
  analyzed: "已解析",
  failed: "失败",
};

const POOL_LABELS: Record<string, string> = {
  public: "公海",
  private: "私海",
};

const QUOTE_LABELS: Record<string, string> = {
  draft: "草稿",
  pending_approval: "待审批",
  approved: "已通过",
  confirmed: "客户已确认",
  rejected: "已驳回",
  void: "已作废",
};

const TONES = {
  customer: {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    paused: "bg-amber-50 text-amber-800 ring-amber-600/15",
    invalid: "bg-slate-100 text-slate-600 ring-slate-500/15",
  } satisfies Record<CustomerStatus, string>,
  user: {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    inactive: "bg-slate-100 text-slate-600 ring-slate-500/15",
    disabled: "bg-slate-100 text-slate-600 ring-slate-500/15",
  },
  company: {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    inactive: "bg-slate-100 text-slate-600 ring-slate-500/15",
  },
  task: {
    pending: "bg-amber-50 text-amber-800 ring-amber-600/15",
    confirmed: "bg-sky-50 text-sky-700 ring-sky-600/15",
    done: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    cancelled: "bg-slate-100 text-slate-600 ring-slate-500/15",
  },
  task_urgency: {
    overdue: "bg-rose-50 text-rose-700 ring-rose-600/15",
    urgent: "bg-orange-50 text-orange-800 ring-orange-600/15",
    normal: "bg-slate-100 text-slate-600 ring-slate-500/15",
  } satisfies Record<TaskUrgency, string>,
  media: {
    uploaded: "bg-slate-100 text-slate-700 ring-slate-500/15",
    analyzing: "bg-amber-50 text-amber-800 ring-amber-600/15",
    analyzed: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    failed: "bg-red-50 text-red-700 ring-red-600/15",
  },
  pool: {
    public: "bg-violet-50 text-violet-700 ring-violet-600/15",
    private: "bg-sky-50 text-sky-700 ring-sky-600/15",
  },
  quote: {
    draft: "bg-slate-100 text-slate-700 ring-slate-500/15",
    pending_approval: "bg-amber-50 text-amber-800 ring-amber-600/15",
    approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    confirmed: "bg-sky-50 text-sky-800 ring-sky-600/15",
    rejected: "bg-rose-50 text-rose-700 ring-rose-600/15",
    void: "bg-slate-100 text-slate-500 ring-slate-500/15",
  },
  stage: {
    lead: "bg-slate-100 text-slate-700 ring-slate-500/15",
    contact: "bg-sky-50 text-sky-700 ring-sky-600/15",
    proposal: "bg-amber-50 text-amber-800 ring-amber-600/15",
    won: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    lost: "bg-rose-50 text-rose-700 ring-rose-600/15",
  } satisfies Record<OpportunityStage, string>,
} as const;

const LABELS = {
  customer: CUSTOMER_STATUS_LABELS as Record<string, string>,
  user: USER_LABELS,
  company: COMPANY_LABELS,
  task: TASK_LABELS,
  task_urgency: TASK_URGENCY_LABELS as Record<string, string>,
  media: MEDIA_LABELS,
  pool: POOL_LABELS,
  quote: QUOTE_LABELS,
  stage: STAGE_LABELS as Record<string, string>,
} as const;

export type StatusKind = keyof typeof LABELS;

export function StatusTag({
  kind,
  value,
  className,
}: {
  kind: StatusKind;
  value: string | null | undefined;
  className?: string;
}) {
  const key = value ? String(value) : "";
  const labels = LABELS[kind];
  const tones = TONES[kind] as Record<string, string>;
  const label = key ? labels[key] || key : "—";
  const tone = key && tones[key] ? tones[key] : FALLBACK;

  return (
    <span className={cn(BASE, tone, className)}>
      {label}
    </span>
  );
}
