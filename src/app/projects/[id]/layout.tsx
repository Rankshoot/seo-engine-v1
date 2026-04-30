import { notFound, redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import ProjectLayoutClient from "@/components/dashboard/ProjectLayoutClient";
import { getProject, getProjectStats, getProjects } from "@/app/actions/project-actions";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const { id } = await params;
  const [projectRes, statsRes, allProjectsRes] = await Promise.all([
    getProject(id),
    getProjectStats(id),
    getProjects(),
  ]);

  if (!projectRes.success || !projectRes.data) notFound();

  return (
    <ProjectLayoutClient 
      project={projectRes.data} 
      stats={statsRes.data ?? undefined}
      allProjects={allProjectsRes.data ?? []}
    >
      {children}
    </ProjectLayoutClient>
  );
}
