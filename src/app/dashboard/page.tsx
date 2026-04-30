import Sidebar from "@/components/dashboard/Sidebar";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getProjects } from "@/app/actions/project-actions";
import ProjectCard from "@/components/dashboard/ProjectCard";
import { PROJECT_CARD_GRID_HEIGHT_CLASS } from "@/components/dashboard/project-card-layout";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const displayName = user.firstName || user.emailAddresses[0]?.emailAddress?.split("@")[0] || "User";
  const { data: projects } = await getProjects();

  const hasProjects = projects.length > 0;

  return (
    <div className="min-h-screen bg-surface-primary flex">
      <Sidebar />

      <main className="flex-1 ml-[280px] p-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-xs text-text-tertiary mb-2">Dashboard</p>
            <h1 className="text-4xl font-black tracking-tight text-text-primary mb-1">
              Welcome back, <span className="gradient-text">{displayName}</span>
            </h1>
            <p className="text-text-tertiary">Your SEO automation command center.</p>
          </div>

          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/20 hover:from-brand-400 hover:to-brand-500 hover:-translate-y-0.5 transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Project
          </Link>
        </div>

        {hasProjects ? (
          <>
            {/* Projects */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-text-primary">Your Projects</h2>
              </div>

              <div className="grid grid-cols-1 items-stretch md:grid-cols-2 xl:grid-cols-3 gap-5">
                {projects.map(project => (
                  <ProjectCard key={project.id} project={project} />
                ))}

                <Link
                  href="/projects/new"
                  className={`border-2 border-dashed border-border-subtle rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-text-tertiary hover:border-brand-500/40 hover:text-brand-400 transition-all group ${PROJECT_CARD_GRID_HEIGHT_CLASS}`}
                >
                  <div className="w-10 h-10 rounded-xl border-2 border-dashed border-current flex items-center justify-center group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  </div>
                  <span className="text-xs font-bold">New Project</span>
                </Link>
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-24 h-24 rounded-3xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-4xl mb-6">
              🚀
            </div>
            <h2 className="text-2xl font-black text-text-primary mb-3">Start your first SEO campaign</h2>
            <p className="text-text-tertiary max-w-lg mb-3">
              Create a project with your domain and niche. SerpCraft will discover keywords with real search volume data, generate a 30-day content calendar, and write SEO-optimized blogs you can download and post.
            </p>
            <div className="flex items-center gap-6 text-xs text-text-tertiary mb-8">
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-brand-400" /> Real keyword data</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-accent-400" /> AI-generated blogs</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> 4 download formats</span>
            </div>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/20 hover:-translate-y-0.5 transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Create First Project
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
