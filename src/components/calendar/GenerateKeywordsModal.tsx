"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { Dialog, Button, Spinner, Textarea } from "@/components/common";
import { qk } from "@/lib/query";
import { keywordsApi } from "@/frontend/api/keywords";
import { calendarApi } from "@/frontend/api/calendar";
import { useAppDispatch } from "@/lib/redux/hooks";
import { calendarRefreshBump } from "@/lib/redux/keyword-workspace-slice";

export type SuggestedContentType = "blog" | "ebook" | "whitepaper" | "linkedin";

export interface TrendingKeywordSuggestion {
  keyword: string;
  rationale: string;
  /** AI's recommended content format for this keyword. */
  recommendedType: SuggestedContentType;
  /** Marketing funnel stage this keyword targets. */
  funnelStage?: "TOFU" | "MOFU" | "BOFU";
}

const FUNNEL_BADGE: Record<"TOFU" | "MOFU" | "BOFU", { label: string; className: string }> = {
  TOFU: { label: "TOFU", className: "border-brand-action/25 bg-brand-action/10 text-brand-action" },
  MOFU: { label: "MOFU", className: "border-brand-violet/25 bg-brand-violet/10 text-brand-violet" },
  BOFU: { label: "BOFU", className: "border-status-success/25 bg-status-success/10 text-status-success" },
};

const CONTENT_TYPE_OPTIONS: { value: SuggestedContentType; label: string }[] = [
  { value: "blog", label: "Blog article" },
  { value: "ebook", label: "Ebook" },
  { value: "whitepaper", label: "Whitepaper" },
  { value: "linkedin", label: "LinkedIn post" },
];

type Phase = "prompt" | "results";
type ItemState = "idle" | "scheduling" | "scheduled" | "error";

