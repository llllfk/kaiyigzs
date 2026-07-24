import { PageHeaderSkeleton, CardListSkeleton } from "@/components/ui/Skeleton";

export default function PoolLoading() {
  return (
    <div className="space-y-6" aria-busy aria-label="加载中">
      <PageHeaderSkeleton />
      <CardListSkeleton count={4} className="sm:grid-cols-2" />
    </div>
  );
}
