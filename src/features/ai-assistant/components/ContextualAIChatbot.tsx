"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useAppDispatch,
  useAppSelector,
  selectAiLowCompetitionKeywordIds,
  selectAiLongTailKeywordIds,
  selectAiMemory,
  selectAiSuggestedKeywordIds,
  selectKeywordPrefs,
  selectKeywordStatuses,
  type ChatMsg as ImportedChatMsg,
} from "@/lib/redux/hooks";
import { qk, keywordsListQueryOptions } from "@/lib/query";
import { briefApi } from "@/frontend/api/brief";
import { keywordsApi } from "@/frontend/api/keywords";
import { competitorsApi } from "@/frontend/api/competitors";
import { calendarApi } from "@/frontend/api/calendar";
import { auditsApi } from "@/frontend/api/audits";
import { aiAssistantMemoryUpdated } from "@/lib/redux/keyword-workspace-slice";
import { contentHealthAuditMarkStale } from "@/lib/redux/content-health-audit-slice";
import { getAIContext } from "@/features/ai-assistant/context/contextManager";
import { detectAIPageFromPath } from "@/features/ai-assistant/context/page";
import { executeAgentAction } from "@/features/ai-assistant/agent/executor";
import type {
  AIPageExtended,
  ContextualAgentOutput,
  ContextualAgentRequestBody,
  ContextualSuggestion,
} from "@/features/ai-assistant/types";
import type { KeywordStatus, Project } from "@/lib/types";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { KeywordActionDropdown } from "@/components/keywords/KeywordActionDropdown";

export type AIMode = "closed" | "mini" | "full";

const genId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

interface Props {
  project: Project;
  aiMode: AIMode;
  setAiMode: (mode: AIMode) => void;
}

/** Extract blogId from /projects/[id]/blogs/[blogId] paths. */
function extractBlogId(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  const m = pathname.match(/\/projects\/[^/]+\/blogs\/([^/]+)/);
  return m ? m[1] : undefined;
}

interface PendingToolCall {
  id: string;
  params: Record<string, unknown>;
}

interface ToolCallResult {
  id: string;
  params: Record<string, unknown>;
  durationMs: number;
  result: { success: boolean; message: string; error?: string; data?: unknown; sideEffect?: string };
}

interface AssistantPlanResponse {
  mode: "chat" | "inform" | "analyze" | "action" | "research";
  rationale: string;
  awaitingConfirmation: boolean;
  toolCalls: ToolCallResult[];
}

interface ExtendedAgentOutput extends ContextualAgentOutput {
  plan?: AssistantPlanResponse;
}

interface ApiResponse {
  success: boolean;
  error?: string;
  data?: ExtendedAgentOutput;
}

// ChatMsg type is exported from the redux hooks file so the selector and
// component agree on shape (incl. toolCalls + suggestions). Suggestions are
// stored as `unknown[]` in Redux and cast back to ContextualSuggestion[] on
// render — a small concession so Redux doesn't have to import UI types.
type ChatMsg = ImportedChatMsg;

type ChatSession = {
  id: string;
  title: string;
  page: AIPageExtended;
  createdAt: string;
  lastMessageAt: string;
};

