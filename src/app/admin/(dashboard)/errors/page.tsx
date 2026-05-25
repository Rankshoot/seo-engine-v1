import { Suspense } from "react";
import { AdminErrorsDashboard } from "@/components/admin/AdminErrorsDashboard";
import { Skeleton } from "@/components/Skeleton";

function ErrorsPageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-24 rounded-card" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

export default function AdminErrorsPage() {
  return (
    <Suspense fallback={<ErrorsPageFallback />}>
      <AdminErrorsDashboard />
    </Suspense>
  );
}
