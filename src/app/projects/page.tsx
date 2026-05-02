import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import Sidebar from "@/components/dashboard/Sidebar";
import { getProjects } from "@/app/actions/project-actions";
import ProjectsClient from "@/components/projects/ProjectsClient";

export default async function ProjectsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const { data: projects } = await getProjects();

  return (
    <div className="min-h-screen flex bg-surface-primary">
      <Sidebar />
      <main className="flex-1 min-w-0 ml-[280px] p-6 lg:p-8">
        <ProjectsClient projects={projects ?? []} />
      </main>
    </div>
  );
}
