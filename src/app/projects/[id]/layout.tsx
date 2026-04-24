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
      {/* `min-w-0` is critical: without it, `flex-1` refuses to shrink below
          the intrinsic width of its wide table children, which is what was
          pushing the keywords table beyond the viewport. */}
      <main className="flex-1 min-w-0 ml-[280px] p-6 lg:p-8">{children}</main>
    </div>
  );
}
