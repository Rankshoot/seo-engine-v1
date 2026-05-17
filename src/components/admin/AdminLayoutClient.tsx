"use client";

import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import type { AdminSession } from "@/types/admin";

export function AdminLayoutClient({
  admin,
  children,
}: {
  admin: AdminSession;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-primary">
      <AdminSidebar role={admin.role} />
      <main className="ml-[280px] min-h-screen">
        <div className="max-w-[1400px] mx-auto px-8 py-10">{children}</div>
      </main>
    </div>
  );
}
