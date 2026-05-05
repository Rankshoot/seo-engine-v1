"use client";

/**
 * Keyword Detail Modal — live keyword drilldown.
 *
 * Mounted by the keywords page. Opens immediately with a skeleton frame, then
 * lazily fetches `GET /api/v1/projects/:projectId/keywords/:keywordId/details`
 * (which itself caches in `keyword_details` for 7 days). Renders:
 *
 *   • Header with keyword title, cache badge, Approve / Reject / Close
 *   • 4-card row: KD gauge · Search volume + 24-mo sparkline ·
 *     Traffic potential + top ranking result + parent topic ·
 *     Global volume + by-country bars
 *   • SERP top results (compact table)
 *   • Ideas tabs: Terms match · Questions · Also rank for · Also talk about
 *
 * Design notes (no new deps):
 *   • Sparkline + gauge are inline SVG.
 *   • Country flags use Unicode regional-indicator emoji (no asset bundle).
 *   • Skeleton placeholders match the final card sizes — no layout shift on
 *     fetch resolve.
 *   • Enrichment failure path: API still returns 200 with empty arrays / null
 *     overview; we fall back to the row data we already had (volume, kd, cpc)
 *     and render a soft "Live enrichment unavailable" notice instead of an
 *     error.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/Skeleton";
import { API_V1 } from "@/frontend/api/http";
import { V1Routes } from "@/frontend/api/routes";
import { qk } from "@/lib/query";
import type { Keyword, KeywordStatus } from "@/lib/types";

/**
 * Format a timestamp as a friendly relative label ("3 hours ago"), with the
 * absolute timestamp surfaced via tooltip for precision.
 */
