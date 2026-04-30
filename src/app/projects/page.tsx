import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import Sidebar from "@/components/dashboard/Sidebar";
import ProjectCard from "@/components/dashboard/ProjectCard";
import { PROJECT_CARD_GRID_HEIGHT_CLASS } from "@/components/dashboard/project-card-layout";
import { getProjects } from "@/app/actions/project-actions";

export default async function ProjectsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const { data: projects } = await getProjects();

  return (
    <div className="min-h-screen bg-surface-primary flex">
      <Sidebar />
      <main className="flex-1 ml-[280px] p-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-text-primary mb-1">
              Your <span className="gradient-text">Projects</span>
            </h1>
            <p className="text-text-tertiary">Each project is a separate SEO campaign with its own keywords, calendar, and blogs.</p>
          </div>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/20 hover:from-brand-400 hover:to-brand-500 hover:-translate-y-0.5 transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Project
          </Link>
        </div>

        {/* Grid */}
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 items-stretch md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => (
              <ProjectCard key={project.id} project={project} />
            ))}
            {/* Add Project Card */}
            <Link
              href="/projects/new"
              className={`border-2 border-dashed border-border-subtle rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-text-tertiary hover:border-brand-500/40 hover:text-brand-400 transition-all group ${PROJECT_CARD_GRID_HEIGHT_CLASS}`}
            >
              <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-current flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              </div>
              <span className="text-sm font-bold">New Project</span>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-24 h-24 rounded-3xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-4xl mb-6">
              🚀
            </div>
            <h2 className="text-2xl font-black text-text-primary mb-3">Create your first project</h2>
            <p className="text-text-tertiary max-w-md mb-8">
              A project holds everything for one SEO campaign — keywords, a 30-day content calendar, and AI-generated blogs ready to download.
            </p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/20 hover:-translate-y-0.5 transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Create Project
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
