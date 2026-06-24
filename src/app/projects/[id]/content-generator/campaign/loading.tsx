import { Skeleton } from "@/components/Skeleton";

export default function CampaignLoading() {
  return (
    <div className="max-w-2xl space-y-8 pb-20 pt-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-28 rounded-[12px]" />
        ))}
      </div>
    </div>
  );
}