function relativeAge(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Local types — mirror the API response shape (`KeywordModalResponse`).
// Kept inline so this file remains self-contained.
// ─────────────────────────────────────────────────────────────────────────────

interface ModalIntents {
  informational?: boolean;
  navigational?: boolean;
  commercial?: boolean;
  transactional?: boolean;
  branded?: boolean;
  local?: boolean;
}

/**
 * SERP feature entries from the rank-data API are heterogeneous — sometimes a plain
 * string, sometimes `{ type }`, sometimes `{ feature }` or `{ name }`. We
 * accept anything and normalize at render time via `serpFeatureLabel`.
 */
type ModalSerpFeature =
  | string
  | {
      type?: string | null;
      feature?: string | null;
      name?: string | null;
      position?: number | null;
    };

interface ModalSerpResult {
  position: number;
  url: string;
  title: string;
  domain: string;
  domain_rating: number | null;
  url_rating: number | null;
  traffic: number | null;
  refdomains: number | null;
}

interface ModalIdea {
  keyword: string;
  volume: number;
  difficulty: number | null;
  cpc: number | null;
  trafficPotential: number | null;
  intents: ModalIntents | null;
  parentTopic: string | null;
}

interface KeywordModalApiData {
  keyword: string;
  overview: {
    volume: number;
    globalVolume: number | null;
    difficulty: number | null;
    cpc: number | null;
    parentTopic: string | null;
    parentVolume: number | null;
    trafficPotential: number | null;
    intents: ModalIntents | null;
    serpFeatures: ModalSerpFeature[];
  };
  volumeHistory: { date: string; volume: number }[];
  volumeByCountry: { country: string; volume: number }[];
  topRankingResult: ModalSerpResult | null;
  serpTopResults: ModalSerpResult[];
  ideas: {
    termsMatch: ModalIdea[];
    questions: ModalIdea[];
    alsoRankFor: ModalIdea[];
    alsoTalkAbout: ModalIdea[];
  };
  fromCache: boolean;
  lastFetchedAt: string;
}

export interface KeywordDetailModalProps {
  open: boolean;
  projectId: string;
  /** Selected row data — used to render instantly while the API fetch runs. */
  keyword: Keyword | null;
  onClose: () => void;
  /** Approve / Reject / Reset the keyword's status. */
  onStatusChange: (id: string, status: KeywordStatus) => Promise<void>;
}

type IdeaTab = "termsMatch" | "questions" | "alsoRankFor" | "alsoTalkAbout";

const TAB_LABELS: Record<IdeaTab, string> = {
  termsMatch: "Terms match",
  questions: "Questions",
  alsoRankFor: "Also rank for",
  alsoTalkAbout: "Also talk about",
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function KeywordDetailModal(props: KeywordDetailModalProps) {
  const { open, projectId, keyword, onClose, onStatusChange } = props;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<IdeaTab>("termsMatch");
  const [statusBusy, setStatusBusy] = useState<KeywordStatus | "">("");

  // Reset to the first tab whenever the user navigates to a different row
  // without closing the modal — keeps tab state from leaking between keywords.
  useEffect(() => {
    setActiveTab("termsMatch");
  }, [keyword?.id]);

  /** Fetch live keyword drilldown. `force` bypasses the server-side 7d cache. */
  const fetchKeywordDetails = async (force = false) => {
    const url = `${API_V1}${V1Routes.keywordDetails(projectId, keyword!.id)}${force ? "?refresh=1" : ""}`;
    const res = await fetch(url, { credentials: "include" });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `HTTP ${res.status}`);
    }
    return json.data as KeywordModalApiData;
  };

  // Cached fetch of the drilldown. We deliberately disable every automatic
  // refetch (window focus, reconnect, mount) — paid API costs. The user
  // controls refreshes via the explicit Refresh button.
  const {
    data: rawData,
    isLoading,
    isFetching,
    error: queryError,
  } = useQuery<KeywordModalApiData>({
    queryKey: keyword ? qk.keywordDetails(projectId, keyword.id) : ["keyword-details", "noop"],
    queryFn: () => fetchKeywordDetails(false),
    enabled: open && !!keyword,
  });

  // Manual refresh — bypasses both the React Query cache (we overwrite it on
  // success) and the 7-day server-side `keyword_details` cache (`?refresh=1`).
  const refreshMutation = useMutation<KeywordModalApiData>({
    mutationFn: () => fetchKeywordDetails(true),
    onSuccess: fresh => {
      if (!keyword) return;
      queryClient.setQueryData(qk.keywordDetails(projectId, keyword.id), fresh);
    },
  });
  // Normalize `undefined` (React Query's missing-data sentinel) to `null` so
  // the existing downstream child components keep their existing type contract.
  const data: KeywordModalApiData | null = rawData ?? null;
  // Show the skeleton only when there's no cached data to render. On a cached
  // hit we get `data` immediately and skip the loading state entirely.
  const loading = isLoading && !data;
  // Treat all errors uniformly with the previous string-based UI.
  const fetchError = queryError instanceof Error ? queryError.message : queryError ? String(queryError) : "";
  void isFetching;

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Body scroll lock while the modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleStatus = async (status: KeywordStatus) => {
    if (!keyword) return;
    setStatusBusy(status);
    try {
      await onStatusChange(keyword.id, status);
    } finally {
      setStatusBusy("");
    }
  };

  if (!open || !keyword) return null;

  const overview = data?.overview ?? null;
  // Prefer freshly fetched values; fall back to the row data so the modal
  // shows numbers IMMEDIATELY instead of waiting for live enrichment.
  const displayedVolume = overview?.volume ?? keyword.volume ?? 0;
  const displayedKd = overview?.difficulty ?? keyword.kd ?? 0;
  const displayedCpc = overview?.cpc ?? keyword.cpc ?? 0;
  const liveDataMissing =
    !loading &&
    !!data &&
    !data.overview.volume &&
    !data.volumeHistory.length &&
    !data.volumeByCountry.length &&
    !data.serpTopResults.length &&
    !data.ideas.termsMatch.length &&
    !data.ideas.questions.length &&
    !data.ideas.alsoRankFor.length &&
    !data.ideas.alsoTalkAbout.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Keyword details: ${keyword.keyword}`}
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-surface-primary/85 p-3 backdrop-blur-sm sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative my-4 flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-secondary shadow-2xl shadow-black/60 animate-scale-in"
        style={{ maxHeight: "calc(100vh - 3rem)" }}
        onClick={e => e.stopPropagation()}
      >
        <Header
          keyword={keyword}
          data={data}
          loading={loading}
          statusBusy={statusBusy}
          refreshing={refreshMutation.isPending}
          refreshError={
            refreshMutation.error instanceof Error ? refreshMutation.error.message : ""
          }
          onRefresh={() => refreshMutation.mutate()}
          onClose={onClose}
          onStatus={handleStatus}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {fetchError && (
            <div className="m-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              <p className="font-semibold">Failed to load live data</p>
              <p className="text-xs text-rose-400/90">{fetchError}</p>
            </div>
          )}

          {liveDataMissing && (
            <div className="m-5 rounded-xl border border-warm-500/25 bg-warm-500/10 p-3 text-sm text-warm-400">
              Live enrichment is unavailable for this keyword right now.
              You can still approve / reject; we&apos;ll re-try in the
              background after approval.
            </div>
          )}

          {/* 4-card row */}
          <div className="grid grid-cols-1 gap-3 p-5 pt-3 md:grid-cols-2 lg:grid-cols-4">
            <KdCard kd={displayedKd} loading={loading && !data} intents={overview?.intents ?? null} />
            <VolumeCard
              volume={displayedVolume}
              cpc={displayedCpc}
              history={data?.volumeHistory ?? []}
              loading={loading && !data}
            />
            <TrafficPotentialCard
              tp={overview?.trafficPotential ?? null}
              valueDollars={null}
              top={data?.topRankingResult ?? null}
              parentTopic={overview?.parentTopic ?? null}
              parentVolume={overview?.parentVolume ?? null}
              loading={loading && !data}
            />
            <GlobalVolumeCard
              global={overview?.globalVolume ?? null}
              byCountry={data?.volumeByCountry ?? []}
              loading={loading && !data}
            />
          </div>

          {/* SERP features pills — API sends mixed shapes; we normalize. */}
          {(() => {
            const features = (overview?.serpFeatures ?? [])
              .map(serpFeatureLabel)
              .filter((s): s is string => !!s);
            if (!features.length) return null;
            return (
              <div className="px-5">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                  SERP features
                </p>
                <div className="flex flex-wrap gap-1.5 pb-2">
                  {features.slice(0, 12).map((label, i) => (
                    <span
                      key={`${label}-${i}`}
                      className="rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-[11px] font-semibold capitalize text-text-secondary"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* SERP top results */}
          <SerpResultsCard results={data?.serpTopResults ?? []} loading={loading && !data} />

          {/* Ideas */}
          <IdeasSection
            data={data}
            loading={loading && !data}
            activeTab={activeTab}
            onTab={setActiveTab}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

function Header({
  keyword,
  data,
  loading,
  statusBusy,
  refreshing,
  refreshError,
  onRefresh,
  onClose,
  onStatus,
}: {
  keyword: Keyword;
  data: KeywordModalApiData | null;
  loading: boolean;
  statusBusy: KeywordStatus | "";
  refreshing: boolean;
  refreshError: string;
  onRefresh: () => void;
  onClose: () => void;
  onStatus: (s: KeywordStatus) => void;
}) {
  const lastUpdated = data ? relativeAge(data.lastFetchedAt) : null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle bg-surface-secondary/95 p-5 backdrop-blur">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
          Keyword overview
        </p>
        <h2 className="mt-1 break-words text-xl font-bold text-text-primary md:text-2xl">
          {keyword.keyword}
        </h2>
        <p className="mt-2 text-[12px] text-text-secondary">
          <span className="font-semibold text-text-tertiary">AI relevance</span>{" "}
          <span className="font-mono tabular-nums text-text-primary">{keyword.ai_score}</span>
          <span className="text-text-tertiary"> /10</span>
          {typeof keyword.keyword_analysis_score === "number" && keyword.keyword_analysis_score > 0 ? (
            <>
              <span className="mx-2 text-text-tertiary/50">·</span>
              <span className="font-semibold text-text-tertiary">Analysis</span>{" "}
              <span className="font-mono tabular-nums text-brand-action">{Math.round(keyword.keyword_analysis_score)}</span>
            </>
          ) : null}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
          {data ? (
            <span
              className={`rounded-full border px-2 py-0.5 font-semibold ${
                data.fromCache
                  ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-400"
                  : "border-accent-500/25 bg-accent-500/10 text-accent-400"
              }`}
              title={`Last fetched ${new Date(data.lastFetchedAt).toLocaleString()}`}
            >
              {data.fromCache ? "Cached" : "Fresh"}
            </span>
          ) : loading ? (
            <Skeleton className="h-4 w-16" rounded="full" />
          ) : null}
          {lastUpdated && (
            <span title={data ? new Date(data.lastFetchedAt).toLocaleString() : undefined}>
              Last updated <span className="text-text-secondary">{lastUpdated}</span>
            </span>
          )}
          {keyword.status === "approved" && (
            <span className="rounded-full border border-accent-500/25 bg-accent-500/10 px-2 py-0.5 font-semibold text-accent-400">
              Approved
            </span>
          )}
          {keyword.status === "rejected" && (
            <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-400">
              Rejected
            </span>
          )}
        </div>
        {refreshError && (
          <p className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">
            {refreshError}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing || loading}
          title="Re-fetch live keyword details. Bypasses the 7-day server cache and may use paid API credits."
          className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-elevated px-3 py-2 text-xs font-bold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-text-tertiary border-t-text-primary" />
              Refreshing…
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Refresh
            </>
          )}
        </button>
        <button
          type="button"
          disabled={statusBusy === "approved" || keyword.status === "approved"}
          onClick={() => onStatus("approved")}
          className="rounded-xl border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-xs font-bold text-accent-400 transition-colors hover:bg-accent-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {statusBusy === "approved" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={statusBusy === "rejected" || keyword.status === "rejected"}
          onClick={() => onStatus("rejected")}
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-400 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {statusBusy === "rejected" ? "Rejecting…" : "Reject"}
        </button>
        {keyword.status !== "pending" && (
          <button
            type="button"
            disabled={statusBusy === "pending"}
            onClick={() => onStatus("pending")}
            className="rounded-xl border border-border-strong bg-surface-elevated px-3 py-2 text-xs font-bold text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          aria-label="Close keyword details"
          onClick={onClose}
          className="ml-1 rounded-xl border border-border-subtle bg-surface-elevated p-2 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KD card — half-circle SVG gauge
// ─────────────────────────────────────────────────────────────────────────────

function KdCard({
  kd,
  loading,
  intents,
}: {
  kd: number;
  loading: boolean;
  intents: ModalIntents | null;
}) {
  const safeKd = Math.max(0, Math.min(100, Math.round(kd)));
  const label = safeKd === 0 ? "—" : safeKd < 30 ? "Easy" : safeKd < 60 ? "Medium" : "Hard";
  const labelColor =
    safeKd === 0
      ? "text-text-tertiary"
      : safeKd < 30
        ? "text-accent-400"
        : safeKd < 60
          ? "text-warm-400"
          : "text-rose-400";

  return (
    <Card label="Keyword difficulty">
      <div className="flex items-center justify-center pt-2">
        <Gauge value={safeKd} loading={loading} />
      </div>
      <div className="mt-2 text-center">
        <p className={`text-base font-bold ${labelColor}`}>{label}</p>
        <p className="mt-0.5 text-[11px] text-text-tertiary">
          {safeKd === 0 ? "No KD data" : `KD ${safeKd}/100`}
        </p>
      </div>
      <IntentPills intents={intents} />
    </Card>
  );
}

function Gauge({ value, loading }: { value: number; loading: boolean }) {
  const r = 44;
  const cx = 56;
  const cy = 60;
  const start = polar(cx, cy, r, 200);
  const end = polar(cx, cy, r, -20);
  const arcLength = Math.PI * r * (220 / 360);
  const dash = (value / 100) * arcLength;
  const stroke =
    value < 30 ? "var(--color-accent-500)" : value < 60 ? "var(--color-warm-500)" : "var(--color-rose-500)";

  return (
    <svg width={112} height={72} viewBox="0 0 112 72" aria-hidden>
      <path
        d={describeArc(cx, cy, r, 200, -20)}
        stroke="var(--color-surface-elevated)"
        strokeWidth={8}
        fill="none"
        strokeLinecap="round"
      />
      {!loading && value > 0 && (
        <path
          d={describeArc(cx, cy, r, 200, -20)}
          stroke={stroke}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${arcLength}`}
        />
      )}
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        className="fill-text-primary"
        style={{ fontSize: 18, fontWeight: 800 }}
      >
        {loading ? "…" : value === 0 ? "—" : value}
      </text>
      <text x={start.x} y={start.y + 12} textAnchor="middle" style={{ fontSize: 9 }} className="fill-text-tertiary">
        0
      </text>
      <text x={end.x} y={end.y + 12} textAnchor="middle" style={{ fontSize: 9 }} className="fill-text-tertiary">
        100
      </text>
    </svg>
  );
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const sweep = startDeg - endDeg <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${sweep} 1 ${end.x} ${end.y}`;
}

function IntentPills({ intents }: { intents: ModalIntents | null }) {
  if (!intents) return null;
  const list: { key: keyof ModalIntents; label: string; color: string }[] = [
    { key: "transactional", label: "Transactional", color: "border-accent-500/25 bg-accent-500/10 text-accent-400" },
    { key: "commercial", label: "Commercial", color: "border-accent-500/25 bg-accent-500/10 text-accent-400" },
    { key: "informational", label: "Informational", color: "border-cyan-500/25 bg-cyan-500/10 text-cyan-400" },
    { key: "navigational", label: "Navigational", color: "border-border-strong bg-surface-elevated text-text-tertiary" },
    { key: "branded", label: "Branded", color: "border-warm-500/25 bg-warm-500/10 text-warm-400" },
    { key: "local", label: "Local", color: "border-brand-500/25 bg-brand-500/10 text-brand-400" },
  ];
  const active = list.filter(i => intents[i.key]);
  if (!active.length) return null;
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-1">
      {active.map(i => (
        <span
          key={i.key}
          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${i.color}`}
        >
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Volume card — big number + sparkline
// ─────────────────────────────────────────────────────────────────────────────