const QUICK_PROMPTS: Record<AIPageExtended, Array<{ id: string; label: string; prompt: string }>> = {
  keywords: [
    { id: "best", label: "Best keywords", prompt: "Find best keywords to drive qualified organic traffic." },
    { id: "low", label: "Low competition", prompt: "Show low competition keywords with rankable opportunities." },
    { id: "long", label: "Long-tail", prompt: "Suggest long-tail keywords with high conversion potential." },
  ],
  competitors: [
    { id: "gaps", label: "Keyword gaps", prompt: "Find the highest-impact keyword gaps we should target first." },
    { id: "opp", label: "Competitor opps", prompt: "Suggest competitor opportunities with highest traffic upside." },
  ],
  calendar: [
    { id: "fill", label: "Fill empty days", prompt: "Find best keywords to fill empty calendar slots." },
    { id: "schedule", label: "Schedule best", prompt: "Schedule highest upside keywords first." },
  ],
  blogs: [
    { id: "gen", label: "Blog ideas", prompt: "Suggest top keyword to generate next blog for." },
    { id: "improve", label: "Improve SEO", prompt: "Find blogs that need SEO improvements first." },
    { id: "update", label: "Update old", prompt: "Find old blogs that should be refreshed now." },
  ],
  audit: [
    { id: "critical", label: "Critical fixes", prompt: "Find highest-severity audit fixes we should do first." },
    { id: "refresh", label: "Refresh priorities", prompt: "Which audited pages should be refreshed right now?" },
  ],
};

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** Banner label for a calendar day (local), e.g. Today / Yesterday / Fri, May 2, 2026 */
function formatSessionDayBanner(dayKey: string): string {
  const day = new Date(dayKey + "T12:00:00");
  const today = startOfLocalDay(new Date());
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const yesterday = y.getTime();
  const d0 = startOfLocalDay(day);
  if (d0 === today) return "Today";
  if (d0 === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(day);
}

function localDayKeyFromTimestamp(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Group sessions under calendar-day banners (newest day first, local dates). */
function groupSessionsByCalendarDay(sessions: ChatSession[]) {
  const map = new Map<string, ChatSession[]>();
  for (const s of sessions) {
    const key = localDayKeyFromTimestamp(s.lastMessageAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  for (const list of map.values()) {
    list.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }
  const keys = [...map.keys()].sort((a, b) => b.localeCompare(a));
  return keys.map(dateKey => ({
    dateKey,
    label: formatSessionDayBanner(dateKey),
    sessions: map.get(dateKey)!,
  }));
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary [animation-delay:-0.2s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary [animation-delay:-0.1s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary" />
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] border border-border-subtle bg-surface-tertiary px-2 py-1.5">
      <p className="text-[9px] font-bold uppercase tracking-wider text-text-tertiary">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[11px] text-text-secondary" title={value}>{value}</p>
    </div>
  );
}

function fmtIntMetric(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString();
}

function fmtKdMetric(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return String(Math.round(n));
}

function fmtCpcMetric(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function ChatBubble({ msg, embeddedAssistant }: { msg: ChatMsg; embeddedAssistant?: boolean }) {
  if (embeddedAssistant && msg.role === "assistant") {
    return (
      <div className="rounded-[14px] rounded-tl-[4px] border border-border-subtle bg-surface-elevated px-3.5 py-2.5 text-[13px] leading-relaxed text-text-secondary w-full min-w-0">
        {msg.text}
      </div>
    );
  }
  return (
    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      {msg.role === "assistant" && (
        <div className="mr-2 mt-1 h-6 w-6 shrink-0 rounded-full bg-brand-primary flex items-center justify-center">
          <SparkleIcon className="h-3 w-3 text-brand-on-primary" />
        </div>
      )}
      <div
        className={[
          "max-w-[82%] rounded-[14px] px-3.5 py-2.5 text-[13px] leading-relaxed",
          msg.role === "user"
            ? "rounded-tr-[4px] bg-brand-action text-white"
            : "rounded-tl-[4px] border border-border-subtle bg-surface-elevated text-text-secondary",
        ].join(" ")}
      >
        {msg.text}
      </div>
    </div>
  );
}

/* ─── Rich calendar entry card ─────────────────────────────────────────── */

interface RichCalendarEntry {
  id: string;
  date: string;
  keyword: string;
  keyword_id?: string | null;
  title: string;
  status: string;
  article_type: string;
  secondary_keywords?: string[];
  volume: number | null;
  kd: number | null;
  cpc?: number | null;
  intent: string;
  trend?: string;
}

/** Fill metrics from live keyword query when persisted tool rows predate registry merge. */
function enrichCalendarEntryFromKeywords(
  entry: RichCalendarEntry,
  byId: Map<string, { volume: number; kd: number; cpc: number; intent: string | null }>
): RichCalendarEntry {
  if (!entry.keyword_id) return entry;
  const k = byId.get(entry.keyword_id);
  if (!k) return entry;
  return {
    ...entry,
    volume: entry.volume != null && !Number.isNaN(entry.volume) ? entry.volume : k.volume,
    kd: entry.kd != null && !Number.isNaN(entry.kd) ? entry.kd : k.kd,
    cpc: entry.cpc != null && !Number.isNaN(entry.cpc) ? entry.cpc : k.cpc,
    intent: entry.intent?.trim() ? entry.intent : (k.intent ?? ""),
  };
}

const STATUS_COLOR: Record<string, string> = {
  scheduled: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  generating: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  generated: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  downloaded: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  approved: "border-brand-action/30 bg-brand-action/10 text-brand-action",
  published: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
};

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function CalendarEntryDetailCard({
  entry,
  projectId,
  busy,
  onGenerate,
}: {
  entry: RichCalendarEntry;
  projectId: string;
  busy: boolean;
  onGenerate: (e: RichCalendarEntry) => void;
}) {
  const canGenerate = entry.status === "scheduled";
  const hasBlog = entry.status === "generated" || entry.status === "downloaded" || entry.status === "approved" || entry.status === "published";
  const statusClasses = STATUS_COLOR[entry.status] ?? STATUS_COLOR.scheduled;
  const intentLabel = entry.intent?.trim()
    ? entry.intent.charAt(0).toUpperCase() + entry.intent.slice(1)
    : "—";

  return (
    <div className="border-t border-border-subtle/70 bg-surface-elevated/90 px-3.5 py-3 first:border-t-0">
      <header className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-wide text-text-tertiary">{fmtDate(entry.date)}</p>
          <h4 className="mt-0.5 text-[14px] font-semibold text-text-primary truncate">{entry.title || entry.keyword}</h4>
          {entry.title && <p className="mt-0.5 text-[11px] font-mono text-brand-action/70 truncate">{entry.keyword}</p>}
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusClasses}`}>
          {entry.status}
        </span>
      </header>

      <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        <Metric label="Volume" value={fmtIntMetric(entry.volume)} />
        <Metric label="KD" value={fmtKdMetric(entry.kd)} />
        <Metric label="CPC" value={fmtCpcMetric(entry.cpc)} />
        <Metric label="Intent" value={intentLabel} />
        <Metric label="Type" value={entry.article_type || "Blog Post"} />
      </div>

      {entry.secondary_keywords && entry.secondary_keywords.length > 0 && (
        <div className="mt-2">
          <p className="font-mono text-[9px] uppercase tracking-wide text-text-tertiary">Secondary</p>
          <p className="mt-0.5 text-[11px] text-text-secondary line-clamp-2">{entry.secondary_keywords.slice(0, 5).join(", ")}</p>
        </div>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        {canGenerate && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onGenerate(entry)}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-action/40 bg-brand-action/10 px-3 py-1.5 text-[11px] font-semibold text-brand-action hover:bg-brand-action/20 transition-colors disabled:pointer-events-none disabled:opacity-60"
          >
            {busy ? (
              <>
                <svg className="h-3.5 w-3.5 shrink-0 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z" strokeOpacity="0.25" />
                  <path d="M8 2a6 6 0 0 1 6 6" strokeLinecap="round" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 3v10l8-5-8-5z" />
                </svg>
                Generate Blog
              </>
            )}
          </button>
        )}
        {hasBlog && (
          <ProjectNavLink
            href={`/projects/${projectId}/blogs?entry=${entry.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            View Blog
          </ProjectNavLink>
        )}
        <p className="ml-auto font-mono text-[10px] uppercase tracking-wide text-text-tertiary">
          Status: <span className="text-text-secondary normal-case">{entry.status}</span>
        </p>
      </footer>
    </div>
  );
}

function CalendarEntryListCard({
  call,
  projectId,
  busyEntryId,
  keywordMetricById,
  onGenerate,
}: {
  call: ToolCallResult;
  projectId: string;
  busyEntryId: string | null;
  keywordMetricById: Map<string, { volume: number; kd: number; cpc: number; intent: string | null }>;
  onGenerate: (e: RichCalendarEntry) => void;
}) {
  const data = call.result.data as { entries?: RichCalendarEntry[] } | undefined;
  const rawEntries = data?.entries ?? [];
  if (!rawEntries.length) return <ToolResultCard call={call} />;
  const entries = rawEntries.map(e => enrichCalendarEntryFromKeywords(e, keywordMetricById));
  return (
    <div className="overflow-hidden rounded-[14px] border border-emerald-500/30 shadow-lg shadow-black/20">
      <div className="bg-linear-to-r from-emerald-600/25 via-emerald-500/15 to-teal-600/20 px-3.5 py-2.5 border-b border-emerald-500/20">
        <p className="font-mono text-[10px] uppercase tracking-wide text-emerald-200/80">{call.id.replace(/\./g, " · ")}</p>
        <p className="mt-0.5 text-[13px] font-medium text-text-primary leading-snug">{call.result.message}</p>
      </div>
      <div className="bg-surface-secondary/95">
        {entries.map(e => (
          <CalendarEntryDetailCard
            key={e.id}
            entry={e}
            projectId={projectId}
            busy={busyEntryId === e.id}
            onGenerate={onGenerate}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Tiny status card rendered for each tool the assistant ran.
 * Green for success, coral for failure. Uses the Cohere palette and a
 * subtle backdrop-blur so it sits comfortably on the dark chat surface.
 */
function ToolResultCard({ call }: { call: ToolCallResult }) {
  const ok = call.result.success;
  const label = call.id.replace(/\./g, " · ");
  return (
    <div
      className={[
        "rounded-[10px] border px-3 py-2 backdrop-blur-sm",
        ok
          ? "border-emerald-500/25 bg-emerald-500/8"
          : "border-red-500/25 bg-red-500/8",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={[
            "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
            ok ? "bg-emerald-400" : "bg-red-400",
          ].join(" ")}
        />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-wide text-text-tertiary">{label}</p>
          <p className={`mt-0.5 text-[12px] leading-snug ${ok ? "text-text-primary" : "text-red-300"}`}>
            {call.result.message || (ok ? "Done." : "Failed.")}
          </p>
        </div>
        {call.durationMs > 0 && (
          <span className="font-mono text-[9px] text-text-tertiary tabular-nums">
            {call.durationMs}ms
          </span>
        )}
      </div>
    </div>
  );
}

function SuggestionCard({
  s,
  idx,
  status,
  approvalState,
  approvalError,
  onStatusChange,
}: {
  s: ContextualSuggestion;
  idx: number;
  status: KeywordStatus;
  approvalState: "idle" | "loading" | "success" | "error";
  approvalError?: string;
  onStatusChange: (next: KeywordStatus) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const intentLabel = s.metrics.intent
    ? s.metrics.intent.charAt(0).toUpperCase() + s.metrics.intent.slice(1)
    : null;

  // Collapsed summary: first sentence of whyThisMatters (up to 80 chars)
  const summary = s.whyThisMatters.length > 80
    ? s.whyThisMatters.slice(0, 77).trimEnd() + "…"
    : s.whyThisMatters;

  return (
    <article className="rounded-[12px] border border-border-subtle bg-surface-elevated overflow-hidden">
      {/* ── collapsed header — always visible ── */}
      <button
        type="button"
        onClick={() => setIsExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3.5 pt-3 pb-3 text-left hover:bg-surface-hover/40 transition-colors"
      >
        {/* rank */}
        <span className="shrink-0 font-mono text-[10px] text-text-tertiary w-5">#{idx + 1}</span>

        {/* keyword + summary */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-text-primary truncate">{s.keyword}</p>
          {!isExpanded && (
            <p className="mt-0.5 text-[11px] text-text-tertiary truncate">{summary}</p>
          )}
        </div>

        {/* score badge */}
        <div className="shrink-0 rounded-[8px] border border-brand-action/25 bg-brand-action/10 px-2 py-0.5 text-center">
          <p className="font-mono text-[13px] font-bold text-brand-action leading-none">{s.score}</p>
          <p className="text-[8px] uppercase tracking-wide text-text-tertiary mt-0.5">score</p>
        </div>

        {/* funnel badge */}
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
          s.funnelStage === "BOFU"
            ? "border-green-500/30 bg-green-500/10 text-green-400"
            : s.funnelStage === "MOFU"
            ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
            : "border-blue-500/30 bg-blue-500/10 text-blue-400"
        }`}>
          {s.funnelStage}
        </span>

        {/* chevron */}
        <svg
          className={`shrink-0 h-4 w-4 text-text-tertiary transition-transform duration-300 ${isExpanded ? "rotate-180" : "rotate-0"}`}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* ── expandable body ── */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: isExpanded ? "1fr" : "0fr",
          transition: "grid-template-rows 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="px-3.5 pb-3.5 space-y-2.5">
            {/* metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              <Metric label="Volume" value={fmtIntMetric(s.metrics.volume)} />
              <Metric label="KD" value={fmtKdMetric(s.metrics.kd)} />
              <Metric label="CPC" value={fmtCpcMetric(s.metrics.cpc)} />
              <Metric label="Intent" value={intentLabel ?? "—"} />
              <Metric label="Funnel" value={s.funnelStage} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Metric label="Traffic" value={s.estimatedMonthlyTraffic ? `~${s.estimatedMonthlyTraffic}/mo` : "—"} />
              <Metric label="Rank %" value={`${s.rankingChance}%`} />
            </div>

            {/* full reasoning */}
            <p className="text-[12px] leading-relaxed text-text-secondary">{s.whyThisMatters}</p>

            {/* action step */}
            {s.actionStep && (
              <p className="text-[11px] text-brand-action/80 italic">{s.actionStep}</p>
            )}

            <div className="pt-1 flex flex-wrap items-center gap-2" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
              <KeywordActionDropdown
                status={status}
                busy={approvalState === "loading"}
                onChange={onStatusChange}
              />
              {approvalState === "error" ? (
                <p className="text-[11px] text-red-400">{approvalError ?? "Failed to add"}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ContextualAIChatbot({ project, aiMode, setAiMode }: Props) {
  const pathname = usePathname();
  const page = detectAIPageFromPath(pathname);
  const blogId = extractBlogId(pathname);
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();

  const currentSessionId = useRef(genId());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [panelMounted, setPanelMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExtendedAgentOutput | null>(null);
  // When the planner returns mutating tools that need confirmation, we stash
  // the original prompt so we can re-run with `awaitConfirmation: false`.
  const [pendingConfirmation, setPendingConfirmation] = useState<{ prompt: string; toolCalls: PendingToolCall[] } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [input, setInput] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<ChatMsg | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPage = useRef(page);

  /** Per-suggestion card (`msgId::idx`) — API add-to-calendar flow. */
  const [approvalStates, setApprovalStates] = useState<Record<string, "idle" | "loading" | "success" | "error">>({});
  const [approvalErrors, setApprovalErrors] = useState<Record<string, string>>({});
  /** User chose Rejected on a card (keyed like approvalStates). */
  const [suggestionRejected, setSuggestionRejected] = useState<Record<string, boolean>>({});
  /** In-flight calendar blog gen — locks input for this session until `generateBlog` returns. */
  const [calendarBlogGen, setCalendarBlogGen] = useState<{
    entryId: string;
    keyword: string;
    sessionId: string;
  } | null>(null);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const historyMenuRef = useRef<HTMLDivElement>(null);

  const lowCompetitionIds = useAppSelector(s => selectAiLowCompetitionKeywordIds(s, project.id));
  const longTailIds = useAppSelector(s => selectAiLongTailKeywordIds(s, project.id));
  const suggestedKeywordIds = useAppSelector(s => selectAiSuggestedKeywordIds(s, project.id));
  const aiMemory = useAppSelector(s => selectAiMemory(s, project.id));
  const chatHistory = aiMemory.chatHistory ?? ([] as ChatMsg[]);
  const chatSessions = aiMemory.chatSessions ?? ([] as ChatSession[]);
  const recentQueries = aiMemory.recentQueries ?? [];
  const keywordPrefs = useAppSelector(s => selectKeywordPrefs(s, project.id));
  const keywordStatuses = useAppSelector(s => selectKeywordStatuses(s, project.id));

  // Mount animation
  useEffect(() => {
    if (aiMode !== "closed") {
      requestAnimationFrame(() => setPanelMounted(true));
    } else {
      setPanelMounted(false);
    }
  }, [aiMode]);

  // Focus input when opening
  useEffect(() => {
    if (aiMode !== "closed" && panelMounted) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [aiMode, panelMounted]);

  useEffect(() => {
    if (!historyMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (historyMenuRef.current && !historyMenuRef.current.contains(e.target as Node)) {
        setHistoryMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [historyMenuOpen]);

  // Reset session when page changes
  useEffect(() => {
    if (lastPage.current !== page) {
      currentSessionId.current = genId();
      setActiveSessionId(null);
      setResult(null);
      setError("");
      lastPage.current = page;
    }
  }, [page]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory.length, loading, calendarBlogGen]);

  const { data: briefData } = useQuery({
    queryKey: qk.brief(project.id),
    queryFn: () => briefApi.get(project.id),
    enabled: !!page,
  });

  const { data: keywordsData } = useQuery({
    ...keywordsListQueryOptions(project.id),
    enabled: !!page,
  });

  // Domain-tab keywords — Supabase snapshot merged with `keywords`; refresh only via Re-discover.
  const { data: domainKeywordsData } = useQuery({
    queryKey: qk.domainKeywords(project.id),
    queryFn: () => keywordsApi.domainKeywords(project.id),
    enabled: aiMode !== "closed",
    staleTime: Infinity,
  });

  const { data: competitorData } = useQuery({
    queryKey: qk.competitors(project.id),
    queryFn: () => competitorsApi.benchmark(project.id),
    // Load whenever AI is open so competitor queries work from any page
    enabled: page === "competitors" || aiMode !== "closed",
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const { data: calendarData } = useQuery({
    queryKey: qk.calendar(project.id),
    queryFn: () => calendarApi.entries(project.id),
    enabled: page === "calendar" || page === "blogs" || aiMode !== "closed",
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const { data: auditData } = useQuery({
    queryKey: qk.audits(project.id),
    queryFn: () => auditsApi.list(project.id),
    // Load whenever AI is open so audit queries work from any page
    enabled: page === "audit" || aiMode !== "closed",
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const context = useMemo(() => {
    if (!page) return null;
    const brief = briefData?.success ? briefData.brief ?? null : null;
    const keywordsRaw = keywordsData && "success" in keywordsData && keywordsData.success ? keywordsData.data : [];
    const aiSet = new Set(suggestedKeywordIds);
    const keywords = keywordsRaw
      .map(k => (keywordStatuses[k.id] ? { ...k, status: keywordStatuses[k.id] } : k))
      .filter(k => {
        if (page !== "keywords") return true;
        if (keywordPrefs.filter === "ai") return aiSet.has(k.id);
        if (keywordPrefs.filter === "pending" || keywordPrefs.filter === "approved" || keywordPrefs.filter === "rejected") {
          return k.status === keywordPrefs.filter;
        }
        return true;
      })
      .slice(0, 100);
    const competitorKeywords = competitorData?.competitorKeywords ?? [];
    const contentGaps = competitorData?.gaps ?? [];
    const calendarEntries = calendarData?.success ? calendarData.data : [];
    const audits =
      auditData?.success && Array.isArray(auditData.data)
        ? auditData.data.map(row => ({
            url: row.url,
            title: row.title,
            health_score: row.health_score,
            severity: row.severity,
            primary_keyword: row.primary_keyword,
            analysis_summary: row.analysis?.summary ?? "",
          }))
        : [];
    const domainKeywords =
      domainKeywordsData && "data" in domainKeywordsData ? domainKeywordsData.data : [];
    return getAIContext({
      projectId: project.id,
      page,
      project,
      brief,
      keywords,
      domainKeywords,
      competitorKeywords,
      contentGaps,
      calendarData: calendarEntries,
      blogs: [],
      audits,
      memory: {
        lastAction: aiMemory.lastAction,
        selectedKeywordIds: aiMemory.selectedKeywordIds,
        preferredFilter: aiMemory.preferredFilter,
        recentQueries,
        chatHistory,
      },
    });
  }, [
    aiMemory.lastAction,
    aiMemory.preferredFilter,
    aiMemory.selectedKeywordIds,
    auditData,
    briefData,
    calendarData,
    competitorData,
    domainKeywordsData,
    keywordPrefs.filter,
    keywordStatuses,
    keywordsData,
    lowCompetitionIds,
    longTailIds,
    page,
    project,
    recentQueries,
    chatHistory,
    suggestedKeywordIds,
  ]);

  // Derive sessions from history (newest first)
  const sessions = useMemo<ChatSession[]>(() => {
    const map = new Map<string, ChatSession>();
    for (const m of chatHistory) {
      const sid = m.sessionId;
      if (!map.has(sid)) {
        const existingSession = chatSessions.find(s => s.id === sid);
        map.set(sid, {
          id: sid,
          title: existingSession?.title ?? (m.role === "user" ? m.text.slice(0, 55) : "Conversation"),
          page: m.page,
          createdAt: existingSession?.createdAt ?? m.timestamp,
          lastMessageAt: m.timestamp,
        });
      } else {
        const s = map.get(sid)!;
        s.lastMessageAt = m.timestamp;
      }
    }
    return Array.from(map.values()).reverse();
  }, [chatHistory, chatSessions]);

  const groupedSessions = useMemo(() => groupSessionsByCalendarDay(sessions), [sessions]);

  /** Live keyword metrics for calendar cards (join + persisted tool payloads). */
  const keywordMetricById = useMemo(() => {
    const raw = keywordsData && "success" in keywordsData && keywordsData.success ? keywordsData.data : [];
    const m = new Map<string, { volume: number; kd: number; cpc: number; intent: string | null }>();
    for (const k of raw) {
      m.set(k.id, { volume: k.volume, kd: k.kd, cpc: k.cpc, intent: k.intent ?? null });
    }
    return m;
  }, [keywordsData]);

  // Messages to display in chat area
  const activeSession = activeSessionId ?? currentSessionId.current;
  const displayMessages = useMemo(
    () => chatHistory.filter(m => m.sessionId === activeSession),
    [chatHistory, activeSession]
  );

  /** Same session as the one that started calendar blog gen — no new prompts until finished. */
  const blogGenLocksThisView =
    Boolean(calendarBlogGen) && activeSession === calendarBlogGen?.sessionId;

  const handleApprove = useCallback(
    async (s: ContextualSuggestion, resultPage: AIPageExtended, cardKey: string) => {
      setApprovalStates(prev => ({ ...prev, [cardKey]: "loading" }));
      setApprovalErrors(prev => {
        const next = { ...prev };
        delete next[cardKey];
        return next;
      });

      const res = await calendarApi.approveAiSuggestion(project.id, {
        keyword: s.keyword,
        keywordId: s.id,
        source: s.source,
        page: resultPage,
        volume: s.metrics.volume,
        kd: s.metrics.kd,
        cpc: s.metrics.cpc,
        intent: s.metrics.intent,
      });

      if (res.success) {
        setApprovalStates(prev => ({ ...prev, [cardKey]: "success" }));
        queryClient.invalidateQueries({ queryKey: qk.calendar(project.id) });
        queryClient.invalidateQueries({ queryKey: qk.keywords(project.id) });
      } else {
        setApprovalStates(prev => ({ ...prev, [cardKey]: "error" }));
        setApprovalErrors(prev => ({ ...prev, [cardKey]: res.error ?? "Failed to add" }));
      }
    },
    [project.id, queryClient]
  );

  const handleSuggestionWorkspaceStatus = useCallback(
    (cardKey: string, s: ContextualSuggestion, resultPage: AIPageExtended, next: KeywordStatus) => {
      const api = approvalStates[cardKey] ?? "idle";
      if (next === "approved") {
        if (api === "success") return;
        if (api === "loading") return;
        setSuggestionRejected(prev => {
          const o = { ...prev };
          delete o[cardKey];
          return o;
        });
        void handleApprove(s, resultPage, cardKey);
        return;
      }
      if (next === "rejected") {
        setSuggestionRejected(prev => ({ ...prev, [cardKey]: true }));
        setApprovalErrors(prev => {
          const o = { ...prev };
          delete o[cardKey];
          return o;
        });
        return;
      }
      // pending — reset workspace so user can retry approve
      setSuggestionRejected(prev => {
        const o = { ...prev };
        delete o[cardKey];
        return o;
      });
      setApprovalStates(prev => {
        const o = { ...prev };
        delete o[cardKey];
        return o;
      });
      setApprovalErrors(prev => {
        const o = { ...prev };
        delete o[cardKey];
        return o;
      });
    },
    [approvalStates, handleApprove]
  );

  const run = useCallback(
    async (nextPrompt: string, opts: { awaitConfirmation?: boolean; suppressUserMsg?: boolean } = {}) => {
      if (!page || !context) return;
      setActiveSessionId(null);
      setResult(null);
      setError("");

      // Show user message immediately (optimistic) so it doesn't disappear during loading
      const now = new Date().toISOString();
      const sid = currentSessionId.current;
      const userMsg: ChatMsg = { id: genId(), sessionId: sid, role: "user", text: nextPrompt, page, timestamp: now };
      if (!opts.suppressUserMsg) setPendingUserMessage(userMsg);
      setLoading(true);

      try {
        const body: ContextualAgentRequestBody = {
          projectId: project.id,
          page,
          prompt: nextPrompt,
          context,
          project: {
            niche: project.niche,
            target_audience: project.target_audience,
            target_region: project.target_region,
          },
          blogId,
          awaitConfirmation: opts.awaitConfirmation ?? true,
        };
        const res = await fetch("/api/ai/keyword-decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as ApiResponse;
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error ?? "AI assistant failed");
        }
        setResult(json.data);

        // Surface pending mutating tools so the UI can render confirmation chips.
        if (json.data.plan?.awaitingConfirmation) {
          const pending = json.data.plan.toolCalls.filter(t => !t.result.success || t.result.message?.startsWith("Pending"));
          setPendingConfirmation({
            prompt: nextPrompt,
            toolCalls: pending.map(t => ({ id: t.id, params: t.params })),
          });
        } else {
          setPendingConfirmation(null);
        }
        // Whenever a successful mutating tool ran, refresh shared queries so
        // the UI elsewhere reflects the change.
        const ranMutation = json.data.plan?.toolCalls?.some(
          t => t.result.success && t.result.sideEffect && !t.result.message?.startsWith("Pending")
        );
        if (ranMutation) {
          queryClient.invalidateQueries({ queryKey: qk.calendar(project.id) });
          queryClient.invalidateQueries({ queryKey: qk.keywords(project.id) });
          queryClient.invalidateQueries({ queryKey: qk.audits(project.id) });
          dispatch(contentHealthAuditMarkStale({ projectId: project.id }));
          if (blogId) queryClient.invalidateQueries({ queryKey: qk.blog(blogId) });
        }

        const responseTs = new Date().toISOString();
        // Persist tool call results and suggestion cards onto the assistant
        // message so they keep showing in the chat scroll-back instead of
        // disappearing on the next turn.
        const persistedToolCalls = (json.data.plan?.toolCalls ?? []).filter(
          tc => !tc.result.message?.startsWith("Pending")
        );
        const assistantMsg: ChatMsg = {
          id: genId(),
          sessionId: sid,
          role: "assistant",
          text: json.data.summary,
          page,
          timestamp: responseTs,
          toolCalls: persistedToolCalls.length ? persistedToolCalls : undefined,
          suggestions: json.data.suggestions?.length ? json.data.suggestions : undefined,
        };
        const nextRecentQueries = [...recentQueries, nextPrompt].slice(-12);
        const nextHistory = [...chatHistory, userMsg, assistantMsg].slice(-100);

        const existingSession = chatSessions.find(s => s.id === sid);
        const sessionTitle = existingSession?.title ?? nextPrompt.slice(0, 55);
        const nextSessions: ChatSession[] = existingSession
          ? chatSessions.map(s => s.id === sid ? { ...s, lastMessageAt: responseTs } : s)
          : [...chatSessions, { id: sid, title: sessionTitle, page, createdAt: now, lastMessageAt: responseTs }].slice(-50);

        // Clear optimistic message before Redux update (they batch together in React 18)
        setPendingUserMessage(null);
        dispatch(
          aiAssistantMemoryUpdated({
            projectId: project.id,
            suggestedKeywordIds: json.data.filters.suggestedKeywordIds,
            suggestedGapKeywords: json.data.filters.suggestedGapKeywords,
            lowCompetitionKeywordIds: json.data.filters.lowCompetitionKeywordIds,
            longTailKeywordIds: json.data.filters.longTailKeywordIds,
            selectedKeywordIds: json.data.filters.suggestedKeywordIds,
            lastAction: "ANALYZE_KEYWORDS",
            preferredFilter: "ai",
            recentQueries: nextRecentQueries,
            chatHistory: nextHistory,
            chatSessions: nextSessions,
          })
        );
      } catch (e) {
        setPendingUserMessage(null);
        setError(e instanceof Error ? e.message : "AI assistant failed");
      } finally {
        setLoading(false);
      }
    },
    [chatHistory, chatSessions, context, dispatch, page, project, recentQueries, blogId, queryClient]
  );

  /** Confirm + run a previously-pending mutating tool list. */
  const runConfirmed = useCallback(async () => {
    if (!pendingConfirmation) return;
    setConfirming(true);
    try {
      await run(pendingConfirmation.prompt, { awaitConfirmation: false, suppressUserMsg: true });
    } finally {
      setConfirming(false);
      setPendingConfirmation(null);
    }
  }, [pendingConfirmation, run]);

  const cancelConfirmation = useCallback(() => setPendingConfirmation(null), []);

  /** Append a system assistant message to history (no LLM round trip). */
  const appendSystemMessage = useCallback(
    (text: string, toolCalls: ToolCallResult[] = [], userText?: string) => {
      const ts = new Date().toISOString();
      const sid = currentSessionId.current;
      const additions: ChatMsg[] = [];
      if (userText) {
        additions.push({ id: genId(), sessionId: sid, role: "user", text: userText, page: page!, timestamp: ts });
      }
      additions.push({
        id: genId(),
        sessionId: sid,
        role: "assistant",
        text,
        page: page!,
        timestamp: ts,
        toolCalls: toolCalls.length ? toolCalls : undefined,
      });
      const next = [...chatHistory, ...additions].slice(-100);
      dispatch(
        aiAssistantMemoryUpdated({
          projectId: project.id,
          chatHistory: next,
        })
      );
    },
    [chatHistory, dispatch, page, project.id]
  );

  const onGenerateEntry = useCallback(
    async (entry: RichCalendarEntry) => {
      if (calendarBlogGen) return;
      const sid = currentSessionId.current;
      setCalendarBlogGen({ entryId: entry.id, keyword: entry.keyword, sessionId: sid });
      const userText = `Generate the blog for "${entry.keyword}".`;
      try {
        const { generateBlog } = await import("@/app/actions/blog-actions");
        const res = await generateBlog(entry.id, 2500);
        const ok = Boolean(res?.success);
        const tc: ToolCallResult = {
          id: "calendar.generateBlog",
          params: { keyword: entry.keyword, entryId: entry.id },
          durationMs: 0,
          result: {
            success: ok,
            message: ok
              ? `Generated blog for "${entry.keyword}".`
              : (res?.error ?? "Generation failed."),
            sideEffect: ok ? "blog.generated" : undefined,
          },
        };
        appendSystemMessage(
          ok
            ? `Done — the blog for "${entry.keyword}" is generated. You can view it from the Blogs page.`
            : `Couldn't generate "${entry.keyword}": ${res?.error ?? "unknown error"}.`,
          [tc],
          userText
        );
        if (ok) {
          queryClient.invalidateQueries({ queryKey: qk.calendar(project.id) });
          queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(project.id) });
        }
      } catch (e) {
        appendSystemMessage(`Couldn't generate "${entry.keyword}": ${e instanceof Error ? e.message : "error"}.`, [], userText);
      } finally {
        setCalendarBlogGen(null);
      }
    },
    [appendSystemMessage, calendarBlogGen, project.id, queryClient]
  );

  const startNewChat = useCallback(() => {
    currentSessionId.current = genId();
    setActiveSessionId(null);
    setResult(null);
    setError("");
    setInput("");
    setPendingUserMessage(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSend = useCallback(() => {
    const q = input.trim();
    if (!q || loading || !page || blogGenLocksThisView) return;
    setInput("");
    void run(q);
  }, [input, loading, page, run, blogGenLocksThisView]);

  const canSend = input.trim().length > 0 && !loading && !!page && !blogGenLocksThisView;

  // Don't render FAB or panel on non-project pages
  if (!page && aiMode === "closed") return null;

  const prompts = page
    ? page === "blogs" && blogId
      ? [
          { id: "fixSeo", label: "Improve SEO score", prompt: "Run all the AI fixes that would improve my SEO score." },
          { id: "addCit", label: "Add citations", prompt: "Add 3 credible external citations to this blog." },
          { id: "addInt", label: "Add internal links", prompt: "Add 2 internal links from my own website." },
          { id: "p4", label: "Rewrite a paragraph", prompt: "Rewrite paragraph 4 to be more concrete with examples." },
        ]
      : QUICK_PROMPTS[page]
    : [];
  const isViewingHistory = activeSessionId !== null && activeSessionId !== currentSessionId.current;

  return (
    <>
      {/* FAB button — only when closed and on a specific page */}
      {aiMode === "closed" && page && (
        <button
          type="button"
          onClick={() => setAiMode("mini")}
          className="group fixed bottom-6 right-6 z-95 inline-flex h-12 items-center gap-2.5 rounded-full border border-brand-action/40 bg-brand-primary/90 px-5 text-[13px] font-semibold text-brand-on-primary shadow-xl shadow-brand-action/25 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-brand-primary hover:shadow-2xl hover:shadow-brand-action/40"
        >
          <SparkleIcon className="h-4 w-4 shrink-0" />
          Ask AI
        </button>
      )}

      {/* Backdrop — fades in only in full mode */}
      {aiMode !== "closed" && (
        <div
          className="fixed inset-0 z-90 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
          style={{ opacity: aiMode === "full" ? 1 : 0, pointerEvents: aiMode === "full" ? "auto" : "none" }}
          onClick={() => setAiMode("mini")}
        />
      )}

      {/* Chat panel — transitions from mini to full via CSS */}
      {aiMode !== "closed" && (
        <div
          className={[
            "fixed z-95 flex overflow-hidden",
            // Glassmorphism: subtle border, soft shadow, translucent surface
            // with backdrop blur — sits comfortably over any page.
            "border border-white/8 shadow-2xl shadow-black/40",
            "bg-surface-primary/85 backdrop-blur-xl backdrop-saturate-150",
            "transition-[inset,width,height,border-radius] duration-300 ease-out",
            aiMode === "full"
              ? "inset-4 rounded-[22px]"
              : "bottom-6 right-6 w-[460px] h-[min(700px,calc(100vh-3rem))] rounded-[18px]",
          ].join(" ")}
          style={{
            opacity: panelMounted ? 1 : 0,
            transform: panelMounted ? "none" : "scale(0.96) translateY(10px)",
            transition: [
              "inset 0.3s ease-out",
              "width 0.3s ease-out",
              "height 0.3s ease-out",
              "border-radius 0.3s ease-out",
              "opacity 0.2s ease-out",
              "transform 0.2s ease-out",
            ].join(", "),
          }}
        >
          {/* ── History Sidebar (full mode only) ── */}
          <aside
            className={[
              "border-r border-border-subtle bg-surface-secondary flex-col",
              "transition-[width,opacity] duration-300 ease-out overflow-hidden",
              aiMode === "full" ? "flex w-[260px] opacity-100" : "hidden w-0 opacity-0",
            ].join(" ")}
          >
            <div className="shrink-0 px-4 py-4 border-b border-border-subtle">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">History</p>
                <button
                  type="button"
                  onClick={startNewChat}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[11px] font-semibold text-brand-action bg-brand-action/10 border border-brand-action/20 hover:bg-brand-action/15 transition-colors"
                >
                  <PlusIcon className="h-3 w-3" />
                  New
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
              {groupedSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <div className="w-10 h-10 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-3">
                    <SparkleIcon className="h-4 w-4 text-text-tertiary" />
                  </div>
                  <p className="text-[12px] text-text-tertiary">No chat history yet</p>
                  <p className="text-[11px] text-text-tertiary mt-1">Start a conversation to see it here</p>
                </div>
              ) : (
                groupedSessions.map(group => (
                  <div key={group.dateKey}>
                    <div className="px-2 py-1.5 mb-1 rounded-[6px] bg-brand-action/8 border border-brand-action/15">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-brand-action">{group.label}</p>
                    </div>
                    <div className="space-y-0.5">
                      {group.sessions.map(session => {
                        const isActive = activeSession === session.id;
                        return (
                          <button
                            key={session.id}
                            type="button"
                            onClick={() => setActiveSessionId(session.id)}
                            className={[
                              "w-full text-left px-2.5 py-2 rounded-[8px] transition-colors group",
                              isActive
                                ? "bg-brand-action/10 border border-brand-action/20"
                                : "hover:bg-surface-hover border border-transparent",
                            ].join(" ")}
                          >
                            <p className={`truncate text-[12px] font-medium ${isActive ? "text-brand-action" : "text-text-primary group-hover:text-text-primary"}`}>
                              {session.title}
                            </p>
                            <p className="text-[10px] text-text-tertiary capitalize mt-0.5">{session.page}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* ── Main Chat Area ── */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* Header */}
            <header className="shrink-0 border-b border-border-subtle bg-surface-primary px-4 py-3">
              <div className="flex items-center gap-2">
                {aiMode === "mini" ? (
                  <div className="relative shrink-0" ref={historyMenuRef}>
                    <button
                      type="button"
                      onClick={() => setHistoryMenuOpen(o => !o)}
                      aria-expanded={historyMenuOpen}
                      aria-haspopup="listbox"
                      title="Chat history"
                      className={`flex h-8 w-8 items-center justify-center rounded-[8px] border transition-colors ${
                        historyMenuOpen
                          ? "border-brand-action/40 bg-brand-action/10 text-brand-action"
                          : "border-border-subtle bg-surface-elevated text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      }`}
                    >
                      <HistoryIcon className="h-4 w-4" />
                    </button>
                    {historyMenuOpen ? (
                      <div
                        role="listbox"
                        className="absolute left-0 top-[calc(100%+6px)] z-100 w-[min(320px,calc(100vw-2.5rem))] max-h-[min(340px,45vh)] overflow-y-auto rounded-[12px] border border-border-subtle bg-surface-elevated py-2 shadow-2xl shadow-black/50"
                      >
                        {groupedSessions.length === 0 ? (
                          <div className="px-4 py-6 text-center">
                            <p className="text-[12px] text-text-tertiary">No chat history yet</p>
                            <p className="mt-1 text-[11px] text-text-tertiary/80">Send a message to start a thread</p>
                          </div>
                        ) : (
                          groupedSessions.map(group => (
                            <div key={group.dateKey} className="px-2 pb-2 last:pb-0">
                              <div className="sticky top-0 z-10 -mx-1 mb-1.5 rounded-[6px] bg-surface-secondary px-2 py-1.5 border border-brand-action/20">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-action">{group.label}</p>
                              </div>
                              <div className="space-y-0.5">
                                {group.sessions.map(session => {
                                  const isActive = activeSession === session.id;
                                  return (
                                    <button
                                      key={session.id}
                                      type="button"
                                      role="option"
                                      aria-selected={isActive}
                                      onClick={() => {
                                        setActiveSessionId(session.id);
                                        setHistoryMenuOpen(false);
                                      }}
                                      className={[
                                        "w-full text-left px-2.5 py-2 rounded-[8px] transition-colors",
                                        isActive
                                          ? "bg-brand-action/10 border border-brand-action/25"
                                          : "hover:bg-surface-hover border border-transparent",
                                      ].join(" ")}
                                    >
                                      <p
                                        className={`truncate text-[12px] font-medium ${isActive ? "text-brand-action" : "text-text-primary"}`}
                                      >
                                        {session.title}
                                      </p>
                                      <p className="text-[10px] text-text-tertiary capitalize mt-0.5">{session.page}</p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-8 h-8 shrink-0 rounded-[8px] bg-brand-primary flex items-center justify-center">
                    <SparkleIcon className="h-[18px] w-[18px] text-brand-on-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-text-primary leading-none">AI Assistant</p>
                    {page && (
                      <p className="text-[11px] text-text-tertiary mt-0.5 capitalize">{page} · {project.name}</p>
                    )}
                  </div>
                </div>

                {page && (
                  <span className="hidden sm:inline-flex shrink-0 rounded-full border border-border-subtle px-2.5 py-1 text-[11px] font-medium text-text-secondary capitalize bg-surface-elevated">
                    {page}
                  </span>
                )}

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      startNewChat();
                      setHistoryMenuOpen(false);
                    }}
                    title="New chat"
                    className="flex h-8 w-8 items-center justify-center rounded-[8px] text-text-tertiary hover:bg-surface-hover hover:text-brand-action transition-colors"
                  >
                    <NewChatIcon className="h-[18px] w-[18px]" />
                  </button>
                  {aiMode === "mini" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryMenuOpen(false);
                        setAiMode("full");
                      }}
                      title="Expand to full view"
                      className="flex h-8 w-8 items-center justify-center rounded-[8px] text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors"
                    >
                      <ExpandIcon className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAiMode("mini")}
                      title="Collapse to mini"
                      className="flex h-8 w-8 items-center justify-center rounded-[8px] text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors"
                    >
                      <CollapseIcon className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryMenuOpen(false);
                      setAiMode("closed");
                    }}
                    title="Close"
                    className="flex h-8 w-8 items-center justify-center rounded-[8px] text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Quick prompts */}
              {prompts.length > 0 && (
                <div className={`mt-3 flex flex-wrap gap-1.5 mx-auto ${aiMode === "full" ? "max-w-[800px]" : "w-full"}`}>
                  {prompts.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setInput(""); void run(item.prompt); }}
                      disabled={loading || blogGenLocksThisView}
                      className="rounded-full border border-border-subtle bg-surface-elevated px-3 py-1.5 text-[11px] font-medium text-text-secondary hover:border-brand-action/40 hover:text-brand-action hover:bg-brand-action/5 disabled:opacity-50 transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </header>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto">
              <div className={`px-4 py-4 mx-auto ${aiMode === "full" ? "max-w-[800px]" : "w-full"}`}>
              <div className="space-y-3">
                {/* History viewing banner */}
                {isViewingHistory && (
                  <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[#f59e0b]/20 bg-[#f59e0b]/8 px-3 py-2">
                    <p className="text-[12px] text-[#f59e0b]">Viewing past conversation</p>
                    <button
                      type="button"
                      onClick={() => setActiveSessionId(null)}
                      className="text-[11px] font-medium text-[#f59e0b] hover:underline"
                    >
                      Back to current
                    </button>
                  </div>
                )}

                {/* Empty state */}
                {displayMessages.length === 0 && !pendingUserMessage && !loading && !error && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 rounded-[12px] bg-brand-primary/10 border border-brand-action/20 flex items-center justify-center mb-4">
                      <SparkleIcon className="h-5 w-5 text-brand-action" />
                    </div>
                    <p className="text-[14px] font-medium text-text-secondary">
                      {page ? `Your AI assistant for ${page}` : "Ask me anything about this project"}
                    </p>
                    <p className="text-[12px] text-text-tertiary mt-1.5 max-w-[280px]">
                      Use the quick chips above or type your own question below
                    </p>
                  </div>
                )}

                {/* Persisted chat messages — each assistant message renders its
                    own tool cards + suggestion cards inline so the scroll-back
                    stays a complete record of the conversation. */}
                {displayMessages.map((msg) =>
                  msg.role === "assistant" ? (
                    <div key={msg.id} className="flex justify-start w-full min-w-0">
                      <div className="mr-2 mt-1 h-6 w-6 shrink-0 rounded-full bg-brand-primary flex items-center justify-center">
                        <SparkleIcon className="h-3 w-3 text-brand-on-primary" />
                      </div>
                      <div className="min-w-0 max-w-[82%] space-y-2.5">
                        <ChatBubble msg={msg} embeddedAssistant />

                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="space-y-2">
                            {msg.toolCalls.map((tc, i) => {
                              if (
                                (tc.id === "calendar.listOnDate" ||
                                  tc.id === "calendar.upcoming" ||
                                  tc.id === "calendar.listByStatus") &&
                                tc.result.success
                              ) {
                                return (
                                  <CalendarEntryListCard
                                    key={`${tc.id}-${i}`}
                                    call={tc}
                                    projectId={project.id}
                                    busyEntryId={calendarBlogGen?.entryId ?? null}
                                    keywordMetricById={keywordMetricById}
                                    onGenerate={onGenerateEntry}
                                  />
                                );
                              }
                              return <ToolResultCard key={`${tc.id}-${i}`} call={tc} />;
                            })}
                          </div>
                        )}

                        {msg.suggestions && msg.suggestions.length > 0 && (
                          <div className="space-y-2.5">
                            {(msg.suggestions as ContextualSuggestion[]).map((s, idx) => {
                              const cardKey = `${msg.id}::${idx}`;
                              const api = approvalStates[cardKey] ?? "idle";
                              const status: KeywordStatus = suggestionRejected[cardKey]
                                ? "rejected"
                                : api === "success"
                                  ? "approved"
                                  : "pending";
                              return (
                                <SuggestionCard
                                  key={cardKey}
                                  s={s}
                                  idx={idx}
                                  status={status}
                                  approvalState={api}
                                  approvalError={approvalErrors[cardKey]}
                                  onStatusChange={next =>
                                    handleSuggestionWorkspaceStatus(cardKey, s, page!, next)
                                  }
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div key={msg.id} className="space-y-2.5">
                      <ChatBubble msg={msg} />
                    </div>
                  )
                )}

                {/* Optimistic user message (shown immediately while loading) */}
                {pendingUserMessage && <ChatBubble msg={pendingUserMessage} />}

                {blogGenLocksThisView && calendarBlogGen && (
                  <div className="flex justify-start w-full min-w-0">
                    <div className="mr-2 mt-1 h-6 w-6 shrink-0 rounded-full bg-amber-500/90 flex items-center justify-center">
                      <svg className="h-3.5 w-3.5 text-white animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z" strokeOpacity="0.3" />
                        <path d="M8 2a6 6 0 0 1 6 6" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="min-w-0 max-w-[82%] rounded-[14px] rounded-tl-[4px] border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5">
                      <p className="text-[12px] font-semibold text-amber-200">Generating blog</p>
                      <p className="mt-0.5 text-[12px] text-text-secondary leading-relaxed">
                        Writing and researching <span className="font-medium text-text-primary">“{calendarBlogGen.keyword}”</span>
                        — this can take a minute. You can open another chat from <span className="font-medium">New</span> while you wait.
                      </p>
                    </div>
                  </div>
                )}

                {/* Loading indicator */}
                {loading && (
                  <div className="flex justify-start w-full min-w-0">
                    <div className="mr-2 mt-1 h-6 w-6 shrink-0 rounded-full bg-brand-primary flex items-center justify-center">
                      <SparkleIcon className="h-3 w-3 text-brand-on-primary" />
                    </div>
                    <div className="min-w-0 max-w-[82%] rounded-[14px] rounded-tl-[4px] border border-border-subtle bg-surface-elevated px-4 py-2.5">
                      <TypingDots />
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="rounded-[12px] border border-red-500/20 bg-red-500/8 px-4 py-3 text-[13px] text-red-400">
                    {error}
                  </div>
                )}

                {/* Pending mutating tools — confirmation chips (transient, not in history) */}
                {pendingConfirmation && pendingConfirmation.toolCalls.length > 0 && !loading && (
                  <div className="rounded-[14px] border border-amber-500/30 bg-amber-500/8 px-4 py-3.5 backdrop-blur-sm">
                    <p className="text-[12px] font-semibold text-amber-400 mb-1.5">Confirm action</p>
                    <p className="text-[12px] text-text-secondary mb-3">I&apos;m about to:</p>
                    <ul className="text-[12px] text-text-secondary space-y-1 mb-3 list-disc pl-5">
                      {pendingConfirmation.toolCalls.map((t, i) => (
                        <li key={i} className="font-mono">{t.id}{t.params && Object.keys(t.params).length > 0 ? ` — ${JSON.stringify(t.params)}` : ""}</li>
                      ))}
                    </ul>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void runConfirmed()}
                        disabled={confirming}
                        className="rounded-full bg-brand-action px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-action/90 transition-colors disabled:opacity-50"
                      >
                        {confirming ? "Working…" : "Confirm"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelConfirmation}
                        className="rounded-full border border-border-subtle px-3.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
              </div>
            </div>

            {/* Input area */}
            <footer className="shrink-0 border-t border-border-subtle bg-surface-primary px-4 py-3">
              <div className={`mx-auto ${aiMode === "full" ? "max-w-[800px]" : "w-full"}`}>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && canSend) handleSend();
                  }}
                  disabled={blogGenLocksThisView}
                  placeholder={
                    blogGenLocksThisView
                      ? "Wait for blog generation to finish…"
                      : page
                        ? `Ask about ${page}...`
                        : "Ask AI anything about this project..."
                  }
                  className="h-10 flex-1 min-w-0 rounded-[10px] border border-border-subtle bg-surface-elevated px-3.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand-action/50 focus:ring-2 focus:ring-brand-action/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!canSend}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-primary text-brand-on-primary disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  <SendIcon className="h-4 w-4" />
                </button>
              </div>
              {blogGenLocksThisView && (
                <p className="mt-2 text-[11px] text-amber-200/90">
                  This chat is paused until the blog finishes. Use{" "}
                  <span className="font-semibold">New chat</span>{" "}
                  {aiMode === "full" ? "in the sidebar" : "above"} to start a separate conversation.
                </p>
              )}
              {!page && (
                <p className="mt-2 text-center text-[11px] text-text-tertiary">
                  Navigate to Keywords, Competitors, or Audit for context-aware suggestions
                </p>
              )}
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

// ── SVG icon components ──

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function NewChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.8 15.9 9 18.8l-.8-2.9a4.5 4.5 0 0 0-3.1-3.1L2.3 12l2.8-.8a4.5 4.5 0 0 0 3.1-3.1L9 5.3l.8 2.8a4.5 4.5 0 0 0 3.1 3.1l2.8.8-2.8.8a4.5 4.5 0 0 0-3.1 3.1Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 2v4M21 4h-4M19 18v4M21 20h-4" />
    </svg>
  );
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h6m0 0v6m0-6-7 7M9 21H3m0 0v-6m0 6 7-7" />
    </svg>
  );
}

function CollapseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V3H3m6 0L3 9m12 6v6h6m-6 0 6-6" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  );
}
