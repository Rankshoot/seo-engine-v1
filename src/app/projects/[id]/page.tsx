import Link from "next/link";
import {
  getProjectSiteExplorerSnapshot,
  type ProjectSiteExplorerData,
  type SiteExplorerTraceEntry,
} from "@/app/actions/project-actions";
import { getCalendarWithBlogs } from "@/app/actions/blog-actions";
import { getBlogAudits } from "@/app/actions/audit-actions";
import {
  ahrefsCentsToDollars,
  ahrefsCompetitorOrganicTotal,
  ahrefsTargetOrganicTotal,
} from "@/lib/ahrefs";
import type { AhrefsCompetitor, AhrefsDomainOverview, AhrefsTopPage } from "@/lib/ahrefs";
import type { CalendarEntryWithBlog, ProjectCompetitor } from "@/lib/types";
import { TARGET_REGIONS } from "@/lib/types";
import { notFound } from "next/navigation";
import SiteExplorerTraceLogger from "@/components/projects/SiteExplorerTraceLogger";

// ─── helpers ────────────────────────────────────────────────────────────────

function regionName(code: string): string {
  return TARGET_REGIONS.find(r => r.code === code.toLowerCase())?.name ?? code.toUpperCase();
}

function compactInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const v = Math.round(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1_000)}K`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

function formatUsdFromCents(cents: number | null | undefined): string {
  const d = ahrefsCentsToDollars(cents);
  if (d === null) return "—";
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(2)}M`;
  if (d >= 1_000) return `$${(d / 1_000).toFixed(1)}K`;
  return `$${d.toFixed(0)}`;
}

function formatShare(share: number | null | undefined): string {
  if (share == null || !Number.isFinite(share)) return "—";
  return `${Number(share).toFixed(1)}%`;
}

// ─── sub-components ──────────────────────────────────────────────────────────

function KeywordOverlapBar({ row }: { row: AhrefsCompetitor }) {
  const kt = Math.max(0, row.keywords_target);
  const kc = Math.max(0, row.keywords_common);
  const kcomp = Math.max(0, row.keywords_competitor);
  const sum = kt + kc + kcomp;
  if (sum <= 0) {
    return <div className="h-1.5 w-[140px] rounded-full bg-surface-tertiary" title="No overlap breakdown" />;
  }
  return (
    <div className="flex h-1.5 w-[140px] overflow-hidden rounded-full bg-surface-tertiary" title="You only | Common | Competitor only">
      <div className="h-full shrink-0 bg-brand-action" style={{ width: `${(kt / sum) * 100}%` }} />
      <div className="h-full shrink-0 bg-violet-500" style={{ width: `${(kc / sum) * 100}%` }} />
      <div className="h-full shrink-0 bg-amber-500" style={{ width: `${(kcomp / sum) * 100}%` }} />
    </div>
  );
}

/** Single unified metrics bar — one container, internally divided. */
function MetricsBar({ overview }: { overview: AhrefsDomainOverview | null }) {
  const items = [
    {
      label: "Domain Rating",
      value: overview?.domain_rating != null ? String(Math.round(overview.domain_rating)) : "—",
      hint: "Ahrefs authority score",
    },
    {
      label: "Organic Traffic (Est.)",
      value: compactInt(overview?.organic_traffic ?? null),
      hint: "Monthly organic visits",
    },
    {
      label: "Organic Keywords",
      value: compactInt(overview?.organic_keywords ?? null),
      hint: "Ranking in organic results",
    },
    {
      label: "Referring Domains",
      value: compactInt(overview?.refdomains ?? null),
      hint: "Unique sites linking to you",
    },
  ];

  // In a 2-col mobile / 4-col desktop grid the inner borders are:
  //   mobile: item[0]=border-r+border-b, [1]=border-b, [2]=border-r, [3]=none
  //   desktop (lg): items 0-2 add border-r, none have border-b
  const borders = [
    "border-r border-b border-border-subtle lg:border-b-0",
    "border-b border-border-subtle lg:border-b-0 lg:border-r",
    "border-r border-border-subtle",
    "",
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
      {items.map((item, i) => (
        <div key={item.label} className={`p-5 ${borders[i]} flex flex-col justify-center`}>
          <p className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5">{item.label}</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-text-primary">{item.value}</p>
          <p className="mt-1 text-[13px] text-text-tertiary">{item.hint}</p>
        </div>
      ))}
    </div>
  );
}

