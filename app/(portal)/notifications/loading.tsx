import { PageHeaderSkeleton, ListRowsSkeleton } from "@/components/ui/Skeleton";

export default function NotificationsLoading() {
  return (
    <div className="space-y-6" aria-busy aria-label="加载中">
      <PageHeaderSkeleton withAction={false} />
      <ListRowsSkeleton count={6} />
    </div>
  );
}
