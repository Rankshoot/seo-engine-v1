"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  auditExistingBlogs,
  deleteBlogAudits,
  getBlogAudits,
  type AuditCoverage,
  type PersistedBlogAudit,
} from "@/app/actions/audit-actions";
import { repairBlogFromAudit } from "@/app/actions/repair-actions";
import type { IssueCategory } from "@/lib/content-audit";

type SeverityFilter = "all" | "high" | "medium" | "low";

// ────────────────────────────────────────────────────────────────────────────
// Visual lookup tables — single source of truth for colors + tooltips.
const SEVERITY_COLORS: Record<"high" | "medium" | "low", string> = {
  high: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  medium: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  low: "border-accent-500/30 bg-accent-500/10 text-accent-400",
};

const SEVERITY_TOOLTIP: Record<"high" | "medium" | "low", string> = {
  high: "High severity — blocks this page from ranking or getting cited by AI answers. Fix these first.",
  medium: "Medium severity — hurts click-through and engagement, but the page can still rank. Fix once the high items are done.",
  low: "Low severity — polish. Nice-to-haves that incrementally lift the page.",
};

const IMPACT_TOOLTIP: Record<"high" | "medium" | "low", string> = {
  high: "High impact — fixing this should meaningfully move traffic/rankings.",
  medium: "Medium impact — fixing this will help, but won't transform the page alone.",
  low: "Low impact — small lift.",
};

const CATEGORY_META: Record<IssueCategory, { label: string; tooltip: string; icon: string; color: string }> = {
  technical: {
    label: "Technical",
    tooltip:
      "Page plumbing — things like 404s, missing meta tags, broken title, missing schema, slow load. These usually block ranking entirely until fixed.",
    icon: "⚙️",
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  },
  seo: {
    label: "SEO",
    tooltip:
      "On-page optimization — is the target keyword in the right places, is the H2 structure logical, are internal links helping.",
    icon: "🎯",
    color: "text-brand-400 bg-brand-500/10 border-brand-500/30",
  },
  content: {
    label: "Content",
    tooltip:
      "Writing quality — is the post deep enough, does it answer the reader\u2019s question fast, does it have examples and data.",
    icon: "📝",
    color: "text-accent-400 bg-accent-500/10 border-accent-500/30",
  },
  keyword_demand: {
    label: "Keyword demand",
    tooltip:
      "Is the keyword this post targets actually being searched right now? A perfectly written blog on a dead keyword will never get traffic.",
    icon: "📈",
    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  },
  ux: {
    label: "Reader experience",
    tooltip:
      "How the page reads on the screen — scannable subheads, short paragraphs, lists, no walls of text.",
    icon: "👁",
    color: "text-pink-400 bg-pink-500/10 border-pink-500/30",
  },
};

const CATEGORY_ORDER: IssueCategory[] = ["technical", "keyword_demand", "seo", "content", "ux"];

const DEMAND_VERDICT: Record<
  NonNullable<PersistedBlogAudit["analysis"]["keyword_demand"]>["verdict"],
  { label: string; color: string; tooltip: string }
> = {
  trending: {
    label: "Trending up",
    color: "border-accent-500/40 bg-accent-500/10 text-accent-400",
    tooltip: "Search volume for this keyword is growing. The demand is real — fixing the page should actually earn traffic.",
  },
  stable: {
    label: "Stable",
    color: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
    tooltip: "Search volume is roughly flat. Traffic is available if the page ranks — worth fixing.",
  },
  declining: {
    label: "Declining",
    color: "border-rose-500/40 bg-rose-500/10 text-rose-400",
    tooltip: "Searches for this keyword are trending down. Even a perfect rewrite will return diminishing traffic — consider retargeting to a related, healthier keyword.",
  },
  niche: {
    label: "Niche",
    color: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
    tooltip: "Very low monthly volume. The topic may be too specialized for meaningful blog traffic — but it can still win quality leads if intent matches.",
  },
  unknown: {
    label: "No data",
    color: "border-border-subtle bg-surface-elevated text-text-tertiary",
    tooltip: "We couldn\u2019t confirm current search demand (DataForSEO didn\u2019t return a match). Treat the keyword as unverified.",
  },
};

function healthColor(score: number): string {
  if (score >= 75) return "text-accent-400";
  if (score >= 50) return "text-yellow-400";
  return "text-rose-400";
}

