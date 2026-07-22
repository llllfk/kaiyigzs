import { PageHeaderSkeleton, CardListSkeleton } from "@/components/ui/Skeleton";

export default function TasksLoading() {
  return (
    <div className="space-y-6" aria-busy aria-label="加载中">
      <PageHeaderSkeleton />
      <CardListSkeleton count={4} className="lg:grid-cols-2" />
    </div>
  );
}
