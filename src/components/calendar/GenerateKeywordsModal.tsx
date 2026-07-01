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

export interface TrendingKeywordSuggestion {
  keyword: string;
  rationale: string;
  volume: number | null;
  kd: number | null;
  cpc: number | null;
  intent: string | null;
}

type Phase = "prompt" | "results";
type ItemState = "idle" | "scheduling" | "scheduled" | "error";

function fmtVolume(v: number | null): string {
  if (v == null || v <= 0) return "—";
  if (v >= 10000) return `${Math.round(v / 1000)}K/mo`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K/mo`;
  return `${v}/mo`;
}

function kdInfo(kd: number | null): { label: string; className: string } | null {
  if (kd == null) return null;
  if (kd < 30) return { label: "Easy", className: "text-status-success" };
  if (kd < 60) return { label: "Medium", className: "text-status-warning" };
  return { label: "Hard", className: "text-brand-coral" };
}

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
          volume: s.volume ?? undefined,
          kd: s.kd ?? undefined,
          cpc: s.cpc ?? undefined,
          intent: s.intent ?? undefined,
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
          ? "The AI will suggest 5 trending, diversified keyword ideas grounded in your business brief."
          : "Pick the ones worth publishing, then schedule them straight to your calendar."
      }
      footer={
        phase === "prompt" ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={generating}>
              Cancel
            </Button>
            <Button
              ref={generateButtonRef}
              variant="primary"
              onClick={() => void runGenerate()}
              loading={generating}
              disabled={generating || !hasAiCredits}
              title={!hasAiCredits ? "You've exhausted your AI credits. Upgrade to get more." : undefined}
            >
              {generating ? "Thinking…" : "Generate 5 keyword ideas"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setPhase("prompt")} disabled={scheduling}>
              Back
            </Button>
            <Button variant="secondary" onClick={() => void runGenerate()} disabled={generating || scheduling}>
              {generating ? <Spinner size={14} /> : "Regenerate"}
            </Button>
            <Button
              variant="primary"
              onClick={() => void runSchedule()}
              loading={scheduling}
              disabled={scheduling || selectedCount === 0 || allScheduled}
            >
              {allScheduled ? "Scheduled" : scheduling ? "Scheduling…" : `Schedule ${selectedCount || ""} keyword${selectedCount === 1 ? "" : "s"}`}
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
            const kd = kdInfo(s.kd);
            return (
              <div
                key={s.keyword}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-all duration-300 ${
                  state === "scheduled"
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
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    state === "scheduled"
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-text-primary">{s.keyword}</span>
                    {state === "scheduling" && <Spinner size={12} />}
                    {state === "scheduled" && (
                      <span className="text-[11px] font-semibold text-status-success">Scheduled ✓</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-text-tertiary">{s.rationale}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-text-secondary">
                      Vol <span className="font-mono font-medium">{fmtVolume(s.volume)}</span>
                    </span>
                    {kd && (
                      <span className={`font-semibold ${kd.className}`}>KD {s.kd} · {kd.label}</span>
                    )}
                    {s.cpc != null && s.cpc > 0 && (
                      <span className="text-text-secondary">
                        CPC <span className="font-mono font-medium">${s.cpc.toFixed(2)}</span>
                      </span>
                    )}
                    {s.intent && <span className="capitalize text-text-tertiary">{s.intent}</span>}
                  </div>
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