function scoreBar(score: number): string {
  if (score >= 75) return "bg-accent-500";
  if (score >= 50) return "bg-yellow-500";
  return "bg-rose-500";
}

// ────────────────────────────────────────────────────────────────────────────
export default function ContentHealthPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();

  const [rows, setRows] = useState<PersistedBlogAudit[]>([]);
  const [coverage, setCoverage] = useState<AuditCoverage>({
    blogs_found: 0,
    blogs_audited: 0,
    last_updated_at: null,
    avg_health: 0,
    high_severity: 0,
  });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runSummary, setRunSummary] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [repairing, setRepairing] = useState<string | null>(null);

  const BATCH_SIZE = 10;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getBlogAudits(projectId);
    if (res.success) {
      setRows(res.data);
      setCoverage(res.coverage);
    } else {
      setError(res.error ?? "Failed to load audits");
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRun = async (force: boolean) => {
    setRunning(true);
    setRunSummary("");
    setError("");
    const res = await auditExistingBlogs(projectId, { force, limit: BATCH_SIZE });
    if (res.success) {
      const remaining = Math.max(0, res.coverage.blogs_found - res.coverage.blogs_audited);
      setRunSummary(
        `Audited ${res.audited}${res.failed ? ` · failed ${res.failed}` : ""}${
          remaining ? ` · ${remaining} still pending` : ""
        }`
      );
      setCoverage(res.coverage);
      await load();
    } else {
      setError(res.error ?? "Audit failed");
    }
    setRunning(false);
  };

  const handleClear = async () => {
    if (!confirm("Delete all audit results for this project? You can re-run the audit any time.")) return;
    setRunning(true);
    await deleteBlogAudits(projectId);
    setRows([]);
    setCoverage({
      blogs_found: coverage.blogs_found,
      blogs_audited: 0,
      last_updated_at: null,
      avg_health: 0,
      high_severity: 0,
    });
    setRunning(false);
  };

  const handleRepair = async (audit: PersistedBlogAudit) => {
    setRepairing(audit.url);
    setError("");
    const res = await repairBlogFromAudit(projectId, audit.url);
    if (res.success && res.data) {
      router.push(`/projects/${projectId}/blogs/${res.data.blogId}`);
    } else {
      setError(res.error ?? "Repair failed");
      setRepairing(null);
    }
  };

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter(r => r.severity === filter);
  }, [rows, filter]);

  const toggleExpanded = (url: string) =>
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(url)) s.delete(url);
      else s.add(url);
      return s;
    });

  const pendingAudits = Math.max(0, coverage.blogs_found - coverage.blogs_audited);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-2 text-xs text-text-tertiary hover:text-text-secondary"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m12 19-7-7 7-7M19 12H5" />
          </svg>
          Back to project
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-primary mb-1">
            Content <span className="gradient-text">health</span>
          </h1>
          <p className="text-text-tertiary text-sm max-w-2xl">
            We audit each blog on your site on its own merits — is the page technically healthy, is the target keyword
            still worth ranking for, and does the writing answer the reader&apos;s question. Every issue is explained in
            plain language; click <span className="text-text-secondary">See fixes</span> on a card to expand the full
            diagnosis, and <span className="text-text-secondary">Repair with AI</span> to open an improved rewrite in
            the blog editor.
          </p>
          <p className="mt-1 text-[11px] text-text-tertiary">
            We audit {BATCH_SIZE} blogs per click to keep LLM costs predictable. Real impressions &amp; clicks from
            Google require connecting Search Console — coming next.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleRun(false)}
            disabled={running || (coverage.blogs_audited > 0 && pendingAudits === 0)}
            className="flex items-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-500/20 hover:from-brand-400 hover:to-brand-500 disabled:opacity-60"
          >
            {running ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Auditing…
              </>
            ) : coverage.blogs_audited === 0 ? (
              `Audit first ${Math.min(BATCH_SIZE, Math.max(coverage.blogs_found, BATCH_SIZE))} blogs`
            ) : pendingAudits === 0 ? (
              "All audited"
            ) : (
              `Audit ${Math.min(BATCH_SIZE, pendingAudits)} more · ${pendingAudits} pending`
            )}
          </button>
          <button
            type="button"
            onClick={() => handleRun(true)}
            disabled={running || coverage.blogs_audited === 0}
            title="Re-run the audit on 10 already-audited blogs. Useful after you've fixed issues and want a fresh score."
            className="rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2.5 text-xs font-bold text-text-secondary hover:border-brand-500/30 disabled:opacity-40"
          >
            Re-audit 10
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={running || rows.length === 0}
            title="Delete all stored audit results for this project. You can re-run any time."
            className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-[11px] font-bold text-rose-400 hover:bg-rose-500/20 disabled:opacity-40"
          >
            Clear all
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400">
          {error}
        </div>
      )}
      {runSummary && !error && (
        <div className="rounded-xl border border-accent-500/20 bg-accent-500/10 p-3 text-sm text-accent-400">
          {runSummary}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Blogs found"
          value={coverage.blogs_found}
          sub="on your sitemap"
          accent="from-brand-500/10 to-brand-700/5 border-brand-500/20"
          tooltip="The total number of blog-style URLs we could find on your sitemap (and its child sitemaps). /blog/, /blogs/, /articles/, /posts/, etc."
        />
        <StatCard
          label="Audited"
          value={coverage.blogs_audited}
          sub={`${pendingAudits} pending`}
          accent="from-cyan-500/10 to-cyan-700/5 border-cyan-500/20"
          tooltip="How many of those blogs we've actually scraped + diagnosed. Hit the audit button to process more."
        />
        <StatCard
          label="Avg. health"
          value={coverage.avg_health}
          sub="0–100"
          accent="from-accent-500/10 to-accent-700/5 border-accent-500/20"
          valueClass={healthColor(coverage.avg_health)}
          tooltip="Average health score across every audited blog. Blends structural signals (word count, headings, internal links, FAQ, schema) with our LLM's content-quality score. Higher = closer to rank-ready."
        />
        <StatCard
          label="High-severity"
          value={coverage.high_severity}
          sub="need fixes now"
          accent="from-rose-500/10 to-rose-700/5 border-rose-500/20"
          valueClass="text-rose-400"
          tooltip="Number of blogs with at least one 'high severity' issue — those that are actively blocked from ranking or AI-citation today."
        />
      </div>

      {coverage.blogs_found === 0 && !loading && (
        <div className="rounded-3xl border-2 border-dashed border-border-subtle py-20 text-center">
          <div className="mb-3 text-4xl">🔎</div>
          <p className="mb-2 font-bold text-text-secondary">No blog URLs discovered yet</p>
          <p className="mx-auto mb-4 max-w-md text-sm text-text-tertiary">
            We couldn&apos;t find any blog-style URLs in your sitemap. Make sure your sitemap.xml is reachable and
            includes paths like <code className="rounded bg-surface-elevated px-1">/blog/…</code> or{" "}
            <code className="rounded bg-surface-elevated px-1">/blogs/…</code>. Then refresh the brief on the Keywords
            page.
          </p>
          <Link
            href={`/projects/${projectId}/keywords`}
            className="inline-flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2 text-xs font-bold text-brand-400 hover:bg-brand-500/20"
          >
            Go refresh the brief
          </Link>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-1 rounded-xl border border-border-subtle bg-surface-secondary/50 p-1 w-fit">
          {(["all", "high", "medium", "low"] as SeverityFilter[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              title={f === "all" ? "Show every audited blog." : SEVERITY_TOOLTIP[f]}
              className={`rounded-lg px-4 py-1.5 text-xs font-bold capitalize transition-all ${
                filter === f ? "bg-brand-500 text-white" : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {f} ({f === "all" ? rows.length : rows.filter(r => r.severity === f).length})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-24 w-full animate-pulse rounded-2xl border border-border-subtle bg-surface-secondary/50"
            />
          ))}
        </div>
      ) : filtered.length === 0 && coverage.blogs_found > 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-border-subtle py-16 text-center text-sm text-text-tertiary">
          {coverage.blogs_audited === 0
            ? `Hit "Audit first ${BATCH_SIZE} blogs" to begin.`
            : "No blogs match this filter."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(row => {
            const a = row.analysis;
            const isOpen = expanded.has(row.url);
            const demand = a.keyword_demand;
            const demandVerdict = demand ? DEMAND_VERDICT[demand.verdict] : null;
            const groupedIssues = groupIssuesByCategory(a.issues);
            const isBroken = a.page_status === "broken" || a.page_status === "redirected";
            const canRepair =
              !isBroken && row.scraped_chars > 400 && a.issues.length > 0 && !repairing;

            return (
              <div
                key={row.url}
                className="rounded-2xl border border-border-subtle bg-surface-secondary/40 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        title={SEVERITY_TOOLTIP[row.severity]}
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase cursor-help ${
                          SEVERITY_COLORS[row.severity]
                        }`}
                      >
                        {row.severity}
                      </span>
                      {row.primary_keyword && (
                        <span
                          title="Our best guess at the keyword this blog is trying to rank for. We infer it from the title, H1, first paragraph, and body."
                          className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold text-brand-400 cursor-help"
                        >
                          kw: {row.primary_keyword}
                        </span>
                      )}
                      {demandVerdict && (
                        <span
                          title={`${demandVerdict.tooltip}\n\nVolume: ${demand?.volume?.toLocaleString() ?? 0}/mo · trend ${demand?.trend_pct != null && demand.trend_pct >= 0 ? "+" : ""}${demand?.trend_pct ?? 0}%`}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold cursor-help ${demandVerdict.color}`}
                        >
                          {demandVerdict.label}
                          {demand && demand.volume > 0 ? ` · ${formatVolume(demand.volume)}/mo` : ""}
                        </span>
                      )}
                      {a.suggested_funnel_stage && (
                        <span
                          title="Funnel stage this post is best suited for. TOFU = awareness, MOFU = evaluation, BOFU = decision. Helps you decide what to link it to internally and what CTA to put at the end."
                          className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-400 cursor-help"
                        >
                          {a.suggested_funnel_stage}
                        </span>
                      )}
                      <span className="text-[11px] text-text-tertiary">
                        {row.word_count.toLocaleString()} words
                      </span>
                    </div>
                    <p className="font-semibold text-text-primary truncate" title={row.title}>
                      {row.title || row.url}
                    </p>
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-block max-w-full truncate text-xs text-brand-400 hover:underline"
                    >
                      {row.url}
                    </a>
                    {a.plain_language_verdict && (
                      <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                        {a.plain_language_verdict}
                      </p>
                    )}
                    {!a.plain_language_verdict && a.summary && (
                      <p className="mt-2 text-xs text-text-secondary line-clamp-2">{a.summary}</p>
                    )}
                    {row.error && (
                      <p className="mt-1 text-xs text-rose-400">Error: {row.error}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 min-w-[160px]">
                    <div
                      title="Health score 0–100. 75+ = solid, 50–74 = worth fixing, <50 = needs serious work."
                      className="flex items-center gap-2 cursor-help"
                    >
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-elevated">
                        <div
                          className={`h-full rounded-full ${scoreBar(row.health_score)}`}
                          style={{ width: `${row.health_score}%` }}
                        />
                      </div>
                      <span className={`text-lg font-black ${healthColor(row.health_score)}`}>
                        {row.health_score}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(row.url)}
                        className="text-xs font-bold text-brand-400 hover:text-brand-300"
                      >
                        {isOpen ? "Hide details" : "See fixes"}
                      </button>
                      {canRepair && (
                        <button
                          type="button"
                          onClick={() => handleRepair(row)}
                          disabled={!!repairing}
                          title="Use AI to rewrite this blog addressing every issue flagged. Opens the repaired draft in the blog editor — you can review and download or schedule it from there."
                          className="flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-brand-500/30 hover:from-brand-400 hover:to-brand-500 disabled:opacity-60"
                        >
                          {repairing === row.url ? (
                            <>
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                              Repairing…
                            </>
                          ) : (
                            <>
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                              </svg>
                              Repair with AI
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-5 space-y-5">
                    {/* Grouped issues, by category */}
                    {a.issues.length === 0 ? (
                      <p className="text-xs text-text-tertiary">No explicit issues flagged.</p>
                    ) : (
                      <div className="space-y-4">
                        {CATEGORY_ORDER.filter(c => groupedIssues[c]?.length).map(cat => {
                          const meta = CATEGORY_META[cat];
                          return (
                            <div key={cat}>
                              <div className="mb-2 flex items-center gap-2">
                                <span
                                  title={meta.tooltip}
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider cursor-help ${meta.color}`}
                                >
                                  <span>{meta.icon}</span> {meta.label}
                                </span>
                                <span className="text-[10px] text-text-tertiary">
                                  ({groupedIssues[cat]!.length} issue{groupedIssues[cat]!.length === 1 ? "" : "s"})
                                </span>
                              </div>
                              <ul className="space-y-2">
                                {groupedIssues[cat]!.map((issue, i) => (
                                  <IssueCard key={`${cat}-${i}`} issue={issue} />
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      {a.content_gaps.length > 0 && (
                        <div>
                          <p
                            title="Subtopics this blog is missing that would make it more useful to readers. The LLM looks at what a reader searching this keyword would reasonably expect but isn't in the post."
                            className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-tertiary cursor-help"
                          >
                            What&apos;s missing from this post
                          </p>
                          <ul className="space-y-1 text-xs text-text-secondary">
                            {a.content_gaps.map(g => (
                              <li key={g}>· {g}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {a.internal_link_opportunities.length > 0 && (
                        <div>
                          <p
                            title="Other blogs on your own site that this post should link to. Every internal link you add tells Google the cluster is a topical authority — which lifts ALL the linked pages."
                            className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-tertiary cursor-help"
                          >
                            Link from this post to
                          </p>
                          <ul className="space-y-1.5">
                            {a.internal_link_opportunities.map(l => (
                              <li key={l.target_url} className="text-xs">
                                <a
                                  href={l.target_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block truncate text-brand-400 hover:underline"
                                  title={l.target_url}
                                >
                                  {l.target_url}
                                </a>
                                {l.reason && (
                                  <span className="text-[11px] text-text-tertiary">{l.reason}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {a.secondary_keywords.length > 0 && (
                        <div className="md:col-span-2">
                          <p
                            title="Related keywords we saw used throughout this post. If any of these have higher demand than the primary keyword, consider re-targeting the page."
                            className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-tertiary cursor-help"
                          >
                            Secondary keywords detected
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {a.secondary_keywords.map(k => (
                              <span
                                key={k}
                                className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-secondary"
                              >
                                {k}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponents

function IssueCard({ issue }: { issue: PersistedBlogAudit["analysis"]["issues"][number] }) {
  const [showMore, setShowMore] = useState(false);
  const hasMore = issue.why_it_matters && issue.why_it_matters.length > 0;

  return (
    <li className="rounded-xl border border-border-subtle bg-surface-primary/40 p-3">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span
          title={SEVERITY_TOOLTIP[issue.severity]}
          className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase cursor-help ${SEVERITY_COLORS[issue.severity]}`}
        >
          {issue.severity}
        </span>
        <span
          title={IMPACT_TOOLTIP[issue.impact]}
          className="rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-[9px] font-bold uppercase text-text-tertiary cursor-help"
        >
          impact: {issue.impact}
        </span>
        <span className="text-xs font-bold text-text-primary">{issue.label}</span>
      </div>
      {issue.detail && (
        <p className="text-xs text-text-secondary leading-relaxed">{issue.detail}</p>
      )}
      {issue.fix && (
        <p className="mt-1 text-xs text-accent-400">
          <span className="font-bold">Fix: </span>
          {issue.fix}
        </p>
      )}
      {hasMore && (
        <>
          {showMore && (
            <p className="mt-2 rounded-lg border border-border-subtle bg-surface-elevated/50 p-2 text-[11px] text-text-tertiary leading-relaxed">
              <span className="font-bold text-text-secondary">Why this matters · </span>
              {issue.why_it_matters}
            </p>
          )}
          <button
            type="button"
            onClick={() => setShowMore(v => !v)}
            className="mt-1 text-[11px] font-bold text-brand-400 hover:text-brand-300"
          >
            {showMore ? "Hide explanation" : "Why does this matter?"}
          </button>
        </>
      )}
    </li>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
  valueClass = "text-text-primary",
  tooltip,
}: {
  label: string;
  value: number;
  sub: string;
  accent: string;
  valueClass?: string;
  tooltip?: string;
}) {
  return (
    <div
      className={`rounded-2xl border ${accent} p-5 ${tooltip ? "cursor-help" : ""}`}
      title={tooltip}
    >
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">{label}</p>
      <p className={`text-3xl font-black ${valueClass}`}>{value}</p>
      <p className="mt-1 text-[11px] text-text-tertiary">{sub}</p>
    </div>
  );
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function groupIssuesByCategory(
  issues: PersistedBlogAudit["analysis"]["issues"]
): Partial<Record<IssueCategory, PersistedBlogAudit["analysis"]["issues"]>> {
  const out: Partial<Record<IssueCategory, PersistedBlogAudit["analysis"]["issues"]>> = {};
  for (const i of issues) {
    const cat: IssueCategory = (i.category as IssueCategory) ?? "content";
    (out[cat] ||= []).push(i);
  }
  return out;
}
