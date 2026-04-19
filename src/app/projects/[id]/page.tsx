import Link from "next/link";
import { getProject, getProjectStats } from "@/app/actions/project-actions";
import { getCalendarWithBlogs } from "@/app/actions/blog-actions";
import type { CalendarEntryWithBlog, ProjectCompetitor } from "@/lib/types";
import { notFound } from "next/navigation";

const STEPS = [
  { num: 1, label: "Discover Keywords", desc: "Find keywords with real volume data", href: "keywords", color: "brand" },
  { num: 2, label: "Approve Keywords", desc: "Review and approve the best ones", href: "keywords", color: "cyan" },
  { num: 3, label: "Generate Calendar", desc: "30-day content plan with one blog/day", href: "calendar", color: "accent" },
  { num: 4, label: "Generate Blogs", desc: "AI writes each blog on demand", href: "blogs", color: "warm" },
];

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [projectRes, statsRes, calRes] = await Promise.all([
    getProject(id),
    getProjectStats(id),
    getCalendarWithBlogs(id),
  ]);

  if (!projectRes.success || !projectRes.data) notFound();

  const project = projectRes.data;
  const stats = statsRes.data;
  const recentEntries: CalendarEntryWithBlog[] = (calRes.data ?? []).slice(0, 5);

  const statCards = [
    { label: "Keywords Found", value: stats?.totalKeywords ?? 0, sub: `${stats?.approvedKeywords ?? 0} approved`, color: "from-brand-500/10 to-brand-700/5 border-brand-500/20" },
    { label: "Calendar Entries", value: stats?.calendarEntries ?? 0, sub: "30-day plan", color: "from-cyan-500/10 to-cyan-700/5 border-cyan-500/20" },
    { label: "Blogs Generated", value: stats?.blogsGenerated ?? 0, sub: "ready to download", color: "from-accent-500/10 to-accent-700/5 border-accent-500/20" },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-500/10 text-brand-400 border border-brand-500/20 mb-4">
          <span className="w-1 h-1 rounded-full bg-brand-400 animate-pulse" />
          Active Project
        </div>
        <h1 className="text-4xl font-black tracking-tight text-text-primary mb-1">
          {project.name}
        </h1>
        <p className="text-text-tertiary">{project.domain} · {project.niche} · {project.target_region.toUpperCase()}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCards.map(stat => (
          <div key={stat.label} className={`p-6 rounded-2xl bg-gradient-to-br ${stat.color} border`}>
            <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">{stat.label}</p>
            <p className="text-4xl font-black text-text-primary">{stat.value}</p>
            <p className="text-xs text-text-tertiary mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Workflow Steps */}
      <div className="glass-card p-6">
        <h2 className="font-bold text-text-primary mb-6">Your Workflow</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(step => (
            <Link
              key={step.num}
              href={`/projects/${id}/${step.href}`}
              className="group p-4 rounded-xl bg-surface-elevated border border-border-subtle hover:border-brand-500/30 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center text-sm font-black">
                  {step.num}
                </div>
                <svg className="w-4 h-4 text-text-tertiary group-hover:text-brand-400 ml-auto transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>
              </div>
              <p className="text-sm font-bold text-text-primary group-hover:text-brand-400 transition-colors">{step.label}</p>
              <p className="text-xs text-text-tertiary mt-1">{step.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Calendar */}
      {recentEntries.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-text-primary">Upcoming Content</h2>
            <Link href={`/projects/${id}/calendar`} className="text-xs font-bold text-brand-400 hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {recentEntries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-4 p-3 rounded-xl bg-surface-elevated border border-border-subtle">
                <div className="w-12 h-12 rounded-xl bg-surface-primary border border-border-subtle flex flex-col items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-text-tertiary uppercase">
                    {new Date(entry.scheduled_date).toLocaleDateString('en-US', { month: 'short' })}
                  </span>
                  <span className="text-sm font-black text-text-primary">
                    {new Date(entry.scheduled_date).getDate()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{entry.title}</p>
                  <p className="text-xs text-text-tertiary">{entry.focus_keyword} · {entry.article_type}</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                  entry.status === 'generated'
                    ? 'bg-accent-500/10 text-accent-400 border-accent-500/20'
                    : entry.status === 'generating'
                    ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    : 'bg-surface-elevated text-text-tertiary border-border-subtle'
                }`}>
                  {entry.status === 'generated' ? 'Ready' : entry.status === 'generating' ? 'Generating...' : 'Scheduled'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Project Details */}
      <div className="glass-card p-6">
        <h2 className="font-bold text-text-primary mb-4">Project Details</h2>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: 'Company', value: project.company },
            { label: 'Domain', value: project.domain },
            { label: 'Region', value: project.target_region.toUpperCase() },
            { label: 'Niche', value: project.niche },
            { label: 'Audience', value: project.target_audience },
            {
              label: 'Competitors',
              value: project.project_competitors?.length
                ? project.project_competitors.map((c: ProjectCompetitor) => c.domain).join(', ')
                : 'None added',
            },
          ].map(item => (
            <div key={item.label}>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1">{item.label}</dt>
              <dd className="text-sm text-text-primary">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
