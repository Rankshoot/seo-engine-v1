import { Suspense } from "react";
import { AdminAiMemoryDashboard } from "@/components/admin/AdminAiMemoryDashboard";
import { Skeleton } from "@/components/Skeleton";

function AiMemoryPageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-24 rounded-card" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

export default function AdminAiMemoryPage() {
  return (
    <Suspense fallback={<AiMemoryPageFallback />}>
      <AdminAiMemoryDashboard />
    </Suspense>
  );
}
