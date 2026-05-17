import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { AdminLayoutClient } from "@/components/admin/AdminLayoutClient";
import { requireAdmin } from "@/lib/admin/require-admin";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const result = await requireAdmin({ minRole: "support" });
  if (!result.ok) {
    if (result.status === 401) redirect("/sign-in");
    redirect("/admin/unauthorized");
  }

  return <AdminLayoutClient admin={result.admin}>{children}</AdminLayoutClient>;
}
