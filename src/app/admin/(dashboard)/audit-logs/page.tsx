import { Suspense } from "react";
import { AdminAuditLogsDashboard } from "@/components/admin/AdminAuditLogsDashboard";
import { Skeleton } from "@/components/Skeleton";

function AuditLogsPageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-24 rounded-card" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

export default function AdminAuditLogsPage() {
  return (
    <Suspense fallback={<AuditLogsPageFallback />}>
      <AdminAuditLogsDashboard />
    </Suspense>
  );
}
