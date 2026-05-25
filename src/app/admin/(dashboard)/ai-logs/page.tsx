import { Suspense } from "react";
import { AdminAiLogsDashboard } from "@/components/admin/AdminAiLogsDashboard";
import { Skeleton } from "@/components/Skeleton";

function AiLogsPageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-24 rounded-card" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

export default function AdminAiLogsPage() {
  return (
    <Suspense fallback={<AiLogsPageFallback />}>
      <AdminAiLogsDashboard />
    </Suspense>
  );
}
