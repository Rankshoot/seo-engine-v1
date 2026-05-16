import { Suspense } from "react";
import { AdminContentDashboard } from "@/components/admin/AdminContentDashboard";
import { Skeleton } from "@/components/Skeleton";

function ContentPageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-24 rounded-card" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

export default function AdminContentPage() {
  return (
    <Suspense fallback={<ContentPageFallback />}>
      <AdminContentDashboard />
    </Suspense>
  );
}
