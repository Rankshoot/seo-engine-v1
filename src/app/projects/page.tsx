import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { getProjects } from "@/app/actions/project-actions";
import ProjectsPageClient from "@/components/projects/ProjectsPageClient";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const { data: projects } = await getProjects();
  const sp = await searchParams;
  const initialNewModalOpen = sp.new === "1" || sp.new === "true";

  return <ProjectsPageClient projects={projects ?? []} initialNewModalOpen={initialNewModalOpen} />;
}
