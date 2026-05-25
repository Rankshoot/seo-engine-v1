import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import ProjectLayoutClient from "@/components/dashboard/ProjectLayoutClient";
import {
  adminPanelPathFromProjectsAdmin,
  isReservedProjectSlug,
} from "@/lib/projects/reserved-project-slugs";
import { getMaintenanceMode } from "@/lib/admin/platform-settings-runtime";

/**
 * Project shell — auth only on the server. Project / stats / brief / list data
 * load client-side via TanStack Query in `ProjectLayoutClient` so navigation
 * is never blocked on DB round-trips.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const maintenance = await getMaintenanceMode();
  if (maintenance.enabled) {
    const msg = maintenance.message?.trim();
    redirect(msg ? `/maintenance?message=${encodeURIComponent(msg)}` : "/maintenance");
  }

  const { id } = await params;

  const adminPath = adminPanelPathFromProjectsAdmin(`/projects/${id}`);
  if (adminPath) redirect(adminPath);

  if (isReservedProjectSlug(id)) {
    if (id.toLowerCase() === "new") redirect("/projects/new");
    redirect("/dashboard");
  }

  return <ProjectLayoutClient projectId={id}>{children}</ProjectLayoutClient>;
}
