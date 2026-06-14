import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { getProjects } from "@/app/actions/project-actions";
import { getMaintenanceMode } from "@/lib/admin/platform-settings-runtime";
import ProjectsPageClient from "@/components/projects/ProjectsPageClient";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const maintenance = await getMaintenanceMode();
  if (maintenance.enabled) {
    const msg = maintenance.message?.trim();
    redirect(msg ? `/maintenance?message=${encodeURIComponent(msg)}` : "/maintenance");
  }

  const { data: projects } = await getProjects();
  const sp = await searchParams;
  const initialNewModalOpen = sp.new === "1" || sp.new === "true";

  const userName = [user.firstName, user.lastName].filter(Boolean).join(" ");

  return (
    <ProjectsPageClient
      projects={projects ?? []}
      initialNewModalOpen={initialNewModalOpen}
      userName={userName}
    />
  );
}
