import { Suspense } from "react";
import { AdminApiUsageDashboard } from "@/components/admin/AdminApiUsageDashboard";
import { Skeleton } from "@/components/Skeleton";

function ApiUsagePageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-24 rounded-card" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

export default function AdminApiUsagePage() {
  return (
    <Suspense fallback={<ApiUsagePageFallback />}>
      <AdminApiUsageDashboard />
    </Suspense>
  );
}
