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
  loadMoreKeywords,
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
import { TableSkeleton } from "@/components/Skeleton";
import { KeywordDetailModal } from "@/components/KeywordDetailModal";

const STATUS_COLORS: Record<KeywordStatus, string> = {
  approved: "bg-brand-action/10 text-brand-action border-brand-action/20",
  rejected: "bg-brand-coral/10 text-brand-coral border-brand-coral/20",
  pending: "bg-surface-secondary text-text-tertiary border-border-subtle",
};

const KD_COLOR = (kd: number) =>
  kd < 30 ? "text-[#10b981]" : kd < 60 ? "text-[#f59e0b]" : "text-brand-coral";
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

  // Pagination — show 20 high-quality Ahrefs keywords first, expand on demand.
  const PAGE_SIZE = 20;
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Keyword drilldown modal. Stored as id (not a `Keyword` object) so the
  // modal always reflects the latest row state — including approve/reject
  // updates that happen via `handleStatusUpdate`.
  const [modalKeywordId, setModalKeywordId] = useState<string | null>(null);
  const modalKeyword = useMemo(
    () => keywords.find(k => k.id === modalKeywordId) ?? null,
    [keywords, modalKeywordId]
  );

  const step1Done = keywords.length > 0;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getKeywords(projectId, { limit: PAGE_SIZE, offset: 0 });
    if (res.success) {
      setKeywords(res.data);
      setSelected(new Set(res.data.filter(k => k.status === "approved").map(k => k.id)));
      setPendingTotal(res.total ?? res.data.length);
    }
    setLoading(false);
  }, [projectId]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    const currentPending = keywords.filter(k => k.status === "pending").length;
    const res = await loadMoreKeywords(projectId, currentPending, PAGE_SIZE);
    if (res.success) {
      setKeywords(prev => {
        const seen = new Set(prev.map(k => k.id));
        const fresh = res.data.filter(k => !seen.has(k.id));
        return [...prev, ...fresh];
      });
      setPendingTotal(res.total ?? pendingTotal);
    }
    setLoadingMore(false);
  }, [projectId, keywords, pendingTotal]);

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
    const previousKeywords = keywords;
    const previousSelected = selected;
    setError("");
    setKeywords(prev => prev.map(k => (k.id === kwId ? { ...k, status } : k)));
    setSelected(prev => {
      const next = new Set(prev);
      if (status === "approved") next.add(kwId);
      else next.delete(kwId);
      return next;
    });
    const res = await updateKeywordStatus(kwId, status);
    if (!res.success) {
      setKeywords(previousKeywords);
      setSelected(previousSelected);
      setError(res.error ?? "Could not update keyword status");
    }
  };

  const handleBulkUpdate = async (status: KeywordStatus) => {
    const ids = [...selected];
    setKeywords(prev => prev.map(k => (ids.includes(k.id) ? { ...k, status } : k)));
    setSelected(status === "approved" ? new Set(ids) : new Set());
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
    <div className="space-y-10 pb-16 max-w-full pl-4 pr-4 mx-auto">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="pt-4 pb-8 border-b border-border-subtle flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[48px] font-normal tracking-[-0.96px] leading-none text-text-primary font-display">
            Keyword workflow
          </h1>
          <p className="mt-3 text-[16px] text-text-tertiary max-w-[600px]">
            Step 1: discover industry demand. Step 2: see what competitors publish, compare both, pick a cluster, then
            open the calendar to generate blogs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/projects/${projectId}/audit`}
            className="rounded-[30px] border border-border-subtle bg-surface-primary px-5 py-2.5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors inline-flex items-center gap-2"
          >
            Content health
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          {counts.approved >= 5 && (
            <Link
              href={`/projects/${projectId}/calendar`}
              className="rounded-[30px] border border-border-subtle bg-surface-primary px-5 py-2.5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors inline-flex items-center gap-2"
            >
              Calendar
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          )}
          <button
            onClick={handleDiscover}
            disabled={discovering}
            className="rounded-[32px] bg-brand-primary px-6 py-2.5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
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

      {/* ── PROGRESS STEPS ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center rounded-[16px] border border-border-subtle bg-surface-elevated p-5">
        <div className={`flex items-center gap-4 ${step1Done ? "text-text-primary" : "text-text-tertiary"}`}>
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[14px] font-bold ${
              step1Done ? "bg-brand-primary text-brand-on-primary" : "bg-surface-tertiary text-text-tertiary"
            }`}
          >
            1
          </span>
          <div>
            <p className="text-[16px] font-medium leading-tight">Industry keywords</p>
            <p className="mt-1 text-[13px] text-text-tertiary">Search volume, difficulty, approve the best seeds.</p>
          </div>
        </div>
        <span className="hidden sm:block text-text-tertiary px-2">→</span>
        <div className={`flex items-center gap-4 ${step1Done ? "text-text-primary" : "text-text-tertiary opacity-60"}`}>
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[14px] font-bold ${
              activeTab === "competitor_gap" ? "bg-brand-primary text-brand-on-primary" : "bg-surface-tertiary text-text-tertiary"
            }`}
          >
            2
          </span>
          <div>
            <p className="text-[16px] font-medium leading-tight">Competitor gaps</p>
            <p className="mt-1 text-[13px] text-text-tertiary">Scan competitor sites, compare, pick a writing cluster.</p>
          </div>
        </div>
      </div>

      {/* ── BUSINESS BRIEF ─────────────────────────────────────────────────── */}
      <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-surface-tertiary text-text-primary">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
              </svg>
            </div>
            <div>
              <p className="text-[16px] font-medium text-text-primary">Business brief</p>
              {brief ? (
                <p className="mt-1 text-[13px] text-text-tertiary">
                  {brief.seed_phrases.length} seeds · scraped {brief.source_urls.length} pages
                  {briefUpdatedAt ? ` · updated ${new Date(briefUpdatedAt).toLocaleString()}` : ""}
                </p>
              ) : (
                <p className="mt-1 text-[13px] text-text-tertiary">
                  No brief yet — we'll auto-build one on your first Discover click.
                </p>
              )}
              {brief?.summary ? (
                <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-text-secondary line-clamp-2">
                  {brief.summary}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {brief ? (
              <button
                type="button"
                onClick={() => setBriefOpen(o => !o)}
                className="rounded-[4px] border border-border-subtle bg-surface-secondary px-4 py-2 text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                {briefOpen ? "Hide details" : "View details"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleRefreshBrief}
              disabled={refreshingBrief}
              className="flex items-center gap-2 rounded-[4px] border border-border-subtle bg-surface-secondary px-4 py-2 text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-60"
            >
              {refreshingBrief ? (
                <>
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-text-tertiary border-t-text-primary" />
                  Scraping…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  {brief ? "Refresh brief" : "Generate brief"}
                </>
              )}
            </button>
          </div>
        </div>

        {briefOpen && brief ? (
          <div className="mt-6 grid grid-cols-1 gap-6 border-t border-border-subtle pt-6 md:grid-cols-2">
            {brief.products.length ? (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Products</p>
                <div className="flex flex-wrap gap-2">
                  {brief.products.map(p => (
                    <span key={p} className="rounded-[4px] bg-surface-secondary px-2.5 py-1 text-[13px] text-text-secondary">{p}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {brief.entities.length ? (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Entities</p>
                <div className="flex flex-wrap gap-2">
                  {brief.entities.slice(0, 18).map(e => (
                    <span key={e} className="rounded-[4px] bg-surface-secondary px-2.5 py-1 text-[13px] text-text-secondary">{e}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {brief.audiences.length ? (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Audiences</p>
                <ul className="space-y-1 text-[13px] text-text-secondary">
                  {brief.audiences.map(a => <li key={a}>· {a}</li>)}
                </ul>
              </div>
            ) : null}
            {brief.usps.length ? (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">USPs</p>
                <ul className="space-y-1 text-[13px] text-text-secondary">
                  {brief.usps.map(u => <li key={u}>· {u}</li>)}
                </ul>
              </div>
            ) : null}
            {brief.seed_phrases.length ? (
              <div className="md:col-span-2">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
                  Seed phrases ({brief.seed_phrases.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {brief.seed_phrases.map(s => (
                    <span key={s} className="rounded-[4px] border border-brand-action/20 bg-brand-action/10 px-2.5 py-1 text-[13px] text-brand-action">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {brief.source_urls.length ? (
              <div className="md:col-span-2">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Scraped pages</p>
                <ul className="space-y-1 text-[13px]">
                  {brief.source_urls.map(u => (
                    <li key={u} className="truncate">
                      <a href={u} target="_blank" rel="noopener noreferrer" className="text-brand-action hover:underline">{u}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── TABS ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 rounded-[8px] border border-border-subtle bg-surface-secondary p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("keywords")}
          className={`rounded-[4px] px-4 py-2 text-[14px] font-medium transition-all ${
            activeTab === "keywords" ? "bg-surface-elevated text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          1 · Industry ({keywords.length})
        </button>
        <button
          type="button"
          onClick={() => step1Done && setActiveTab("competitor_gap")}
          disabled={!step1Done}
          title={!step1Done ? "Discover industry keywords in step 1 first" : undefined}
          className={`rounded-[4px] px-4 py-2 text-[14px] font-medium transition-all ${
            activeTab === "competitor_gap"
              ? "bg-surface-elevated text-text-primary shadow-sm"
              : step1Done
                ? "text-text-tertiary hover:text-text-secondary"
                : "cursor-not-allowed text-text-tertiary opacity-50"
          }`}
        >
          2 · Competitor gaps
        </button>
      </div>

      {/* ── TAB CONTENT: KEYWORDS ──────────────────────────────────────────── */}
      {activeTab === "keywords" && (
        <>
          {error && (
            <div className="flex items-center gap-3 rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-5 text-[14px] text-brand-coral">
              {error}
            </div>
          )}

          {keywords.length > 0 && (
            <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-6 flex flex-wrap items-center gap-6">
              <div>
                <p className="mb-1 text-[12px] font-bold uppercase tracking-widest text-text-tertiary">Approved</p>
                <p className="text-[28px] font-normal tracking-tight text-text-primary font-display">
                  {counts.approved}{" "}
                  <span className="text-[16px] text-text-tertiary">/ {keywords.length}</span>
                </p>
              </div>
              <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-surface-tertiary">
                <div
                  className="h-full rounded-full bg-brand-action transition-all"
                  style={{ width: `${Math.min((counts.approved / keywords.length) * 100, 100)}%` }}
                />
              </div>
              <div className="text-right text-[13px] text-text-tertiary">
                {counts.approved < 5 ? `${5 - counts.approved} more approvals unlock the calendar wizard` : "Ready for calendar"}
                {keywords.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="mt-1.5 block text-[12px] text-text-tertiary hover:text-brand-coral transition-colors"
                  >
                    Clear all keywords
                  </button>
                )}
              </div>
            </div>
          )}

          {keywords.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-1 rounded-[8px] border border-border-subtle bg-surface-secondary p-1">
                {(["all", "pending", "approved", "rejected"] as FilterTab[]).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilter(tab)}
                    className={`rounded-[4px] px-4 py-1.5 text-[13px] font-medium capitalize transition-all ${
                      filter === tab ? "bg-surface-elevated text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"
                    }`}
                  >
                    {tab} ({counts[tab]})
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-text-tertiary">Sort:</span>
                {(["analysis_score", "volume", "kd", "ai_score"] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSortBy(s)}
                    className={`rounded-[4px] px-3 py-1.5 text-[13px] font-medium transition-all ${
                      sortBy === s ? "bg-surface-elevated text-text-primary border border-border-subtle shadow-sm" : "text-text-tertiary hover:text-text-secondary border border-transparent"
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
            <div className="flex flex-wrap items-center gap-4 rounded-[16px] border border-brand-action/30 bg-brand-action/5 p-4">
              <span className="text-[14px] font-medium text-brand-action">{selected.size} selected</span>
              <div className="ml-auto flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleBulkUpdate("approved")}
                  className="rounded-[4px] border border-brand-action/20 bg-brand-action/10 px-4 py-2 text-[13px] font-medium text-brand-action hover:bg-brand-action/20 transition-colors"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkUpdate("rejected")}
                  className="rounded-[4px] border border-brand-coral/20 bg-brand-coral/10 px-4 py-2 text-[13px] font-medium text-brand-coral hover:bg-brand-coral/20 transition-colors"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkUpdate("pending")}
                  className="rounded-[4px] border border-border-subtle bg-surface-elevated px-4 py-2 text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
              <TableSkeleton rows={8} columns={6} />
            </div>
          ) : filtered.length > 0 ? (
            <div className="overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left">
                  <thead className="bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                    <tr>
                      <th className="w-12 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={filtered.length > 0 && filtered.every(k => selected.has(k.id))}
                          onChange={toggleSelectAll}
                          className="rounded border-border-subtle text-brand-action focus:ring-brand-action"
                        />
                      </th>
                      <th className="px-4 py-3">Keyword</th>
                      <th className="px-4 py-3 text-right">Volume</th>
                      <th className="px-4 py-3 text-center">KD</th>
                      <th className="px-4 py-3 text-right">CPC</th>
                      <th className="px-4 py-3 text-center">Trend</th>
                      <th className="px-4 py-3 text-center">Intent</th>
                      <th className="px-4 py-3 text-center">Comp</th>
                      <th className="px-4 py-3 text-center" title="Legacy AI score">AI</th>
                      <th
                        className="px-4 py-3 text-center"
                        title="Keyword Analysis Score — composite of relevance, business-fit, intent, KD, volume, CPC and SERP opportunity"
                      >
                        Analysis
                      </th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/60">
                    {filtered.map(kw => (
                      <tr
                        key={kw.id}
                        onClick={() => setModalKeywordId(kw.id)}
                        title="Click to open detailed keyword analysis"
                        className={`cursor-pointer transition-colors hover:bg-surface-hover ${
                          selected.has(kw.id) ? "bg-brand-action/5" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(kw.id)}
                            onClick={e => e.stopPropagation()}
                            onChange={() => toggleSelect(kw.id)}
                            className="rounded border-border-subtle text-brand-action focus:ring-brand-action"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[14px] font-medium text-text-primary">{kw.keyword}</p>
                          {kw.gap_competitor ? (
                            <p className="text-[11px] text-brand-action mt-0.5">Gap · {kw.gap_competitor}</p>
                          ) : null}
                          {(typeof kw.relevance_score === "number" && kw.relevance_score > 0) ||
                          (typeof kw.business_fit_score === "number" && kw.business_fit_score > 0) ? (
                            <p
                              className="mt-1 text-[11px] text-text-tertiary"
                              title="Relevance = syntactic match to niche/phrase anchors. Fit = tiered business-fit (100 = niche × buying-intent match)."
                            >
                              Rel {typeof kw.relevance_score === "number" ? kw.relevance_score : "—"} ·
                              Fit {typeof kw.business_fit_score === "number" ? kw.business_fit_score : "—"}
                            </p>
                          ) : null}
                          {kw.secondary_keywords?.length ? (
                            <p className="max-w-xs truncate mt-1 text-[11px] text-text-tertiary">
                              {kw.secondary_keywords.slice(0, 3).join(" · ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right text-[14px] font-mono text-text-secondary">
                          {kw.volume ? kw.volume.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {kw.kd > 0 ? (
                            <div className="flex items-center justify-center gap-2">
                              <div className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-tertiary">
                                <div
                                  className={`h-full rounded-full ${
                                    kw.kd < 30 ? "bg-[#10b981]" : kw.kd < 60 ? "bg-[#f59e0b]" : "bg-brand-coral"
                                  }`}
                                  style={{ width: `${kw.kd}%` }}
                                />
                              </div>
                              <span className={`text-[12px] font-bold ${KD_COLOR(kw.kd)}`}>{KD_LABEL(kw.kd)}</span>
                            </div>
                          ) : (
                            <span className="text-[13px] text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-[13px] font-mono text-text-tertiary">
                          {kw.cpc > 0 ? `$${kw.cpc.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`text-[12px] font-bold ${
                              kw.trend?.startsWith("+") ? "text-[#10b981]" : "text-brand-coral"
                            }`}
                          >
                            {kw.trend || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {kw.intent ? (
                            <span
                              className={`rounded-[4px] border px-2 py-0.5 text-[11px] font-bold capitalize ${
                                kw.intent === "commercial" || kw.intent === "transactional"
                                  ? "border-brand-action/20 bg-brand-action/10 text-brand-action"
                                  : kw.intent === "informational"
                                    ? "border-[#10b981]/20 bg-[#10b981]/10 text-[#10b981]"
                                    : "border-border-subtle bg-surface-secondary text-text-tertiary"
                              }`}
                            >
                              {kw.intent}
                            </span>
                          ) : (
                            <span className="text-[13px] text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {kw.competition_level ? (
                            <span
                              className={`rounded-[4px] border px-2 py-0.5 text-[11px] font-bold uppercase ${
                                kw.competition_level === "LOW"
                                  ? "border-[#10b981]/20 bg-[#10b981]/10 text-[#10b981]"
                                  : kw.competition_level === "MEDIUM"
                                    ? "border-[#f59e0b]/20 bg-[#f59e0b]/10 text-[#f59e0b]"
                                    : "border-brand-coral/20 bg-brand-coral/10 text-brand-coral"
                              }`}
                            >
                              {kw.competition_level}
                            </span>
                          ) : (
                            <span className="text-[13px] text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="rounded-[4px] border border-border-subtle bg-surface-secondary px-2 py-0.5 text-[12px] font-mono text-text-secondary">
                            {kw.ai_score}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {typeof kw.keyword_analysis_score === "number" && kw.keyword_analysis_score > 0 ? (
                            <span className="rounded-[4px] border border-brand-action/20 bg-brand-action/10 px-2 py-0.5 text-[12px] font-mono text-brand-action">
                              {Math.round(kw.keyword_analysis_score)}
                            </span>
                          ) : (
                            <span className="text-[13px] text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`rounded-[4px] border px-2.5 py-1 text-[11px] font-bold capitalize ${STATUS_COLORS[kw.status]}`}
                          >
                            {kw.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            {kw.status !== "approved" && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleStatusUpdate(kw.id, "approved");
                                }}
                                className="rounded-[4px] bg-brand-action/10 p-1.5 text-brand-action hover:bg-brand-action/20 transition-colors"
                                title="Approve"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                                </svg>
                              </button>
                            )}
                            {kw.status !== "rejected" && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleStatusUpdate(kw.id, "rejected");
                                }}
                                className="rounded-[4px] bg-brand-coral/10 p-1.5 text-brand-coral hover:bg-brand-coral/20 transition-colors"
                                title="Reject"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                            {kw.status !== "pending" && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleStatusUpdate(kw.id, "pending");
                                }}
                                className="rounded-[4px] bg-surface-secondary p-1.5 text-text-tertiary hover:text-text-primary transition-colors"
                                title="Reset"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
              {(() => {
                const pendingShown = keywords.filter(k => k.status === "pending").length;
                if (pendingTotal <= pendingShown) return null;
                return (
                  <div className="flex flex-col items-center gap-3 border-t border-border-subtle px-6 py-6 bg-surface-secondary/50">
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="rounded-[30px] border border-border-subtle bg-surface-elevated px-6 py-2.5 text-[14px] font-medium text-text-secondary transition-colors hover:text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loadingMore
                        ? "Loading more keywords…"
                        : `Load more (${pendingTotal - pendingShown} remaining)`}
                    </button>
                    <span className="text-[12px] text-text-tertiary">
                      Showing top {pendingShown} of {pendingTotal} Ahrefs-scored keywords
                    </span>
                  </div>
                );
              })()}
            </div>
          ) : (
            !discovering && (
              <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-24 text-center">
                <div className="mb-6 flex justify-center">
                  <div className="w-16 h-16 rounded-[16px] bg-surface-tertiary flex items-center justify-center text-text-primary border border-border-subtle">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                  </div>
                </div>
                <h3 className="mb-3 text-[24px] font-normal tracking-[-0.24px] text-text-primary font-display">No keywords yet</h3>
                <p className="mb-8 text-[16px] text-text-tertiary max-w-md mx-auto">
                  Run discovery to pull real search data for your niche, then continue to competitor gaps.
                </p>
                <button
                  type="button"
                  onClick={handleDiscover}
                  className="rounded-[32px] bg-brand-primary px-8 py-3 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
                >
                  Discover keywords
                </button>
              </div>
            )
          )}
        </>
      )}

      {/* ── TAB CONTENT: COMPETITOR GAPS ─────────────────────────────────────── */}
      {activeTab === "competitor_gap" && (
        <div className="space-y-6">
          {!step1Done ? (
            <div className="rounded-[16px] border border-border-subtle bg-surface-secondary p-5 text-[14px] text-text-secondary">
              Run step 1 and discover at least one batch of industry keywords before scanning competitors.
            </div>
          ) : (
            <>
              <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="mb-2 text-[24px] font-normal tracking-[-0.24px] text-text-primary font-display">Competitor keyword gap scan</h3>
                    <p className="text-[14px] leading-relaxed text-text-tertiary max-w-3xl">
                      We read competitor SERPs for your niche, hydrate volumes from DataForSEO, and skip topics you
                      already saved. If you haven&apos;t added competitors yet, we auto-discover the top domains
                      ranking for your niche and save them to the project. For the full pipeline — page-level
                      benchmarks, opportunity scores, and one-click publishing — open the Competitor Insights
                      dashboard.
                    </p>
                  </div>
                  <Link
                    href={`/projects/${projectId}/competitors`}
                    className="inline-flex items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-secondary px-5 py-2.5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="6" />
                      <circle cx="12" cy="12" r="2" />
                    </svg>
                    Competitor Insights
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </Link>
                </div>
              </div>

              {gapError && (
                <div className="flex gap-3 rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-5 text-[14px] text-brand-coral">
                  <div>
                    {gapError}
                    <Link href={`/projects/${projectId}`} className="mt-2 block text-[13px] font-medium hover:underline">
                      Add competitors on the project overview →
                    </Link>
                  </div>
                </div>
              )}

              {autoDiscoveredCompetitors.length > 0 && (
                <div className="flex gap-4 rounded-[16px] border border-border-subtle bg-surface-secondary p-5 text-[14px] text-text-secondary">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z" />
                  </svg>
                  <div className="space-y-2">
                    <div className="font-medium text-text-primary">
                      No competitors on file — auto-discovered from search
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {autoDiscoveredCompetitors.map(domain => (
                        <span
                          key={domain}
                          className="rounded-[4px] bg-surface-elevated border border-border-subtle px-2.5 py-1 text-[12px] font-mono text-text-secondary"
                        >
                          {domain}
                        </span>
                      ))}
                    </div>
                    <div className="text-[13px] text-text-tertiary">
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
                  className="flex items-center gap-2 rounded-[32px] bg-brand-primary px-6 py-3 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {gapLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-on-primary/30 border-t-brand-on-primary" />
                      Scanning…
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
                    className="flex items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-secondary px-6 py-3 text-[14px] font-medium text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-60"
                  >
                    {importing ? "Importing…" : `Import ${selectedGapKeys.size} into keyword list`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzing || !gaps.length || !keywords.length}
                  className="rounded-[30px] border border-border-subtle bg-surface-secondary px-6 py-3 text-[14px] font-medium text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-60"
                >
                  {analyzing ? "Analyzing…" : "Compare & analyze content gaps"}
                </button>
              </div>

              {analysisError && (
                <div className="rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-4 text-[14px] text-brand-coral">{analysisError}</div>
              )}

              {gapLoading && (
                <div className="space-y-4">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-[16px] border border-border-subtle bg-surface-elevated" />
                  ))}
                </div>
              )}

              {!gapLoading && gaps.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-2">
                    <p className="text-[14px] font-medium text-text-primary">{gaps.length} competitor-led topics</p>
                    <button type="button" onClick={toggleAllGaps} className="text-[13px] font-medium text-brand-action hover:underline">
                      {gaps.every(g => selectedGapKeys.has(gapRowKey(g))) ? "Deselect all" : "Select all"}
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                          <tr>
                            <th className="w-12 px-4 py-3" />
                            <th className="px-4 py-3">Topic</th>
                            <th className="px-4 py-3">Competitor</th>
                            <th className="px-4 py-3">Source page</th>
                            <th className="px-4 py-3 text-right">Volume</th>
                            <th className="px-4 py-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle/60">
                          {gaps.map(gap => {
                            const key = gapRowKey(gap);
                            return (
                              <tr key={key} className={`hover:bg-surface-hover transition-colors ${selectedGapKeys.has(key) ? "bg-brand-action/5" : ""}`}>
                                <td className="px-4 py-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedGapKeys.has(key)}
                                    onChange={() => toggleGapKey(key)}
                                    className="rounded border-border-subtle text-brand-action focus:ring-brand-action"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-[14px] font-medium text-text-primary">{gap.keyword}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="rounded-[4px] border border-border-subtle bg-surface-secondary px-2.5 py-1 text-[12px] font-mono text-text-secondary">
                                    {gap.competitorDomain}
                                  </span>
                                </td>
                                <td className="max-w-[min(360px,40vw)] px-4 py-3">
                                  <p className="truncate text-[13px] text-text-secondary" title={gap.sourceTitle}>
                                    {gap.sourceTitle}
                                  </p>
                                  {gap.sourceUrl ? (
                                    <a
                                      href={gap.sourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="mt-1.5 inline-flex text-[12px] font-medium text-brand-action hover:underline"
                                    >
                                      Open page ↗
                                    </a>
                                  ) : (
                                    <span className="mt-1.5 block text-[12px] text-text-tertiary">No direct URL</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-[14px] font-mono text-text-secondary">
                                  {gap.estimatedVolume > 0 ? gap.estimatedVolume.toLocaleString() : "—"}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleGenerateBlogFromGap(gap.keyword)}
                                    disabled={generatingGapKeyword === gap.keyword}
                                    className="rounded-[4px] border border-border-subtle bg-surface-secondary px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-60"
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
                <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-16 text-center text-[14px] text-text-tertiary max-w-2xl mx-auto">
                  Run a scan to load competitor topics, then run analysis without importing if you only want a report—or
                  import rows you want in your master list.
                </div>
              )}

              {analysisMd ? (
                <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-8">
                  <h3 className="mb-6 text-[24px] font-normal tracking-[-0.24px] text-text-primary font-display">Gap analysis</h3>
                  <div className="max-w-none text-[16px] leading-relaxed text-text-secondary [&_a]:text-brand-action [&_a]:underline [&_h2]:mt-8 [&_h2]:text-[20px] [&_h2]:font-medium [&_h2]:text-text-primary [&_h3]:mt-6 [&_h3]:text-[16px] [&_h3]:font-medium [&_li]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisMd}</ReactMarkdown>
                  </div>
                </div>
              ) : null}

              {clusterKeywords.length > 0 && (
                <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-8">
                  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h3 className="text-[24px] font-normal tracking-[-0.24px] text-text-primary font-display">Final cluster for blogs</h3>
                      <p className="mt-2 text-[14px] text-text-tertiary max-w-2xl">
                        We only approve phrases that already exist in your keyword list (import gaps first if they are
                        missing). Need at least 5 checked to start the calendar.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleApproveCluster}
                      className="rounded-[32px] bg-brand-primary px-6 py-3 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
                    >
                      Approve cluster &amp; open calendar ({clusterPick.size} selected)
                    </button>
                  </div>
                  <div className="flex max-h-[320px] flex-col flex-wrap gap-2 overflow-y-auto rounded-[8px] border border-border-subtle bg-surface-secondary p-4">
                    {clusterKeywords.map(phrase => (
                      <label
                        key={phrase}
                        className="flex cursor-pointer items-center gap-3 rounded-[4px] px-3 py-2 text-[14px] hover:bg-surface-hover transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={clusterPick.has(phrase)}
                          onChange={() => toggleClusterPhrase(phrase)}
                          className="rounded border-border-subtle text-brand-action focus:ring-brand-action"
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

      <KeywordDetailModal
        open={!!modalKeyword}
        projectId={projectId}
        keyword={modalKeyword}
        onClose={() => setModalKeywordId(null)}
        onStatusChange={handleStatusUpdate}
      />
    </div>
  );
}
