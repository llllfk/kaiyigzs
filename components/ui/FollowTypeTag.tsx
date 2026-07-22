import { cn } from "@/lib/utils";
import { FOLLOW_TYPE_LABELS } from "@/types";

const TONE: Record<string, string> = {
  call: "bg-sky-50 text-sky-700 ring-sky-600/15",
  wechat: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  visit: "bg-amber-50 text-amber-800 ring-amber-600/15",
  email: "bg-slate-100 text-slate-700 ring-slate-500/15",
};

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.6 10.8c1.6 3.1 3.5 5 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function WechatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9.5 4C5.9 4 3 6.5 3 9.6c0 1.8.9 3.4 2.4 4.5l-.6 2.2 2.4-1.2c.7.2 1.5.3 2.3.3.2 0 .5 0 .7-.1-.1-.4-.2-.8-.2-1.2 0-3.1 2.9-5.6 6.4-5.6.2 0 .4 0 .6.1C16.4 5.7 13.3 4 9.5 4Zm-2.2 4.1a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Zm4.3 0a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z" />
      <path d="M21 14.2c0-2.5-2.4-4.5-5.3-4.5s-5.3 2-5.3 4.5 2.4 4.5 5.3 4.5c.6 0 1.2-.1 1.8-.2l2 .9-.5-1.8c1.2-.9 2-2.1 2-3.4Zm-7.1-.9a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4Zm3.6 0a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4Z" />
    </svg>
  );
}

function VisitIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS: Record<string, (p: { className?: string }) => React.ReactNode> = {
  call: PhoneIcon,
  wechat: WechatIcon,
  visit: VisitIcon,
  email: EmailIcon,
};

export function FollowTypeTag({
  type,
  className,
  labels,
}: {
  type: string | null | undefined;
  className?: string;
  /** 覆盖默认文案，如媒体类型用「通话」而非跟进类型的「电话」 */
  labels?: Record<string, string>;
}) {
  const key = type ? String(type) : "";
  const label = labels?.[key] || FOLLOW_TYPE_LABELS[key] || key || "—";
  const tone = TONE[key] || "bg-slate-100 text-slate-600 ring-slate-500/15";
  const Icon = ICONS[key];

  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tone,
        className
      )}
    >
      {Icon ? <Icon className="shrink-0" /> : null}
      <span>{label}</span>
    </span>
  );
}
