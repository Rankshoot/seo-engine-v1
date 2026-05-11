"use client";

import type { ReactNode } from "react";
import type { PersistedBlogAudit } from "@/app/actions/audit-actions";
import { ProjectNavLink } from "@/components/ProjectNavLink";

function healthColor(score: number): string {
  if (score >= 75) return "text-accent-400";
  if (score >= 50) return "text-yellow-400";
  return "text-rose-400";
}

const SEVERITY_BADGE: Record<"high" | "medium" | "low", string> = {
  high: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  medium: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  low: "border-accent-500/30 bg-accent-500/10 text-accent-400",
};

const DEMAND_VERDICT: Record<
  NonNullable<PersistedBlogAudit["analysis"]["keyword_demand"]>["verdict"],
  string
> = {
  trending: "border-accent-500/40 bg-accent-500/10 text-accent-400",
  stable: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
  declining: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  niche: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  unknown: "border-border-subtle bg-surface-elevated text-text-tertiary",
};

function rubricCounts(rows: NonNullable<PersistedBlogAudit["analysis"]["quality_rubric"]>) {
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const r of rows) {
    if (r.status === "pass") pass++;
    else if (r.status === "warn") warn++;
    else fail++;
  }
  return { pass, warn, fail };
}

function issueSeverityCounts(issues: PersistedBlogAudit["analysis"]["issues"]) {
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const i of issues) {
    if (i.severity === "high") high++;
    else if (i.severity === "medium") medium++;
    else low++;
  }
  return { high, medium, low, total: issues.length };
}