/** Icon switcher — keeps icons out of the config array so we avoid React in `as const`. */
function WorkflowIcon({ step }: { step: string }) {
  const cls = "w-5 h-5";
  switch (step) {
    case "keywords":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "competitors":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "audit":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case "calendar":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
        </svg>
      );
    default: // blogs
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><line x1="10" x2="8" y1="9" y2="9" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" />
        </svg>
      );
  }
}

const WORKFLOW = [
  { label: "Keywords",       desc: "Discover & approve keywords",    href: "keywords",    iconColor: "text-brand-action",  hoverBorder: "hover:border-brand-action/30" },
  { label: "Competitors",    desc: "Benchmark competitor gaps",       href: "competitors", iconColor: "text-[#10b981]",   hoverBorder: "hover:border-[#10b981]/30" },
  { label: "Content Health", desc: "Audit your existing blogs",       href: "audit",       iconColor: "text-brand-coral", hoverBorder: "hover:border-brand-coral/30" },
  { label: "Calendar",       desc: "30-day content plan",             href: "calendar",    iconColor: "text-text-primary", hoverBorder: "hover:border-text-primary/30" },
  { label: "Blogs",          desc: "Generate content assets",         href: "blogs",       iconColor: "text-brand-action",   hoverBorder: "hover:border-brand-action/30" },
] as const;

