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

const WORKFLOW = [
  { label: "Keywords", desc: "Discover & approve", href: "keywords" },
  { label: "Competitors", desc: "Benchmark gaps", href: "competitors" },
  { label: "Content Health", desc: "Audit site blogs", href: "audit" },
  { label: "Calendar", desc: "30-day plan", href: "calendar" },
  { label: "Blogs", desc: "Generate assets", href: "blogs" },
] as const;

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

function formatShareFromApi(share: number | null | undefined): string {
  if (share == null || !Number.isFinite(share)) return "—";
  return `${Number(share).toFixed(1)}%`;
}

/** Matches Ahrefs Site Explorer overlap legend: you-only | common | competitor-only. */
function KeywordOverlapBar({ row }: { row: AhrefsCompetitor }) {
  const kt = Math.max(0, row.keywords_target);
  const kc = Math.max(0, row.keywords_common);
  const kcomp = Math.max(0, row.keywords_competitor);
  const sum = kt + kc + kcomp;
  if (sum <= 0) {
    return (
      <div
        className="h-2 w-full max-w-[168px] rounded-full bg-surface-primary ring-1 ring-border-subtle"
        title="No overlap breakdown"
      />
    );
  }
  return (
    <div
      className="flex h-2 w-full max-w-[168px] overflow-hidden rounded-full ring-1 ring-border-subtle"
      title="You only | Common | Competitor only (same buckets as Ahrefs)"
    >
      <div className="h-full shrink-0 bg-sky-500/85" style={{ width: `${(kt / sum) * 100}%` }} />
      <div className="h-full shrink-0 bg-violet-500/90" style={{ width: `${(kc / sum) * 100}%` }} />
      <div className="h-full shrink-0 bg-amber-500/85" style={{ width: `${(kcomp / sum) * 100}%` }} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: "brand" | "cyan" | "accent" | "slate";
}) {
  const ring =
    accent === "brand"
      ? "border-brand-500/25 from-brand-500/8"
      : accent === "cyan"
        ? "border-cyan-500/25 from-cyan-500/8"
        : accent === "accent"
          ? "border-emerald-500/25 from-emerald-500/8"
          : "border-border-subtle from-surface-elevated/60";
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-b to-transparent p-5 ${ring}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">{label}</p>
      <p className="mt-2 font-mono text-2xl font-black tracking-tight text-text-primary">{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-text-tertiary">{hint}</p> : null}
    </div>
  );
}

