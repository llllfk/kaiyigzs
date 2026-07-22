import { PortalPageSkeleton } from "@/components/ui/Skeleton";

/** 立刻进入目标页内容区，避免卡在上一页等假进度条 */
export default function PortalLoading() {
  return <PortalPageSkeleton />;
}