export function GenerateKeywordsModal({
  projectId,
  open,
  onClose,
  hasAiCredits,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  hasAiCredits: boolean;
}) {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();

  const [phase, setPhase] = useState<Phase>("prompt");
  const [userPrompt, setUserPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<TrendingKeywordSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  // Per-keyword chosen content type (seeded from the AI's recommendedType).
  const [contentTypes, setContentTypes] = useState<Record<string, SuggestedContentType>>({});
  const [scheduling, setScheduling] = useState(false);

  const generateButtonRef = useRef<HTMLButtonElement>(null);

  // Reset to a clean slate every time the modal is (re)opened.
  useEffect(() => {
    if (!open) return;
    setPhase("prompt");
    setUserPrompt("");
    setGenerating(false);
    setError("");
    setSuggestions([]);
    setSelected(new Set());
    setItemStates({});
    setItemErrors({});
    setContentTypes({});
    setScheduling(false);

    // Focus the generate button to prevent autofocusing the optional textarea
    setTimeout(() => {
      generateButtonRef.current?.focus();
    }, 50);
  }, [open]);

  const runGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await keywordsApi.generateTrending(projectId, { userPrompt: userPrompt.trim() || undefined });
      if (res.success) {
        setSuggestions(res.keywords);
        setSelected(new Set(res.keywords.map(k => k.keyword)));
        setContentTypes(Object.fromEntries(res.keywords.map(k => [k.keyword, k.recommendedType])));
        setItemStates({});
        setItemErrors({});
        setPhase("results");
      } else {
        setError(res.error || "Could not generate keyword ideas. Please try again.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate keyword ideas. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const toggleSelected = (keyword: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  };

  const selectedCount = selected.size;
  const allScheduled = useMemo(
    () => suggestions.length > 0 && suggestions.every(s => itemStates[s.keyword] === "scheduled"),
    [suggestions, itemStates]
  );

  const runSchedule = async () => {
    const toSchedule = suggestions.filter(s => selected.has(s.keyword) && itemStates[s.keyword] !== "scheduled");
    if (!toSchedule.length) return;
    setScheduling(true);

    let succeeded = 0;
    let failed = 0;

    for (const s of toSchedule) {
      setItemStates(prev => ({ ...prev, [s.keyword]: "scheduling" }));
      try {
        const res = await calendarApi.approveAiSuggestion(projectId, {
          keyword: s.keyword,
          source: "ai_keyword_generator",
          page: "calendar",
          contentType: contentTypes[s.keyword] ?? s.recommendedType,
        });
        if (res.success) {
          setItemStates(prev => ({ ...prev, [s.keyword]: "scheduled" }));
          succeeded++;
        } else {
          setItemStates(prev => ({ ...prev, [s.keyword]: "error" }));
          setItemErrors(prev => ({ ...prev, [s.keyword]: res.error || "Failed to schedule" }));
          failed++;
        }
      } catch (e) {
        setItemStates(prev => ({ ...prev, [s.keyword]: "error" }));
        setItemErrors(prev => ({ ...prev, [s.keyword]: e instanceof Error ? e.message : "Failed to schedule" }));
        failed++;
      }
    }

    if (succeeded > 0) {
      // Live-update the already-mounted Content Calendar behind this modal —
      // no page reload, single source of truth via Redux + query invalidation.
      void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
      dispatch(calendarRefreshBump({ projectId }));
    }

    if (failed === 0) {
      toast.success(succeeded === 1 ? "Keyword scheduled to your calendar" : `${succeeded} keywords scheduled to your calendar`);
      window.setTimeout(() => onClose(), 900);
    } else if (succeeded > 0) {
      toast.error(`${succeeded} scheduled, ${failed} failed — see details below`);
    } else {
      toast.error("Could not schedule the selected keywords");
    }

    setScheduling(false);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={!generating && !scheduling}
      closeOnEscape={!generating && !scheduling}
      title="Generate keywords"
      description={
        phase === "prompt"
          ? "The AI will suggest  trending, diversified keyword ideas grounded in your business brief."
          : "Pick the ones worth publishing, then schedule them straight to your calendar."
      }
      footer={
        phase === "prompt" ? (
          <>
            <Button variant="ghost" shape="pill" onClick={onClose} disabled={generating}>
              Cancel
            </Button>
            <Button
              ref={generateButtonRef}
              variant="primary"
              shape="pill"
              onClick={() => void runGenerate()}
              loading={generating}
              disabled={generating || !hasAiCredits}
              title={!hasAiCredits ? "You've exhausted your AI credits. Upgrade to get more." : undefined}
            >
              {generating ? "Thinking…" : "Generate"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" shape="pill" onClick={() => void runGenerate()} disabled={generating || scheduling}>
              {generating ? <Spinner size={14} /> : "Regenerate"}
            </Button>
            <Button
              variant="primary"
              shape="pill"
              onClick={() => void runSchedule()}
              loading={scheduling}
              disabled={scheduling || selectedCount === 0 || allScheduled}
            >
              {allScheduled ? "Scheduled" : scheduling ? "Scheduling…" : "Schedule"}
            </Button>
          </>
        )
      }
    >
      {phase === "prompt" ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text-primary">
              What kind of keywords are you after? <span className="font-normal text-text-tertiary">(optional)</span>
            </label>
            <Textarea
              rows={4}
              value={userPrompt}
              onChange={e => setUserPrompt(e.target.value)}
              placeholder="e.g. Focus on comparison / vs. keywords for mid-market buyers, or low-competition long-tail how-to topics…"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-text-tertiary">
              Leave this blank to let the AI pick freely from your business brief. If you type something, it takes
              priority over the general brief context — the brief only fills in gaps.
            </p>
          </div>
          {error && (
            <p className="rounded-lg border border-status-danger/25 bg-status-danger/8 px-3 py-2 text-[12px] text-status-danger">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {error && (
            <p className="rounded-lg border border-status-danger/25 bg-status-danger/8 px-3 py-2 text-[12px] text-status-danger">
              {error}
            </p>
          )}
          {suggestions.map(s => {
            const state = itemStates[s.keyword] ?? "idle";
            const isSelected = selected.has(s.keyword);
            const chosenType = contentTypes[s.keyword] ?? s.recommendedType;
            return (
              <div
                key={s.keyword}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-all duration-300 ${state === "scheduled"
                  ? "border-status-success/30 bg-status-success/[0.06] opacity-70"
                  : state === "error"
                    ? "border-status-danger/30 bg-status-danger/[0.05]"
                    : isSelected
                      ? "border-brand-action/40 bg-brand-action/[0.05]"
                      : "border-border-subtle bg-surface-elevated"
                  }`}
              >
                <button
                  type="button"
                  onClick={() => toggleSelected(s.keyword)}
                  disabled={state === "scheduling" || state === "scheduled"}
                  aria-label={isSelected ? `Deselect ${s.keyword}` : `Select ${s.keyword}`}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${state === "scheduled"
                    ? "border-status-success bg-status-success text-white"
                    : isSelected
                      ? "border-brand-action bg-brand-action text-white"
                      : "border-border-strong bg-transparent"
                    }`}
                >
                  {(isSelected || state === "scheduled") && (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-text-primary">{s.keyword}</span>
                      {s.funnelStage && (
                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${FUNNEL_BADGE[s.funnelStage].className}`}>
                          {FUNNEL_BADGE[s.funnelStage].label}
                        </span>
                      )}
                      {state === "scheduling" && <Spinner size={12} />}
                      {state === "scheduled" && (
                        <span className="text-[11px] font-semibold text-status-success">Scheduled ✓</span>
                      )}
                    </div>
                    <select
                      value={chosenType}
                      onChange={e =>
                        setContentTypes(prev => ({ ...prev, [s.keyword]: e.target.value as SuggestedContentType }))
                      }
                      disabled={state === "scheduling" || state === "scheduled"}
                      aria-label={`Content type for ${s.keyword}`}
                      className="shrink-0 rounded-full border border-border-subtle bg-surface-primary px-3 py-1 text-[12px] font-medium text-text-primary focus:border-brand-action focus:outline-none disabled:opacity-60"
                    >
                      {CONTENT_TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.value === s.recommendedType ? `✨ ${opt.label}` : opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-text-tertiary">{s.rationale}</p>
                  {state === "error" && itemErrors[s.keyword] && (
                    <p className="mt-1 text-[11px] text-status-danger">{itemErrors[s.keyword]}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
