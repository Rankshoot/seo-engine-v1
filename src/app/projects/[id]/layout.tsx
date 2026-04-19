import { notFound, redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import ProjectSidebar from "@/components/dashboard/ProjectSidebar";
import { getProject, getProjectStats } from "@/app/actions/project-actions";

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
  const [projectRes, statsRes] = await Promise.all([
    getProject(id),
    getProjectStats(id),
  ]);

  if (!projectRes.success || !projectRes.data) notFound();

  return (
    <div className="min-h-screen bg-surface-primary flex">
      <ProjectSidebar project={projectRes.data} stats={statsRes.data ?? undefined} />
      <main className="flex-1 ml-[280px] p-10">{children}</main>
    </div>
  );
}
