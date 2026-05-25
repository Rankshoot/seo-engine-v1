import { Suspense } from "react";
import { AdminProjectsDashboard } from "@/components/admin/AdminProjectsDashboard";
import { Skeleton } from "@/components/Skeleton";

function ProjectsPageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-24 rounded-card" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

export default function AdminProjectsPage() {
  return (
    <Suspense fallback={<ProjectsPageFallback />}>
      <AdminProjectsDashboard />
    </Suspense>
  );
}
