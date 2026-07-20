import { StatusTag } from "@/components/ui/StatusTag";

/** @deprecated Prefer StatusTag kind="customer"; kept for existing imports. */
export function CustomerStatusTag({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  return <StatusTag kind="customer" value={status} className={className} />;
}