export function ExternalAuditMetricsGrid({ record }: { record: PersistedBlogAudit }) {
  const a = record.analysis;
  const rubric = a.quality_rubric ?? [];
  const rc = rubric.length ? rubricCounts(rubric) : null;
  const ic = a.issues?.length ? issueSeverityCounts(a.issues) : null;
  const ahrefs = a.ahrefs_signals;
  const kd = a.keyword_demand;

  const tiles: Array<{ label: string; value: string; sub?: string; tone?: "default" | "accent" | "warn" | "rose" }> = [
    { label: "Health score", value: String(record.health_score), tone: record.health_score >= 75 ? "accent" : record.health_score >= 50 ? "warn" : "rose" },
    {
      label: "LLM quality",
      value: a.llm_quality_score != null ? String(a.llm_quality_score) : "—",
      sub: "Model holistic 0–100",
    },
    { label: "Words", value: record.word_count.toLocaleString(), sub: "On-page body" },
    { label: "Scraped", value: `${(record.scraped_chars / 1000).toFixed(1)}k chars`, sub: "Reader payload" },
    {
      label: "Page status",
      value: a.page_status === "ok" ? "OK" : a.page_status,
      sub: "Pre-flight + scrape",
    },
    {
      label: "Funnel",
      value: a.suggested_funnel_stage || "—",
      sub: "Intent guess",
    },
  ];

  if (ic) {
    tiles.push({
      label: "Issues",
      value: String(ic.total),
      sub: `${ic.high} high · ${ic.medium} med · ${ic.low} low`,
    });
  }
  if (rc) {
    tiles.push({
      label: "Quality rubric",
      value: `${rc.pass} pass`,
      sub: `${rc.warn} warn · ${rc.fail} fail`,
    });
  }
  if (ahrefs?.url_rating != null) {
    tiles.push({ label: "URL rating", value: String(ahrefs.url_rating), sub: "Ahrefs" });
  }
  if (ahrefs?.organic_keywords_top?.length) {
    tiles.push({
      label: "Ranking KWs",
      value: String(ahrefs.organic_keywords_top.length),
      sub: "Sample at URL",
    });
  }
  if (ahrefs?.inbound_internal_links_to_url != null) {
    tiles.push({
      label: "Internal in-links",
      value: String(ahrefs.inbound_internal_links_to_url),
      sub: "To this URL",
    });
  }
  if (kd && kd.volume > 0) {
    tiles.push({
      label: "Keyword volume",
      value: kd.volume.toLocaleString(),
      sub: `/mo · ${kd.verdict}`,
    });
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {tiles.map(t => (
        <div
          key={t.label}
          className="rounded-[10px] border border-border-subtle bg-surface-primary/80 px-3 py-2.5 min-h-[72px]"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary mb-0.5">{t.label}</p>
          <p
            className={`text-lg font-bold tabular-nums leading-tight ${
              t.tone === "accent"
                ? "text-accent-400"
                : t.tone === "warn"
                  ? "text-yellow-400"
                  : t.tone === "rose"
                    ? "text-rose-400"
                    : "text-text-primary"
            }`}
          >
            {t.value}
          </p>
          {t.sub ? <p className="text-[11px] text-text-tertiary mt-0.5 leading-snug">{t.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function ExternalAuditNarrativeSections({ record }: { record: PersistedBlogAudit }) {
  const a = record.analysis;
  const kd = a.keyword_demand;

  return (
    <div className="space-y-5">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary mb-1">Title</p>
          <p className="text-[15px] font-medium text-text-primary leading-snug">{record.title || "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary mb-1">Primary keyword</p>
          <p className="text-[15px] text-text-secondary">{record.primary_keyword || "—"}</p>
        </div>
      </div>

      {kd ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Demand</span>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${DEMAND_VERDICT[kd.verdict]}`}
          >
            {kd.verdict.replace(/_/g, " ")}
          </span>
          <span className="text-[13px] text-text-secondary">
            {kd.volume.toLocaleString()}/mo · trend {kd.trend_pct >= 0 ? "+" : ""}
            {kd.trend_pct}%
          </span>
        </div>
      ) : null}

      {a.summary ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary mb-1">Summary</p>
          <p className="text-[14px] text-text-secondary leading-relaxed">{a.summary}</p>
        </div>
      ) : null}

      {a.plain_language_verdict ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary mb-1">Verdict</p>
          <p className="text-[14px] text-text-secondary leading-relaxed">{a.plain_language_verdict}</p>
        </div>
      ) : null}

      {a.issues?.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary mb-2">Issues</p>
          <ul className="space-y-2.5 text-[14px] text-text-secondary">
            {a.issues.map((issue, i) => (
              <li key={i} className="leading-relaxed border-l-2 border-border-subtle pl-3">
                <span className="font-medium text-text-primary">{issue.label}</span>
                {issue.detail ? ` — ${issue.detail}` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {a.content_gaps?.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary mb-2">Content gaps</p>
          <ul className="list-disc pl-5 space-y-1 text-[13px] text-text-secondary">
            {a.content_gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {a.quality_rubric?.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary mb-2">
            Quality checklist
          </p>
          <ul className="space-y-1.5 text-[13px]">
            {a.quality_rubric.map(row => (
              <li key={row.id} className="flex gap-2 text-text-secondary">
                <span
                  className={
                    row.status === "pass"
                      ? "text-accent-400 shrink-0"
                      : row.status === "warn"
                        ? "text-yellow-400 shrink-0"
                        : "text-rose-400 shrink-0"
                  }
                >
                  {row.status === "pass" ? "✓" : row.status === "warn" ? "!" : "✗"}
                </span>
                <span>
                  <span className="font-medium text-text-primary">{row.label}</span>
                  {row.detail ? ` — ${row.detail}` : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ExternalAuditHeroHeader({
  record,
  scheduledLabel,
}: {
  record: PersistedBlogAudit;
  scheduledLabel?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle pb-4 mb-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary mb-1">Health score</p>
        <p className={`text-5xl font-black tabular-nums leading-none ${healthColor(record.health_score)}`}>
          {record.health_score}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 justify-end">
        {scheduledLabel ? (
          <span className="rounded-full border border-accent-500/35 bg-accent-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-400">
            {scheduledLabel}
          </span>
        ) : null}
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
            SEVERITY_BADGE[record.severity]
          }`}
        >
          {record.severity} severity
        </span>
      </div>
    </div>
  );
}

export function ExternalAuditActions({
  projectId,
  record,
  scheduleBusy,
  onSchedule,
  showSiteAuditLink = true,
  footer,
}: {
  projectId: string;
  record: PersistedBlogAudit;
  scheduleBusy: boolean;
  onSchedule: () => void;
  showSiteAuditLink?: boolean;
  footer?: ReactNode;
}) {
  const meta = record.analysis.analyze_page_meta;
  const already = meta?.calendar_scheduled && meta.calendar_scheduled_date;
  const canSchedule = Boolean(record.primary_keyword?.trim());

  return (
    <div className="space-y-2 pt-2 border-t border-border-subtle mt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {already ? (
          <span className="inline-flex items-center justify-center rounded-full border border-accent-500/35 bg-accent-500/10 px-4 py-2.5 text-[13px] font-medium text-accent-400">
            Scheduled · {meta.calendar_scheduled_date}
          </span>
        ) : (
          <button
            type="button"
            disabled={scheduleBusy || !canSchedule}
            onClick={onSchedule}
            className="rounded-full px-4 py-2.5 text-[13px] font-medium bg-text-primary text-surface-primary disabled:opacity-50"
          >
            {scheduleBusy ? "Scheduling…" : "Schedule keyword on calendar"}
          </button>
        )}
        {showSiteAuditLink ? (
          <ProjectNavLink
            href={`/projects/${projectId}/audit`}
            className="inline-flex items-center justify-center rounded-full border border-border-subtle px-4 py-2.5 text-[13px] font-medium text-text-primary hover:bg-surface-hover transition-colors"
          >
            Open Site audit list
          </ProjectNavLink>
        ) : null}
      </div>
      {!canSchedule && !already ? (
        <p className="text-[12px] text-text-tertiary">Primary keyword missing — cannot schedule from this audit.</p>
      ) : null}
      {footer}
    </div>
  );
}
