"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Keyword, KeywordStatus } from "@/lib/types";
import {
  discoverKeywords,
  getKeywords,
  updateKeywordStatus,
  bulkUpdateKeywordStatus,
  deleteAllKeywords,
  approveKeywordCluster,
} from "@/app/actions/keyword-actions";
import {
  getBusinessBrief,
  generateBusinessBrief,
} from "@/app/actions/brief-actions";
import type { BusinessBrief } from "@/lib/business-brief";
import type { DataForSEOTraceEntry } from "@/lib/dataforseo";
import {
  findCompetitorGaps,
  importGapKeywords,
  analyzeKeywordGapsAction,
} from "@/app/actions/research-actions";
import { generateBlogFromOpportunity } from "@/app/actions/competitor-actions";
import type { CompetitorGapKeyword } from "@/lib/research";

const STATUS_COLORS: Record<KeywordStatus, string> = {
  approved: "bg-accent-500/10 text-accent-400 border-accent-500/20",
  rejected: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  pending: "bg-surface-elevated text-text-tertiary border-border-subtle",
};

const KD_COLOR = (kd: number) =>
  kd < 30 ? "text-accent-400" : kd < 60 ? "text-yellow-400" : "text-rose-400";
const KD_LABEL = (kd: number) =>
  kd === 0 ? "—" : kd < 30 ? "Easy" : kd < 60 ? "Medium" : "Hard";

function gapRowKey(g: CompetitorGapKeyword) {
  return `${g.keyword}|||${g.competitorDomain}|||${g.sourceUrl || ""}`;
}

type Tab = "keywords" | "competitor_gap";
type FilterTab = "all" | KeywordStatus;