function OrganicCompetitorsTable({
  competitors,
  target,
  projectId,
}: {
  competitors: AhrefsCompetitor[];
  target: string;
  projectId: string;
}) {
  if (!competitors.length) {
    return (
      <p className="rounded-xl border border-border-subtle bg-surface-elevated p-8 text-center text-[16px] text-text-tertiary">
        No organic competitor overlap returned for{" "}
        <span className="font-mono text-text-secondary">{target}</span>. Try a verified domain or a
        different target region.
      </p>
    );
  }

  return (
    <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary">
              <th className="p-4">Competitor Domain</th>
              <th className="p-4">Keyword Overlap</th>
              <th className="p-4 text-right">Comp. Keywords</th>
              <th className="p-4 text-right">Common</th>
              <th className="p-4 text-right">Share</th>
              <th className="p-4 text-right">Your Keywords</th>
              <th className="p-4 text-right">DR</th>
              <th className="p-4 text-right">Traffic</th>
              <th className="p-4 text-right">Value</th>
              <th className="p-4 text-right">Pages</th>
            </tr>
          </thead>
          <tbody>
            {competitors.map(row => {
              const compTotal = ahrefsCompetitorOrganicTotal(row);
              const targetTotal = ahrefsTargetOrganicTotal(row);
              return (
                <tr key={row.competitor_domain} className="border-b border-border-subtle/60 last:border-0 hover:bg-surface-hover transition-colors">
                  <td className="p-4">
                    <a
                      href={`https://${row.competitor_domain.replace(/^www\./, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[14px] text-brand-action hover:underline"
                    >
                      {row.competitor_domain}
                    </a>
                  </td>
                  <td className="p-4"><KeywordOverlapBar row={row} /></td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-secondary">{compTotal.toLocaleString()}</td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-secondary">{row.keywords_common.toLocaleString()}</td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{formatShare(row.share)}</td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{targetTotal.toLocaleString()}</td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-secondary">
                    {row.domain_rating != null ? Math.round(row.domain_rating) : "—"}
                  </td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{compactInt(row.traffic)}</td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{formatUsdFromCents(row.value)}</td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{row.pages != null ? compactInt(row.pages) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface-secondary p-4">
        <p className="text-[12px] text-text-tertiary">
          Ahrefs Site Explorer · domain scope · Share as returned by API
        </p>
        <Link href={`/projects/${projectId}/competitors`} className="text-[14px] font-medium text-brand-action hover:underline">
          Full competitor workspace →
        </Link>
      </div>
    </div>
  );
}

function TopPagesTable({ pages, projectId }: { pages: AhrefsTopPage[]; projectId: string }) {
  if (!pages.length) {
    return <p className="text-[16px] text-text-tertiary">No top pages returned yet for this domain in Ahrefs.</p>;
  }
  return (
    <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary">
              <th className="p-4">URL</th>
              <th className="p-4">Top Keyword</th>
              <th className="p-4 text-right">Pos.</th>
              <th className="p-4 text-right">Traffic</th>
              <th className="p-4 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {pages.map(p => (
              <tr key={p.url} className="border-b border-border-subtle/60 last:border-0 hover:bg-surface-hover transition-colors">
                <td className="max-w-[300px] p-4">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="line-clamp-1 font-mono text-[14px] text-brand-action hover:underline">
                    {p.url}
                  </a>
                </td>
                <td className="p-4 text-[14px] text-text-secondary">{p.top_keyword ?? "—"}</td>
                <td className="p-4 text-right font-mono text-[14px] text-text-secondary">
                  {p.top_keyword_best_position != null ? `#${p.top_keyword_best_position}` : "—"}
                </td>
                <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{compactInt(p.sum_traffic)}</td>
                <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{formatUsdFromCents(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border-subtle bg-surface-secondary p-4 text-right">
        <Link href={`/projects/${projectId}/keywords`} className="text-[14px] font-medium text-brand-action hover:underline">
          Keyword opportunities →
        </Link>
      </div>
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [snap, calRes, auditRes] = await Promise.all([
    getProjectSiteExplorerSnapshot(id),
    getCalendarWithBlogs(id),
    getBlogAudits(id),
  ]);

  if (!snap.success || !snap.data) notFound();

  const data = snap.data;
  const trace: SiteExplorerTraceEntry[] = snap.trace;
  const recentEntries: CalendarEntryWithBlog[] = (calRes.data ?? []).slice(0, 5);
  const audit = auditRes.coverage;
  const auditPending = Math.max(0, audit.blogs_found - audit.blogs_audited);

  const { project, target, ahrefsConfigured, overview, competitors, topPages } = data;
  const userCompetitors = (project.project_competitors ?? []) as ProjectCompetitor[];

  return (
    <div className="space-y-10 pb-16 pl-4 pr-4">
      <SiteExplorerTraceLogger trace={trace} />

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="pt-4 pb-8 border-b border-border-subtle">
        {/* breadcrumb / context row */}
        <div className="mb-4 flex flex-wrap items-center gap-3 text-[14px] text-text-tertiary">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 font-mono text-[12px] uppercase tracking-widest text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-brand-action" />
            Site Explorer
          </span>
          <span className="font-mono text-text-primary">{target || project.domain}</span>
          <span className="opacity-30">/</span>
          <span>{regionName(project.target_region)}</span>
          {project.niche && (
            <>
              <span className="opacity-30">/</span>
              <span>{project.niche}</span>
            </>
          )}
        </div>

        {/* title + actions */}
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="text-[48px] font-normal tracking-[-0.96px] leading-none text-text-primary font-display">
              {project.name}
            </h1>
            {project.company && project.company !== project.name && (
              <p className="mt-3 text-[16px] text-text-tertiary">{project.company}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/projects/${id}/keywords`}
              className="rounded-[4px] px-4 py-2 text-[14px] text-text-secondary hover:text-text-primary hover:underline"
            >
              Keywords
            </Link>
            <Link
              href={`/projects/${id}/competitors`}
              className="rounded-[32px] bg-brand-primary px-5 py-2.5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
            >
              Competitors
            </Link>
          </div>
        </div>
      </div>

      {/* ── METRICS BAR ────────────────────────────────────────────────────── */}
      {!ahrefsConfigured ? (
        <div className="rounded-[16px] border border-border-subtle bg-surface-secondary p-6">
          <p className="text-[16px] font-medium text-text-primary">Ahrefs not configured</p>
          <p className="mt-2 text-[14px] text-text-tertiary">
            Add <code className="font-mono text-[13px] text-text-secondary">AHREFS_API_KEY</code> to your environment to load domain metrics here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <MetricsBar overview={overview} />
          <p className="text-[13px] text-text-tertiary">
            Third-party estimates from Ahrefs Site Explorer. May differ from Google Search Console.
          </p>
        </div>
      )}

      {/* ── WORKFLOW NAVIGATION ─────────────────────────────────────────────── */}
      {/* <section>
        <h2 className="mb-4 text-[28px] font-normal tracking-[-0.28px] text-text-primary font-display">
          Navigate your project
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {WORKFLOW.map(w => (
            <Link
              key={w.href}
              href={`/projects/${id}/${w.href}`}
              className={`group flex flex-col gap-3 rounded-[16px] border border-border-subtle bg-surface-elevated p-5 transition-all hover:shadow-sm ${w.hoverBorder}`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-[8px] bg-surface-tertiary ${w.iconColor} transition-colors`}>
                <WorkflowIcon step={w.href} />
              </div>
              <div>
                <p className="text-[16px] font-medium leading-tight text-text-primary">{w.label}</p>
                <p className="mt-1.5 text-[13px] leading-snug text-text-tertiary">{w.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section> */}


      {/* ── ORGANIC COMPETITORS + TOP PAGES ────────────────────────────────── */}
      {ahrefsConfigured && target && (
        <>
          <section className="space-y-4">
            <div>
              <h2 className="text-[28px] font-normal tracking-[-0.28px] text-text-primary font-display">Organic competitors</h2>
              <p className="mt-1.5 text-[14px] text-text-tertiary">
                Domains that rank for many of the same keywords as{" "}
                <span className="font-mono text-text-secondary">{target}</span> (Ahrefs overlap index).
              </p>
            </div>
            <OrganicCompetitorsTable competitors={competitors} target={target} projectId={id} />
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-[28px] font-normal tracking-[-0.28px] text-text-primary font-display">Top pages by traffic</h2>
              <p className="mt-1.5 text-[14px] text-text-tertiary">Highest-impact URLs on your domain for this region.</p>
            </div>
            <TopPagesTable pages={topPages} projectId={id} />
          </section>
        </>
      )}

      {/* ── UPCOMING CONTENT ───────────────────────────────────────────────── */}
      {recentEntries.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[28px] font-normal tracking-[-0.28px] text-text-primary font-display">Upcoming content</h2>
            <Link href={`/projects/${id}/calendar`} className="text-[14px] font-medium text-brand-action hover:underline">
              View all →
            </Link>
          </div>
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
            {recentEntries.map((entry, i) => {
              const date = new Date(entry.scheduled_date);
              const statusCls =
                entry.status === "generated"
                  ? "border-[#10b981]/30 bg-[#10b981]/10 text-[#10b981]"
                  : entry.status === "generating"
                  ? "border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#f59e0b]"
                  : "border-border-subtle bg-surface-secondary text-text-tertiary";
              const statusLabel =
                entry.status === "generated" ? "Ready" :
                entry.status === "generating" ? "Generating…" : "Scheduled";

              return (
                <div
                  key={entry.id}
                  className={`flex items-center gap-5 p-5 transition-colors hover:bg-surface-hover ${i > 0 ? "border-t border-border-subtle" : ""}`}
                >
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[8px] border border-border-subtle bg-surface-secondary">
                    <span className="text-[11px] font-bold uppercase leading-none text-text-tertiary">
                      {date.toLocaleDateString("en-US", { month: "short" })}
                    </span>
                    <span className="mt-1 text-[16px] font-medium leading-none text-text-primary">
                      {date.getDate()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-medium text-text-primary">{entry.title}</p>
                    <p className="mt-1 text-[13px] text-text-tertiary">
                      {entry.focus_keyword} · {entry.article_type}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-[4px] border px-2.5 py-1 text-[11px] font-medium ${statusCls}`}>
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── PROJECT META ───────────────────────────────────────────────────── */}
      <section className="border-t border-border-subtle pt-8">
        <p className="mb-4 text-[13px] font-bold uppercase tracking-widest text-text-tertiary">Project setup</p>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {[
            { label: "Company",  value: project.company },
            { label: "Niche",    value: project.niche },
            { label: "Audience", value: project.target_audience },
            { label: "Domain",   value: target || project.domain, mono: true },
          ].map(f => (
            <div key={f.label}>
              <dt className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">{f.label}</dt>
              <dd className={`mt-1.5 text-[14px] ${f.mono ? "font-mono text-brand-action" : "text-text-secondary"}`}>
                {f.value}
              </dd>
            </div>
          ))}
          {userCompetitors.length > 0 && (
            <div className="col-span-2 md:col-span-4">
              <dt className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Saved Competitors</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {userCompetitors.map(c => (
                  <span
                    key={c.id}
                    className="rounded-[4px] border border-border-subtle bg-surface-secondary px-2.5 py-1 font-mono text-[13px] text-text-secondary"
                  >
                    {c.domain}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
