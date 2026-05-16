import { Suspense } from "react";
import { AdminSettingsDashboard } from "@/components/admin/AdminSettingsDashboard";
import { Skeleton } from "@/components/Skeleton";

function SettingsPageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-48 rounded-card" />
      <Skeleton className="h-64 rounded-card" />
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<SettingsPageFallback />}>
      <AdminSettingsDashboard />
    </Suspense>
  );
}
