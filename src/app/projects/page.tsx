import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import Sidebar from "@/components/dashboard/Sidebar";
import { getProjects } from "@/app/actions/project-actions";
import { Project } from "@/lib/types";

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="glass-card p-6 group hover:border-brand-500/30 transition-all duration-300 block">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500/20 to-brand-700/20 border border-brand-500/20 flex items-center justify-center text-xl font-black text-brand-400">
          {project.name.charAt(0).toUpperCase()}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary bg-surface-elevated px-2 py-1 rounded-lg">
          {project.target_region.toUpperCase()}
        </span>
      </div>

      <h3 className="text-base font-bold text-text-primary group-hover:text-brand-400 transition-colors mb-1">
        {project.name}
      </h3>
      <p className="text-xs text-text-tertiary mb-1">{project.domain}</p>
      <p className="text-xs text-text-tertiary/70 line-clamp-2">{project.niche}</p>

      <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between">
        <span className="text-[10px] text-text-tertiary">
          {new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <span className="text-[10px] font-bold text-brand-400 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
          Open
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>
        </span>
      </div>
    </Link>
  );
}

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
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 text-white font-bold shadow-lg shadow-brand-500/20 hover:from-brand-400 hover:to-brand-500 hover:-translate-y-0.5 transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Project
          </Link>
        </div>

        {/* Grid */}
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => (
              <ProjectCard key={project.id} project={project} />
            ))}
            {/* Add Project Card */}
            <Link
              href="/projects/new"
              className="border-2 border-dashed border-border-subtle rounded-3xl p-8 flex flex-col items-center justify-center gap-3 text-text-tertiary hover:border-brand-500/40 hover:text-brand-400 transition-all group min-h-[200px]"
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
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 text-white font-bold shadow-lg shadow-brand-500/20 hover:-translate-y-0.5 transition-all"
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
