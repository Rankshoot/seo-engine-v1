import { Suspense } from "react";
import { AdminUsersDashboard } from "@/components/admin/AdminUsersDashboard";
import { Skeleton } from "@/components/Skeleton";

function UsersPageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-24 rounded-card" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<UsersPageFallback />}>
      <AdminUsersDashboard />
    </Suspense>
  );
}