function MetricsRow({ overview }: { overview: AhrefsDomainOverview | null }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard
        label="Domain rating"
        value={overview?.domain_rating != null ? String(Math.round(overview.domain_rating)) : "—"}
        hint="Ahrefs authority score for your domain."
        accent="brand"
      />
      <MetricCard
        label="Organic traffic (est.)"
        value={compactInt(overview?.organic_traffic ?? null)}
        hint="Monthly organic visits in the region you set."
        accent="cyan"
      />
      <MetricCard
        label="Organic keywords"
        value={compactInt(overview?.organic_keywords ?? null)}
        hint="Keywords ranking in organic results."
        accent="accent"
      />
      <MetricCard
        label="Referring domains"
        value={compactInt(overview?.refdomains ?? null)}
        hint="Unique sites linking to you."
        accent="slate"
      />
    </div>
  );
}

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
      <p className="rounded-xl border border-border-subtle bg-surface-elevated/40 px-4 py-6 text-center text-sm text-text-tertiary">
        No organic competitor overlap returned for <span className="font-mono text-text-secondary">{target}</span>.
        Try a verified domain or a different target region in project settings.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead>
          <tr className="border-b border-border-subtle bg-surface-elevated/50 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            <th className="px-4 py-3">Competitor domain</th>
            <th className="px-4 py-3">Keyword overlap</th>
            <th className="px-4 py-3 text-right">Competitor&apos;s keywords</th>
            <th className="px-4 py-3 text-right">Common</th>
            <th className="px-4 py-3 text-right">Share</th>
            <th className="px-4 py-3 text-right">Your keywords</th>
            <th className="px-4 py-3 text-right">DR</th>
            <th className="px-4 py-3 text-right">Traffic</th>
            <th className="px-4 py-3 text-right">Value</th>
            <th className="px-4 py-3 text-right">Pages</th>
          </tr>
        </thead>
        <tbody>
          {competitors.map(row => {
            const compTotal = ahrefsCompetitorOrganicTotal(row);
            const targetTotal = ahrefsTargetOrganicTotal(row);
            return (
              <tr key={row.competitor_domain} className="border-b border-border-subtle/80 last:border-0 hover:bg-glass/40">
                <td className="px-4 py-3">
                  <a
                    href={`https://${row.competitor_domain.replace(/^www\./, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs font-semibold text-brand-400 hover:underline"
                  >
                    {row.competitor_domain}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <KeywordOverlapBar row={row} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-text-primary">{compTotal.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-mono text-text-primary">{row.keywords_common.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-mono text-text-secondary">{formatShareFromApi(row.share)}</td>
                <td className="px-4 py-3 text-right font-mono text-text-secondary">{targetTotal.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-mono text-text-primary">
                  {row.domain_rating != null ? Math.round(row.domain_rating) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono text-text-secondary">{compactInt(row.traffic)}</td>
                <td className="px-4 py-3 text-right font-mono text-text-secondary">{formatUsdFromCents(row.value)}</td>
                <td className="px-4 py-3 text-right font-mono text-text-secondary">
                  {row.pages != null ? compactInt(row.pages) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle bg-surface-elevated/30 px-4 py-3">
        <p className="max-w-[920px] text-[11px] leading-relaxed text-text-tertiary">
          Same fields as{" "}
          <span className="font-semibold text-text-secondary">Ahrefs → Site Explorer → Organic competitors</span>:
          competitor total = common + competitor-only; your total = common + you-only.{" "}
          <span className="font-semibold text-text-secondary">Share</span> is the value returned by the Ahrefs API for
          this row (not recomputed). Data uses your project region,{" "}
          <span className="font-semibold text-text-secondary">domain</span> scope, and Ahrefs&apos; latest snapshot date
          on the server (typically yesterday UTC) so it lines up with the UI.
        </p>
        <Link href={`/projects/${projectId}/competitors`} className="text-xs font-bold text-brand-400 hover:underline">
          Full competitor workspace →
        </Link>
      </div>
    </div>
  );
}

function TopPagesTable({ pages, projectId }: { pages: AhrefsTopPage[]; projectId: string }) {
  if (!pages.length) {
    return (
      <p className="text-sm text-text-tertiary">No top pages returned yet for this domain in Ahrefs.</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border-subtle bg-surface-elevated/50 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            <th className="px-4 py-3">URL</th>
            <th className="px-4 py-3">Top keyword</th>
            <th className="px-4 py-3 text-right">Pos.</th>
            <th className="px-4 py-3 text-right">Traffic</th>
            <th className="px-4 py-3 text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {pages.map(p => (
            <tr key={p.url} className="border-b border-border-subtle/80 last:border-0 hover:bg-glass/40">
              <td className="max-w-[280px] px-4 py-2.5">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="line-clamp-1 font-mono text-[11px] text-brand-400 hover:underline"
                >
                  {p.url}
                </a>
              </td>
              <td className="px-4 py-2.5 text-text-secondary">{p.top_keyword ?? "—"}</td>
              <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                {p.top_keyword_best_position != null ? `#${p.top_keyword_best_position}` : "—"}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{compactInt(p.sum_traffic)}</td>
              <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{formatUsdFromCents(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border-subtle px-4 py-2 text-right">
        <Link href={`/projects/${projectId}/keywords`} className="text-xs font-bold text-brand-400 hover:underline">
          Keyword opportunities →
        </Link>
      </div>
    </div>
  );
}

function SetupSummary({ data }: { data: ProjectSiteExplorerData }) {
  const { project, target } = data;
  const userCompetitors = project.project_competitors ?? [];
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-elevated/30 p-5">
      <h2 className="mb-3 text-sm font-bold text-text-primary">Project setup</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Company</dt>
          <dd className="mt-1 text-sm text-text-primary">{project.company}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Niche</dt>
          <dd className="mt-1 text-sm text-text-primary">{project.niche}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Audience</dt>
          <dd className="mt-1 text-sm text-text-primary">{project.target_audience}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Analyzed domain</dt>
          <dd className="mt-1 font-mono text-sm text-brand-400">{target || project.domain}</dd>
        </div>
        {userCompetitors.length > 0 ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Your saved competitors</dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {(userCompetitors as ProjectCompetitor[]).map(c => (
                <span
                  key={c.id}
                  className="rounded-lg border border-border-subtle bg-surface-secondary px-2.5 py-1 font-mono text-xs text-text-secondary"
                >
                  {c.domain}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

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

  return (
    <div className="space-y-8">
      <SiteExplorerTraceLogger trace={trace} />

      {/* Site Explorer header */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
              Site Explorer
            </div>
            <h1 className="text-3xl font-black tracking-tight text-text-primary lg:text-4xl">{project.name}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
              Live snapshot for{" "}
              <span className="font-mono font-semibold text-brand-400">{target || project.domain}</span>
              {" · "}
              {regionName(project.target_region)}
              {project.niche ? (
                <>
                  {" · "}
                  {project.niche}
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/projects/${id}/keywords`}
              className="rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2.5 text-xs font-bold text-text-primary hover:border-brand-500/40"
            >
              Keywords
            </Link>
            <Link
              href={`/projects/${id}/competitors`}
              className="rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2.5 text-xs font-bold text-text-primary hover:border-brand-500/40"
            >
              Competitors
            </Link>
          </div>
        </div>

        {!ahrefsConfigured ? (
          <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-5 text-sm text-yellow-200">
            <p className="font-bold text-yellow-400">Ahrefs is not configured</p>
            <p className="mt-1 text-text-secondary">
              Add <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">AHREFS_API_KEY</code> to your
              environment to load domain metrics and organic competitors here.
            </p>
          </div>
        ) : (
          <>
            <MetricsRow overview={overview} />
            <p className="text-[11px] leading-relaxed text-text-tertiary">
              Figures are from Ahrefs Site Explorer for your project domain and target region. They are third-party
              estimates and can differ from Google Search Console.
            </p>
          </>
        )}
      </div>

      {audit.blogs_found > 0 && auditPending > 0 && (
        <Link
          href={`/projects/${id}/audit`}
          className="group flex flex-col gap-2 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 hover:bg-yellow-500/15 md:flex-row md:items-center md:gap-4"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-500/20 text-yellow-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-yellow-400">
              {auditPending} blog{auditPending === 1 ? "" : "s"} on your site haven&apos;t been audited yet
            </p>
            <p className="text-xs text-text-secondary">
              Run Content Health so new content aligns with what you already publish.
            </p>
          </div>
          <span className="text-xs font-bold text-yellow-400 group-hover:underline">Run audit →</span>
        </Link>
      )}

      {ahrefsConfigured && target ? (
        <>
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-text-primary">Organic competitors</h2>
                <p className="text-xs text-text-tertiary">
                  Domains that rank for many of the same keywords as{" "}
                  <span className="font-mono text-text-secondary">{target}</span> (Ahrefs overlap index).
                </p>
              </div>
            </div>
            <OrganicCompetitorsTable competitors={competitors} target={target} projectId={id} />
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-text-primary">Top pages by traffic</h2>
              <p className="text-xs text-text-tertiary">Highest-impact URLs on your domain for this region.</p>
            </div>
            <TopPagesTable pages={topPages} projectId={id} />
          </section>
        </>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-tertiary">Workflow</h2>
        <div className="flex flex-wrap gap-2">
          {WORKFLOW.map(w => (
            <Link
              key={w.href}
              href={`/projects/${id}/${w.href}`}
              className="group flex min-w-[140px] flex-1 items-center gap-3 rounded-xl border border-border-subtle bg-surface-elevated/50 px-4 py-3 transition-colors hover:border-brand-500/35"
            >
              <div>
                <p className="text-xs font-bold text-text-primary group-hover:text-brand-400">{w.label}</p>
                <p className="text-[10px] text-text-tertiary">{w.desc}</p>
              </div>
              <svg
                className="ml-auto h-4 w-4 shrink-0 text-text-tertiary group-hover:text-brand-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          ))}
        </div>
      </section>

      {recentEntries.length > 0 ? (
        <section className="glass-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-text-primary">Upcoming content</h2>
            <Link href={`/projects/${id}/calendar`} className="text-xs font-bold text-brand-400 hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {recentEntries.map(entry => (
              <div
                key={entry.id}
                className="flex items-center gap-4 rounded-xl border border-border-subtle bg-surface-elevated p-3"
              >
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-border-subtle bg-surface-primary">
                  <span className="text-[9px] font-bold uppercase text-text-tertiary">
                    {new Date(entry.scheduled_date).toLocaleDateString("en-US", { month: "short" })}
                  </span>
                  <span className="text-sm font-black text-text-primary">{new Date(entry.scheduled_date).getDate()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">{entry.title}</p>
                  <p className="text-xs text-text-tertiary">
                    {entry.focus_keyword} · {entry.article_type}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                    entry.status === "generated"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      : entry.status === "generating"
                        ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
                        : "border-border-subtle bg-surface-elevated text-text-tertiary"
                  }`}
                >
                  {entry.status === "generated" ? "Ready" : entry.status === "generating" ? "Generating…" : "Scheduled"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <SetupSummary data={data} />
    </div>
  );
}