export default function KeywordsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("keywords");
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"volume" | "kd" | "ai_score" | "analysis_score">(
    "analysis_score"
  );
  const [error, setError] = useState("");

  const [gaps, setGaps] = useState<CompetitorGapKeyword[]>([]);
  const [gapLoading, setGapLoading] = useState(false);
  const [gapError, setGapError] = useState("");
  const [autoDiscoveredCompetitors, setAutoDiscoveredCompetitors] = useState<string[]>([]);
  const [selectedGapKeys, setSelectedGapKeys] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const [analysisMd, setAnalysisMd] = useState("");
  const [clusterKeywords, setClusterKeywords] = useState<string[]>([]);
  const [clusterPick, setClusterPick] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [generatingGapKeyword, setGeneratingGapKeyword] = useState<string | null>(null);

  const [brief, setBrief] = useState<BusinessBrief | null>(null);
  const [briefUpdatedAt, setBriefUpdatedAt] = useState<string | null>(null);
  const [refreshingBrief, setRefreshingBrief] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);

  const step1Done = keywords.length > 0;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getKeywords(projectId);
    if (res.success) setKeywords(res.data);
    setLoading(false);
  }, [projectId]);

  const loadBrief = useCallback(async () => {
    const res = await getBusinessBrief(projectId);
    if (res.success) {
      setBrief(res.brief);
      setBriefUpdatedAt(res.updated_at ?? null);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    void loadBrief();
  }, [load, loadBrief]);

  const handleDiscover = async () => {
    setDiscovering(true);
    setError("");
    const res = await discoverKeywords(projectId);
    const typed = res as {
      discoveryTrace?: DataForSEOTraceEntry[];
      briefSummary?: {
        summary: string;
        seed_count: number;
        scraped_urls: string[];
        scraped_chars: number;
        generated_at: string;
      } | null;
      relevance?: { kept: number; dropped: number; threshold: number; reason?: string } | null;
    };
    if (typed.briefSummary) {
      console.groupCollapsed(`[Keywords] Business brief — seeds used to drive this run`);
      console.log("summary", typed.briefSummary.summary);
      console.log("seed_count", typed.briefSummary.seed_count);
      console.log("scraped_urls", typed.briefSummary.scraped_urls);
      console.log("scraped_chars", typed.briefSummary.scraped_chars);
      console.log("brief_generated_at", typed.briefSummary.generated_at);
      console.groupEnd();
    }
    if (typed.relevance) {
      console.groupCollapsed(
        `[Keywords] Relevance filter — kept ${typed.relevance.kept}, dropped ${typed.relevance.dropped}`
      );
      console.log("threshold", typed.relevance.threshold);
      if (typed.relevance.reason) console.log("reason", typed.relevance.reason);
      console.groupEnd();
    }
    if (typed.discoveryTrace?.length) {
      console.groupCollapsed(
        `[Keywords] DataForSEO — this Discover / Re-discover run (${typed.discoveryTrace.length} calls)`
      );
      for (const t of typed.discoveryTrace) {
        console.groupCollapsed(`${t.label}  HTTP ${t.httpStatus}${t.ok ? "" : " ✗"}`);
        console.log("url", t.url);
        console.log("request body", t.requestBody);
        if (typeof t.cost === "number") console.log("cost (credits)", t.cost);
        if (t.fetchError) console.warn("fetchError", t.fetchError);
        if (t.parseError) console.warn("parseError", t.parseError);
        console.log("rawText", t.rawText);
        console.log("parsed JSON", t.parsed);
        console.groupEnd();
      }
      console.groupEnd();
    }
    if (res.success) {
      await load();
      await loadBrief();
    } else setError(res.error ?? "Discovery failed");
    setDiscovering(false);
  };

  const handleRefreshBrief = async () => {
    setRefreshingBrief(true);
    setError("");
    const res = await generateBusinessBrief(projectId, { force: true });
    if (res.trace?.length) {
      console.groupCollapsed(
        `[Brief] Refresh — scraped ${res.trace.filter(t => t.label === "jina_read" && t.ok).length} pages`
      );
      for (const t of res.trace) {
        console.log(t.label, { url: t.url, ok: t.ok, length: t.length, error: t.error });
      }
      console.groupEnd();
    }
    if (res.success && res.brief) {
      setBrief(res.brief);
      setBriefUpdatedAt(new Date().toISOString());
    } else {
      setError(res.error ?? "Failed to refresh business brief");
    }
    setRefreshingBrief(false);
  };

  const handleStatusUpdate = async (kwId: string, status: KeywordStatus) => {
    setKeywords(prev => prev.map(k => (k.id === kwId ? { ...k, status } : k)));
    await updateKeywordStatus(kwId, status);
  };

  const handleBulkUpdate = async (status: KeywordStatus) => {
    const ids = [...selected];
    setKeywords(prev => prev.map(k => (ids.includes(k.id) ? { ...k, status } : k)));
    setSelected(new Set());
    await bulkUpdateKeywordStatus(ids, status);
  };

  const handleClearAll = async () => {
    if (!confirm("Delete all keywords for this project? Cannot be undone.")) return;
    await deleteAllKeywords(projectId);
    setKeywords([]);
    setGaps([]);
    setAnalysisMd("");
    setClusterKeywords([]);
    setClusterPick(new Set());
  };

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const filtered = useMemo(() => {
    const scoreOf = (k: Keyword, key: typeof sortBy): number => {
      if (key === "analysis_score") return k.keyword_analysis_score ?? 0;
      return (k[key] ?? 0) as number;
    };
    const list = keywords
      .filter(k => filter === "all" || k.status === filter)
      .sort((a, b) => scoreOf(b, sortBy) - scoreOf(a, sortBy));
    // Product rule: the pipeline caps discovery + clustering at 100 keywords.
    // Older projects may have more rows from a prior run — we display the
    // top-100 by the active sort (defaults to keyword_analysis_score desc).
    return list.slice(0, 100);
  }, [keywords, filter, sortBy]);

  const toggleSelectAll = () => {
    const visible = filtered.map(k => k.id);
    const allSelected = visible.length > 0 && visible.every(id => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(visible));
  };

  const handleFindGaps = async () => {
    if (!step1Done) return;
    setGapLoading(true);
    setGapError("");
    setGaps([]);
    setAnalysisMd("");
    setClusterKeywords([]);
    setClusterPick(new Set());
    setAutoDiscoveredCompetitors([]);
    const res = await findCompetitorGaps(projectId);
    if (res.success) {
      setGaps(res.data);
      if (res.autoDiscoveredCompetitors?.length) {
        setAutoDiscoveredCompetitors(res.autoDiscoveredCompetitors);
      }
    } else {
      setGapError(res.error ?? "Failed to find competitor gaps");
    }
    setGapLoading(false);
  };

  const toggleGapKey = (key: string) =>
    setSelectedGapKeys(prev => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });

  const toggleAllGaps = () => {
    const keys = gaps.map(gapRowKey);
    const allOn = keys.length > 0 && keys.every(k => selectedGapKeys.has(k));
    setSelectedGapKeys(allOn ? new Set() : new Set(keys));
  };

  const handleGenerateBlogFromGap = async (keyword: string) => {
    setGeneratingGapKeyword(keyword);
    const res = await generateBlogFromOpportunity(projectId, keyword);
    setGeneratingGapKeyword(null);
    if (res.success) {
      router.push(`/projects/${projectId}/calendar`);
    } else {
      setGapError(res.error ?? "Could not create calendar entry.");
    }
  };

  const handleImportGaps = async () => {
    if (!selectedGapKeys.size) return;
    const picked = gaps.filter(g => selectedGapKeys.has(gapRowKey(g)));
    setImporting(true);
    const res = await importGapKeywords(projectId, picked);
    if (res.success) {
      await load();
      setSelectedGapKeys(new Set());
      setGaps([]);
      setAnalysisMd("");
      setClusterKeywords([]);
      setClusterPick(new Set());
      setActiveTab("keywords");
    }
    setImporting(false);
  };

  const handleAnalyze = async () => {
    if (!gaps.length) {
      setAnalysisError("Run a competitor scan first so we can compare real pages to your keyword set.");
      return;
    }
    if (!keywords.length) {
      setAnalysisError("Discover industry keywords in step 1 first.");
      return;
    }
    setAnalyzing(true);
    setAnalysisError("");
    setAnalysisMd("");
    setClusterKeywords([]);
    setClusterPick(new Set());
    const res = await analyzeKeywordGapsAction(projectId, gaps);
    if (res.success) {
      setAnalysisMd(res.analysisMarkdown ?? "");
      const list = res.clusterKeywords ?? [];
      setClusterKeywords(list);
      setClusterPick(new Set(list));
    } else {
      setAnalysisError(("error" in res && res.error) || "Analysis failed");
    }
    setAnalyzing(false);
  };

  const toggleClusterPhrase = (phrase: string) =>
    setClusterPick(prev => {
      const s = new Set(prev);
      s.has(phrase) ? s.delete(phrase) : s.add(phrase);
      return s;
    });

  const handleApproveCluster = async () => {
    const list = [...clusterPick];
    if (list.length < 5) {
      setAnalysisError("Pick at least 5 keywords for a 30-day calendar (or approve more in step 1).");
      return;
    }
    setAnalysisError("");
    const res = await approveKeywordCluster(projectId, list);
    if (!res.success) {
      setAnalysisError(("error" in res && res.error) || "Could not approve cluster");
      return;
    }
    await load();
    const refreshed = await getKeywords(projectId);
    const approvedTotal =
      refreshed.success ? refreshed.data.filter(k => k.status === "approved").length : 0;
    if (approvedTotal < 5) {
      setAnalysisError(
        `Only ${approvedTotal} approved keywords in this project after matching. Add or import more so you have at least 5 approved before opening the calendar.`
      );
      return;
    }
    router.push(`/projects/${projectId}/calendar`);
  };

  const counts = {
    all: keywords.length,
    pending: keywords.filter(k => k.status === "pending").length,
    approved: keywords.filter(k => k.status === "approved").length,
    rejected: keywords.filter(k => k.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-primary mb-1">
            Keyword <span className="gradient-text">workflow</span>
          </h1>
          <p className="text-text-tertiary text-sm max-w-xl">
            Step 1: discover industry demand. Step 2: see what competitors publish, compare both, pick a cluster, then
            open the calendar to generate blogs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/projects/${projectId}/audit`}
            className="px-4 py-2.5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 text-xs font-bold hover:bg-yellow-500/15 transition-all inline-flex items-center gap-2"
          >
            Content health
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          {counts.approved >= 5 && (
            <Link
              href={`/projects/${projectId}/calendar`}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white text-xs font-bold shadow-md shadow-accent-500/20 hover:-translate-y-0.5 transition-all inline-flex items-center gap-2"
            >
              Calendar
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          )}
          <button
            onClick={handleDiscover}
            disabled={discovering}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-xs font-bold shadow-md shadow-brand-500/20 hover:from-brand-400 hover:to-brand-500 transition-all disabled:opacity-60 flex items-center gap-2"
          >
            {discovering ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{" "}
                Discovering…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                {keywords.length > 0 ? "Re-discover" : "Discover keywords"}
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center rounded-2xl border border-border-subtle bg-surface-secondary/30 p-4 text-sm">
        <div className={`flex items-center gap-3 ${step1Done ? "text-accent-400" : "text-text-tertiary"}`}>
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
              step1Done ? "bg-accent-500 text-white" : "bg-surface-elevated border border-border-subtle"
            }`}
          >
            1
          </span>
          <div>
            <p className="font-bold text-text-primary">Industry keywords</p>
            <p className="text-xs text-text-tertiary">Search volume, difficulty, approve the best seeds.</p>
          </div>
        </div>
        <span className="hidden sm:block text-text-tertiary">→</span>
        <div className={`flex items-center gap-3 ${step1Done ? "text-cyan-400" : "text-text-tertiary opacity-60"}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-elevated text-xs font-black text-text-secondary">
            2
          </span>
          <div>
            <p className="font-bold text-text-primary">Competitor gaps</p>
            <p className="text-xs text-text-tertiary">Scan competitor sites, compare, pick a writing cluster.</p>
          </div>
        </div>
      </div>

      <div className="glass-card border border-brand-500/15 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">Business brief</p>
              {brief ? (
                <p className="text-xs text-text-tertiary">
                  {brief.seed_phrases.length} seeds · scraped {brief.source_urls.length} pages
                  {briefUpdatedAt ? ` · updated ${new Date(briefUpdatedAt).toLocaleString()}` : ""}
                </p>
              ) : (
                <p className="text-xs text-text-tertiary">
                  No brief yet — we'll auto-build one on your first Discover click.
                </p>
              )}
              {brief?.summary ? (
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-text-secondary line-clamp-2">
                  {brief.summary}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {brief ? (
              <button
                type="button"
                onClick={() => setBriefOpen(o => !o)}
                className="rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-xs font-bold text-text-secondary hover:border-brand-500/30"
              >
                {briefOpen ? "Hide details" : "View details"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleRefreshBrief}
              disabled={refreshingBrief}
              className="flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-400 hover:bg-brand-500/20 disabled:opacity-60"
            >
              {refreshingBrief ? (
                <>
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-brand-400/30 border-t-brand-400" />
                  Scraping…
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  {brief ? "Refresh brief" : "Generate brief"}
                </>
              )}
            </button>
          </div>
        </div>

        {briefOpen && brief ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {brief.products.length ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Products</p>
                <div className="flex flex-wrap gap-1.5">
                  {brief.products.map(p => (
                    <span key={p} className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-text-secondary">{p}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {brief.entities.length ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Entities</p>
                <div className="flex flex-wrap gap-1.5">
                  {brief.entities.slice(0, 18).map(e => (
                    <span key={e} className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-text-secondary">{e}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {brief.audiences.length ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Audiences</p>
                <ul className="space-y-0.5 text-xs text-text-secondary">
                  {brief.audiences.map(a => <li key={a}>· {a}</li>)}
                </ul>
              </div>
            ) : null}
            {brief.usps.length ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">USPs</p>
                <ul className="space-y-0.5 text-xs text-text-secondary">
                  {brief.usps.map(u => <li key={u}>· {u}</li>)}
                </ul>
              </div>
            ) : null}
            {brief.seed_phrases.length ? (
              <div className="md:col-span-2">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                  Seed phrases ({brief.seed_phrases.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {brief.seed_phrases.map(s => (
                    <span key={s} className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-0.5 text-xs text-brand-400">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {brief.source_urls.length ? (
              <div className="md:col-span-2">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Scraped pages</p>
                <ul className="space-y-0.5 text-xs">
                  {brief.source_urls.map(u => (
                    <li key={u} className="truncate">
                      <a href={u} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">{u}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border-subtle bg-surface-secondary/50 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("keywords")}
          className={`rounded-lg px-5 py-2 text-xs font-bold transition-all ${
            activeTab === "keywords" ? "bg-brand-500 text-white shadow-sm" : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          1 · Industry ({keywords.length})
        </button>
        <button
          type="button"
          onClick={() => step1Done && setActiveTab("competitor_gap")}
          disabled={!step1Done}
          title={!step1Done ? "Discover industry keywords in step 1 first" : undefined}
          className={`rounded-lg px-5 py-2 text-xs font-bold transition-all ${
            activeTab === "competitor_gap"
              ? "bg-brand-500 text-white shadow-sm"
              : step1Done
                ? "text-text-tertiary hover:text-text-secondary"
                : "cursor-not-allowed text-text-tertiary opacity-50"
          }`}
        >
          2 · Competitor gaps
        </button>
      </div>

      {activeTab === "keywords" && (
        <>
          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400">
              {error}
            </div>
          )}

          {keywords.length > 0 && (
            <div className="glass-card flex flex-wrap items-center gap-6 p-5">
              <div>
                <p className="mb-1 text-xs text-text-tertiary">Approved</p>
                <p className="text-2xl font-black text-accent-400">
                  {counts.approved}{" "}
                  <span className="text-sm font-normal text-text-tertiary">/ {keywords.length}</span>
                </p>
              </div>
              <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-400 transition-all"
                  style={{ width: `${Math.min((counts.approved / keywords.length) * 100, 100)}%` }}
                />
              </div>
              <div className="text-right text-xs text-text-tertiary">
                {counts.approved < 5 ? `${5 - counts.approved} more approvals unlock the calendar wizard` : "Ready for calendar"}
                {keywords.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="mt-1 block text-[10px] text-text-tertiary hover:text-rose-400"
                  >
                    Clear all keywords
                  </button>
                )}
              </div>
            </div>
          )}

          {keywords.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-1 rounded-xl border border-border-subtle bg-surface-secondary/50 p-1">
                {(["all", "pending", "approved", "rejected"] as FilterTab[]).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilter(tab)}
                    className={`rounded-lg px-4 py-1.5 text-xs font-bold capitalize transition-all ${
                      filter === tab ? "bg-brand-500 text-white" : "text-text-tertiary hover:text-text-secondary"
                    }`}
                  >
                    {tab} ({counts[tab]})
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-text-tertiary">Sort:</span>
                {(["analysis_score", "volume", "kd", "ai_score"] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSortBy(s)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      sortBy === s ? "bg-surface-elevated text-text-primary" : "text-text-tertiary hover:text-text-secondary"
                    }`}
                  >
                    {s === "analysis_score"
                      ? "Analysis score"
                      : s === "ai_score"
                        ? "AI score"
                        : s === "kd"
                          ? "Difficulty"
                          : "Volume"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-500/20 bg-brand-500/10 p-4">
              <span className="text-sm font-bold text-brand-400">{selected.size} selected</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkUpdate("approved")}
                  className="rounded-lg border border-accent-500/20 bg-accent-500/10 px-4 py-1.5 text-xs font-bold text-accent-400 hover:bg-accent-500/20"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkUpdate("rejected")}
                  className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkUpdate("pending")}
                  className="rounded-lg border border-border-subtle bg-surface-elevated px-4 py-1.5 text-xs font-bold text-text-tertiary hover:bg-glass"
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-16 w-full animate-pulse rounded-2xl border border-border-subtle bg-surface-secondary/50" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-secondary/30 backdrop-blur-md">
              <div className="overflow-x-auto">
                {/* `table-fixed` + per-column widths keeps the 12 columns inside
                    the viewport on 1280-px screens. Users can still scroll the
                    wrapper horizontally on narrower windows. */}
                <table className="w-full min-w-[1100px] text-left">
                  <thead className="bg-surface-tertiary/50 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                    <tr>
                      <th className="w-8 px-2 py-2.5">
                        <input
                          type="checkbox"
                          checked={filtered.length > 0 && filtered.every(k => selected.has(k.id))}
                          onChange={toggleSelectAll}
                          className="rounded"
                        />
                      </th>
                      <th className="px-2 py-2.5">Keyword</th>
                      <th className="px-2 py-2.5 text-right">Volume</th>
                      <th className="px-2 py-2.5 text-center">KD</th>
                      <th className="px-2 py-2.5 text-right">CPC</th>
                      <th className="px-2 py-2.5 text-center">Trend</th>
                      <th className="px-2 py-2.5 text-center">Intent</th>
                      <th className="px-2 py-2.5 text-center">Comp</th>
                      <th className="px-2 py-2.5 text-center" title="Legacy AI score">AI</th>
                      <th
                        className="px-2 py-2.5 text-center"
                        title="Keyword Analysis Score — composite of relevance, business-fit, intent, KD, volume, CPC and SERP opportunity"
                      >
                        Analysis
                      </th>
                      <th className="px-2 py-2.5 text-center">Status</th>
                      <th className="px-2 py-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {filtered.map(kw => (
                      <tr
                        key={kw.id}
                        className={`transition-colors hover:bg-white/[0.02] ${selected.has(kw.id) ? "bg-brand-500/5" : ""}`}
                      >
                        <td className="px-2 py-2.5">
                          <input
                            type="checkbox"
                            checked={selected.has(kw.id)}
                            onChange={() => toggleSelect(kw.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-2 py-2.5">
                          <p className="text-sm font-semibold text-text-primary">{kw.keyword}</p>
                          {kw.gap_competitor ? (
                            <p className="text-[10px] text-cyan-400/90">Gap · {kw.gap_competitor}</p>
                          ) : null}
                          {(typeof kw.relevance_score === "number" && kw.relevance_score > 0) ||
                          (typeof kw.business_fit_score === "number" && kw.business_fit_score > 0) ? (
                            <p
                              className="mt-0.5 text-[10px] text-text-tertiary"
                              title="Relevance = syntactic match to niche/phrase anchors. Fit = tiered business-fit (100 = niche × buying-intent match)."
                            >
                              Rel {typeof kw.relevance_score === "number" ? kw.relevance_score : "—"} ·
                              Fit {typeof kw.business_fit_score === "number" ? kw.business_fit_score : "—"}
                            </p>
                          ) : null}
                          {kw.secondary_keywords?.length ? (
                            <p className="max-w-xs truncate text-[10px] text-text-tertiary">
                              {kw.secondary_keywords.slice(0, 3).join(" · ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-2.5 text-right text-sm font-bold text-text-primary">
                          {kw.volume ? kw.volume.toLocaleString() : "—"}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {kw.kd > 0 ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-elevated">
                                <div
                                  className={`h-full rounded-full ${
                                    kw.kd < 30 ? "bg-accent-500" : kw.kd < 60 ? "bg-yellow-500" : "bg-rose-500"
                                  }`}
                                  style={{ width: `${kw.kd}%` }}
                                />
                              </div>
                              <span className={`text-[11px] font-bold ${KD_COLOR(kw.kd)}`}>{KD_LABEL(kw.kd)}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right text-xs text-text-secondary">
                          {kw.cpc > 0 ? `$${kw.cpc.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span
                            className={`text-xs font-bold ${
                              kw.trend?.startsWith("+") ? "text-accent-400" : "text-rose-400"
                            }`}
                          >
                            {kw.trend || "—"}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {kw.intent ? (
                            <span
                              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold capitalize ${
                                kw.intent === "commercial" || kw.intent === "transactional"
                                  ? "border-accent-500/20 bg-accent-500/10 text-accent-400"
                                  : kw.intent === "informational"
                                    ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-400"
                                    : "border-border-subtle bg-surface-elevated text-text-tertiary"
                              }`}
                            >
                              {kw.intent}
                            </span>
                          ) : (
                            <span className="text-xs text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {kw.competition_level ? (
                            <span
                              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                kw.competition_level === "LOW"
                                  ? "border-accent-500/20 bg-accent-500/10 text-accent-400"
                                  : kw.competition_level === "MEDIUM"
                                    ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
                                    : "border-rose-500/20 bg-rose-500/10 text-rose-400"
                              }`}
                            >
                              {kw.competition_level}
                            </span>
                          ) : (
                            <span className="text-xs text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-0.5 text-xs font-black text-brand-400">
                            {kw.ai_score}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {typeof kw.keyword_analysis_score === "number" && kw.keyword_analysis_score > 0 ? (
                            <span className="rounded-full border border-accent-500/20 bg-accent-500/10 px-2 py-0.5 text-xs font-black text-accent-400">
                              {Math.round(kw.keyword_analysis_score)}
                            </span>
                          ) : (
                            <span className="text-xs text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${STATUS_COLORS[kw.status]}`}
                          >
                            {kw.status}
                          </span>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex justify-center gap-1">
                            {kw.status !== "approved" && (
                              <button
                                type="button"
                                onClick={() => handleStatusUpdate(kw.id, "approved")}
                                className="rounded-lg bg-accent-500/10 p-1.5 text-accent-400 hover:bg-accent-500/20"
                                title="Approve"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                                </svg>
                              </button>
                            )}
                            {kw.status !== "rejected" && (
                              <button
                                type="button"
                                onClick={() => handleStatusUpdate(kw.id, "rejected")}
                                className="rounded-lg bg-rose-500/10 p-1.5 text-rose-400 hover:bg-rose-500/20"
                                title="Reject"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                            {kw.status !== "pending" && (
                              <button
                                type="button"
                                onClick={() => handleStatusUpdate(kw.id, "pending")}
                                className="rounded-lg bg-surface-elevated p-1.5 text-text-tertiary hover:bg-glass"
                                title="Reset"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                                  />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            !discovering && (
              <div className="rounded-3xl border-2 border-dashed border-border-subtle py-24 text-center">
                <div className="mb-4 text-5xl">🔍</div>
                <h3 className="mb-2 text-lg font-bold text-text-secondary">No keywords yet</h3>
                <p className="mb-6 text-sm text-text-tertiary">
                  Run discovery to pull real search data for your niche, then continue to competitor gaps.
                </p>
                <button
                  type="button"
                  onClick={handleDiscover}
                  className="rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 px-8 py-3.5 font-bold text-white shadow-lg shadow-brand-500/20 hover:-translate-y-0.5"
                >
                  Discover keywords
                </button>
              </div>
            )
          )}
        </>
      )}

      {activeTab === "competitor_gap" && (
        <div className="space-y-6">
          {!step1Done ? (
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-200/90">
              Run step 1 and discover at least one batch of industry keywords before scanning competitors.
            </div>
          ) : (
            <>
              <div className="glass-card border-cyan-500/10 bg-gradient-to-br from-cyan-500/5 to-transparent p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="mb-1 font-bold text-text-primary">Competitor keyword gap scan</h3>
                    <p className="text-sm leading-relaxed text-text-tertiary max-w-2xl">
                      We read competitor SERPs for your niche, hydrate volumes from DataForSEO, and skip topics you
                      already saved. If you haven&apos;t added competitors yet, we auto-discover the top domains
                      ranking for your niche and save them to the project. For the full pipeline — page-level
                      benchmarks, opportunity scores, and one-click publishing — open the Competitor Insights
                      dashboard.
                    </p>
                  </div>
                  <Link
                    href={`/projects/${projectId}/competitors`}
                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-400 hover:bg-cyan-500/20 transition-all"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="6" />
                      <circle cx="12" cy="12" r="2" />
                    </svg>
                    Competitor Insights
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </Link>
                </div>
              </div>

              {gapError && (
                <div className="flex gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400">
                  <div>
                    {gapError}
                    <Link href={`/projects/${projectId}`} className="mt-1 block text-xs text-brand-400 hover:underline">
                      Add competitors on the project overview
                    </Link>
                  </div>
                </div>
              )}

              {autoDiscoveredCompetitors.length > 0 && (
                <div className="flex gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-200">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z" />
                  </svg>
                  <div className="space-y-1">
                    <div className="font-bold text-cyan-100">
                      No competitors on file — auto-discovered from search
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {autoDiscoveredCompetitors.map(domain => (
                        <span
                          key={domain}
                          className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-100"
                        >
                          {domain}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-cyan-300/80">
                      Saved to this project so future runs reuse them. You can edit the list any time on the project overview.
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleFindGaps}
                  disabled={gapLoading || !step1Done}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-cyan-500/20 transition-all hover:from-cyan-400 hover:to-cyan-500 disabled:opacity-60"
                >
                  {gapLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Scanning…
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" />
                        <circle cx="12" cy="12" r="6" />
                        <circle cx="12" cy="12" r="2" />
                      </svg>
                      Find competitor gaps
                    </>
                  )}
                </button>
                {selectedGapKeys.size > 0 && (
                  <button
                    type="button"
                    onClick={handleImportGaps}
                    disabled={importing}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-accent-500/20 transition-all hover:-translate-y-0.5 disabled:opacity-60"
                  >
                    {importing ? "Importing…" : `Import ${selectedGapKeys.size} into keyword list`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzing || !gaps.length || !keywords.length}
                  className="rounded-xl border border-border-default bg-surface-elevated px-5 py-2.5 text-xs font-bold text-text-primary hover:border-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {analyzing ? "Analyzing…" : "Compare & analyze content gaps"}
                </button>
              </div>

              {analysisError && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-400">{analysisError}</div>
              )}

              {gapLoading && (
                <div className="space-y-3">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-2xl border border-border-subtle bg-surface-secondary/50" />
                  ))}
                </div>
              )}

              {!gapLoading && gaps.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                    <p className="text-sm font-bold text-text-primary">{gaps.length} competitor-led topics</p>
                    <button type="button" onClick={toggleAllGaps} className="text-xs font-bold text-brand-400 hover:underline">
                      {gaps.every(g => selectedGapKeys.has(gapRowKey(g))) ? "Deselect all" : "Select all"}
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-secondary/30 backdrop-blur-md">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-surface-tertiary/50 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                          <tr>
                            <th className="w-10 px-4 py-3" />
                            <th className="px-4 py-3">Topic</th>
                            <th className="px-4 py-3">Competitor</th>
                            <th className="px-4 py-3">Source page</th>
                            <th className="px-4 py-3 text-right">Volume</th>
                            <th className="px-4 py-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                          {gaps.map(gap => {
                            const key = gapRowKey(gap);
                            return (
                              <tr key={key} className={`hover:bg-white/[0.02] ${selectedGapKeys.has(key) ? "bg-cyan-500/5" : ""}`}>
                                <td className="px-4 py-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedGapKeys.has(key)}
                                    onChange={() => toggleGapKey(key)}
                                    className="rounded"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-sm font-semibold text-text-primary">{gap.keyword}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-xs font-bold text-cyan-400">
                                    {gap.competitorDomain}
                                  </span>
                                </td>
                                <td className="max-w-[min(360px,40vw)] px-4 py-3">
                                  <p className="truncate text-xs text-text-tertiary" title={gap.sourceTitle}>
                                    {gap.sourceTitle}
                                  </p>
                                  {gap.sourceUrl ? (
                                    <a
                                      href={gap.sourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="mt-1 inline-flex text-[11px] font-bold text-brand-400 hover:underline"
                                    >
                                      Open page ↗
                                    </a>
                                  ) : (
                                    <span className="mt-1 block text-[10px] text-text-tertiary">No direct URL</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-bold text-text-primary">
                                  {gap.estimatedVolume > 0 ? gap.estimatedVolume.toLocaleString() : "—"}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleGenerateBlogFromGap(gap.keyword)}
                                    disabled={generatingGapKeyword === gap.keyword}
                                    className="rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-brand-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-60"
                                  >
                                    {generatingGapKeyword === gap.keyword ? "Queuing…" : "Generate blog"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {!gapLoading && gaps.length === 0 && !gapError && (
                <div className="rounded-3xl border-2 border-dashed border-border-subtle py-16 text-center text-sm text-text-tertiary">
                  Run a scan to load competitor topics, then run analysis without importing if you only want a report—or
                  import rows you want in your master list.
                </div>
              )}

              {analysisMd ? (
                <div className="glass-card border border-border-subtle p-6">
                  <h3 className="mb-4 font-bold text-text-primary">Gap analysis</h3>
                  <div className="max-w-none text-sm leading-relaxed text-text-secondary [&_a]:text-brand-400 [&_a]:underline [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-text-primary [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-bold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisMd}</ReactMarkdown>
                  </div>
                </div>
              ) : null}

              {clusterKeywords.length > 0 && (
                <div className="glass-card border border-brand-500/15 p-6">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-text-primary">Final cluster for blogs</h3>
                      <p className="text-xs text-text-tertiary">
                        We only approve phrases that already exist in your keyword list (import gaps first if they are
                        missing). Need at least 5 checked to start the calendar.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleApproveCluster}
                      className="rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-accent-500/20 hover:-translate-y-0.5"
                    >
                      Approve cluster &amp; open calendar ({clusterPick.size} selected)
                    </button>
                  </div>
                  <div className="flex max-h-64 flex-col flex-wrap gap-2 overflow-y-auto rounded-xl border border-border-subtle bg-surface-primary/40 p-3">
                    {clusterKeywords.map(phrase => (
                      <label
                        key={phrase}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/[0.04]"
                      >
                        <input
                          type="checkbox"
                          checked={clusterPick.has(phrase)}
                          onChange={() => toggleClusterPhrase(phrase)}
                          className="rounded"
                        />
                        <span className="text-text-primary">{phrase}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