function VolumeCard({
  volume,
  cpc,
  history,
  loading,
}: {
  volume: number;
  cpc: number;
  history: { date: string; volume: number }[];
  loading: boolean;
}) {
  return (
    <Card label="Search volume">
      <div className="flex items-baseline gap-2">
        <p className="text-3xl font-black text-text-primary">{fmtVolume(volume)}</p>
        <p className="text-xs text-text-tertiary">/ mo</p>
      </div>
      <p className="mt-1 text-[11px] text-text-tertiary">
        CPC <span className="text-text-secondary">{fmtMoney(cpc)}</span>
      </p>
      <div className="mt-4 h-16">
        {loading ? (
          <Skeleton className="h-full w-full" rounded="md" />
        ) : history.length > 1 ? (
          <Sparkline data={history.map(p => p.volume)} dates={history.map(p => p.date)} />
        ) : (
          <div className="flex h-full items-center justify-center rounded-md bg-surface-elevated/40 text-[11px] text-text-tertiary">
            No volume history yet
          </div>
        )}
      </div>
      {history.length > 1 && (
        <div className="mt-1 flex justify-between text-[10px] text-text-tertiary">
          <span>{labelFromDate(history[0].date)}</span>
          <span>{labelFromDate(history[history.length - 1].date)}</span>
        </div>
      )}
    </Card>
  );
}

function Sparkline({ data, dates }: { data: number[]; dates: string[] }) {
  void dates;
  const w = 220;
  const h = 64;
  const max = Math.max(1, ...data);
  const min = 0;
  const stepX = data.length > 1 ? w / (data.length - 1) : w;
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / (max - min)) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(" L ")}`;
  const area = `${path} L ${w},${h} L 0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
      <path d={area} fill="var(--color-brand-500)" opacity={0.18} />
      <path d={path} stroke="var(--color-brand-400)" strokeWidth={1.5} fill="none" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Traffic potential card
// ─────────────────────────────────────────────────────────────────────────────

function TrafficPotentialCard({
  tp,
  valueDollars,
  top,
  parentTopic,
  parentVolume,
  loading,
}: {
  tp: number | null;
  valueDollars: number | null;
  top: ModalSerpResult | null;
  parentTopic: string | null;
  parentVolume: number | null;
  loading: boolean;
}) {
  return (
    <Card label="Traffic potential">
      <div className="flex items-baseline gap-2">
        <p className="text-3xl font-black text-text-primary">{tp != null ? fmtVolume(tp) : "—"}</p>
        <p className="text-xs text-text-tertiary">visits/mo</p>
      </div>
      {valueDollars != null && (
        <p className="mt-1 text-[11px] text-text-tertiary">
          Value <span className="text-text-secondary">${valueDollars.toLocaleString()}</span>
        </p>
      )}
      <div className="mt-3 space-y-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            Top ranking result
          </p>
          {loading ? (
            <Skeleton className="mt-1 h-9 w-full" rounded="md" />
          ) : top ? (
            <a
              href={top.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block rounded-md border border-border-subtle bg-surface-elevated/40 p-2 transition-colors hover:bg-surface-elevated"
            >
              <p
                className="line-clamp-2 text-xs font-semibold text-brand-300 hover:text-brand-200"
                title={top.title}
              >
                {top.title || top.domain}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-text-tertiary">{top.url}</p>
              <p className="mt-1 text-[10px] text-text-tertiary">
                #{top.position} · {top.domain}
                {top.domain_rating != null && <> · DR {top.domain_rating}</>}
              </p>
            </a>
          ) : (
            <p className="mt-1 text-[11px] text-text-tertiary">No SERP data</p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            Parent topic
          </p>
          {loading ? (
            <Skeleton className="mt-1 h-4 w-full" />
          ) : parentTopic ? (
            <p className="mt-0.5 text-xs text-text-secondary" title={parentTopic}>
              <span className="font-semibold text-brand-300">{parentTopic}</span>
              {parentVolume != null && (
                <span className="ml-1 text-text-tertiary">· {fmtVolume(parentVolume)}/mo</span>
              )}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-text-tertiary">—</p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Global volume card
// ─────────────────────────────────────────────────────────────────────────────

function GlobalVolumeCard({
  global,
  byCountry,
  loading,
}: {
  global: number | null;
  byCountry: { country: string; volume: number }[];
  loading: boolean;
}) {
  const total = byCountry.reduce((s, r) => s + (r.volume || 0), 0);
  return (
    <Card label="Global volume">
      <div className="flex items-baseline gap-2">
        <p className="text-3xl font-black text-text-primary">
          {global != null ? fmtVolume(global) : "—"}
        </p>
        <p className="text-xs text-text-tertiary">/ mo</p>
      </div>
      <div className="mt-3 max-h-44 space-y-1.5 overflow-y-auto pr-1">
        {loading ? (
          <>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </>
        ) : byCountry.length ? (
          byCountry.slice(0, 10).map(row => {
            const pct = total > 0 ? Math.round((row.volume / total) * 100) : 0;
            return (
              <div key={row.country} className="flex items-center gap-2 text-[11px]">
                <span className="text-base leading-none">{flagEmoji(row.country)}</span>
                <span className="w-9 shrink-0 font-mono uppercase text-text-tertiary">
                  {row.country}
                </span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-elevated">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-brand-500/70"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right font-semibold text-text-secondary">
                  {fmtVolume(row.volume)}
                </span>
                <span className="w-8 shrink-0 text-right text-text-tertiary">{pct}%</span>
              </div>
            );
          })
        ) : (
          <p className="text-[11px] text-text-tertiary">No country breakdown</p>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP top results
// ─────────────────────────────────────────────────────────────────────────────

function SerpResultsCard({
  results,
  loading,
}: {
  results: ModalSerpResult[];
  loading: boolean;
}) {
  if (!loading && !results.length) return null;
  return (
    <div className="px-5 pb-5">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
        SERP top results
      </p>
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-secondary/50">
        {loading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {results.map(r => (
              <li key={`${r.position}-${r.url}`} className="flex items-center gap-3 px-3 py-2">
                <span className="w-7 shrink-0 text-center text-xs font-bold text-text-tertiary">
                  #{r.position}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-xs font-semibold text-brand-300 hover:text-brand-200"
                    title={r.title}
                  >
                    {r.title || r.domain}
                  </a>
                  <p className="truncate text-[10px] text-text-tertiary">{r.url}</p>
                </div>
                <div className="hidden shrink-0 items-center gap-2 text-[10px] text-text-tertiary md:flex">
                  {r.domain_rating != null && (
                    <span title="Domain rating">DR {r.domain_rating}</span>
                  )}
                  {r.url_rating != null && <span title="URL rating">UR {r.url_rating}</span>}
                  {r.refdomains != null && (
                    <span title="Referring domains">{r.refdomains.toLocaleString()} ref</span>
                  )}
                  {r.traffic != null && (
                    <span title="Estimated monthly traffic">{fmtVolume(r.traffic)}/mo</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ideas section (tabs)
// ─────────────────────────────────────────────────────────────────────────────

function IdeasSection({
  data,
  loading,
  activeTab,
  onTab,
}: {
  data: KeywordModalApiData | null;
  loading: boolean;
  activeTab: IdeaTab;
  onTab: (t: IdeaTab) => void;
}) {
  const counts = useMemo(() => {
    return {
      termsMatch: data?.ideas.termsMatch.length ?? 0,
      questions: data?.ideas.questions.length ?? 0,
      alsoRankFor: data?.ideas.alsoRankFor.length ?? 0,
      alsoTalkAbout: data?.ideas.alsoTalkAbout.length ?? 0,
    };
  }, [data]);

  const list = data ? data.ideas[activeTab] : [];

  return (
    <div className="px-5 pb-5">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
        Keyword ideas
      </p>
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-secondary/50">
        <div className="flex flex-wrap gap-1 border-b border-border-subtle bg-surface-tertiary/50 p-1.5">
          {(Object.keys(TAB_LABELS) as IdeaTab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => onTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === t
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary"
              }`}
            >
              {TAB_LABELS[t]}
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  activeTab === t ? "bg-white/20 text-white" : "bg-surface-elevated text-text-tertiary"
                }`}
              >
                {counts[t]}
              </span>
            </button>
          ))}
        </div>
        <div>
          {loading ? (
            <div className="space-y-1.5 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_72px] items-center gap-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : list.length ? (
            <ul className="max-h-80 divide-y divide-border-subtle overflow-y-auto">
              {list.map((idea, i) => (
                <IdeaRow key={`${activeTab}-${idea.keyword}-${i}`} idea={idea} />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-text-tertiary">
              No {TAB_LABELS[activeTab].toLowerCase()} for this keyword.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function IdeaRow({ idea }: { idea: ModalIdea }) {
  const kd = idea.difficulty ?? 0;
  const kdColor =
    kd === 0
      ? "text-text-tertiary"
      : kd < 30
        ? "text-accent-400"
        : kd < 60
          ? "text-warm-400"
          : "text-rose-400";
  return (
    <li className="grid grid-cols-[1fr_64px_88px] items-center gap-3 px-3 py-2 hover:bg-surface-elevated/40">
      <p className="truncate text-xs text-text-secondary" title={idea.keyword}>
        {idea.keyword}
      </p>
      <p className="text-right text-xs font-bold text-text-primary">{fmtVolume(idea.volume)}</p>
      <div className="flex items-center justify-end gap-1.5">
        {kd > 0 ? (
          <>
            <div className="h-1 w-10 overflow-hidden rounded-full bg-surface-elevated">
              <div
                className={`h-full rounded-full ${
                  kd < 30 ? "bg-accent-500" : kd < 60 ? "bg-warm-500" : "bg-rose-500"
                }`}
                style={{ width: `${Math.min(100, kd)}%` }}
              />
            </div>
            <span className={`w-6 text-right text-[10px] font-bold ${kdColor}`}>{kd}</span>
          </>
        ) : (
          <span className="text-[10px] text-text-tertiary">—</span>
        )}
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic card shell
// ─────────────────────────────────────────────────────────────────────────────

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-tertiary/40 p-4 backdrop-blur-md">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
        {label}
      </p>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtVolume(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(v));
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  if (v < 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(2)}`;
}

/**
 * Normalize the messy SERP-feature payload the API returns. The field can be a
 * plain string (`"sitelinks"`), or an object using one of several keys
 * (`type`, `feature`, `name`). Anything else collapses to `null` and the row
 * is filtered out by the caller.
 */
function serpFeatureLabel(f: ModalSerpFeature): string | null {
  if (!f) return null;
  if (typeof f === "string") {
    return f.trim() ? f.replace(/_/g, " ") : null;
  }
  const raw = f.type ?? f.feature ?? f.name ?? null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.replace(/_/g, " ");
}

function flagEmoji(cc: string): string {
  if (!cc || cc.length < 2) return "";
  const upper = cc.toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + upper.charCodeAt(0) - "A".charCodeAt(0),
    base + upper.charCodeAt(1) - "A".charCodeAt(0)
  );
}

function labelFromDate(d: string): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}
