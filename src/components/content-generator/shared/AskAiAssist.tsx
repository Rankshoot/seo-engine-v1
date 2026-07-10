"use client";

/**
 * Ask-AI form assist — shared across all generator forms (blog / ebook /
 * whitepaper / LinkedIn).
 *
 * Three pieces:
 *  - `useAiFillTracker` — knows which fields the USER typed vs which the AI
 *    filled, so a second "Auto-fill" click never clobbers the user's input.
 *  - `AskAiButton`      — the animated header button with clear copy.
 *  - `TopicSuggestionChips` — pickable topic ideas + reload, shown under the
 *    topic field so the user chooses instead of being overridden.
 */

import { useCallback, useRef, useState } from "react";

/* ── Field ownership tracker ────────────────────────────────────────────── */

export function useAiFillTracker() {
  const aiOwnedRef = useRef<Set<string>>(new Set());
  const [flashFields, setFlashFields] = useState<Set<string>>(new Set());
  const flashTimerRef = useRef<number | null>(null);

  /** Fields whose current value came from the AI (or a replaceable default). */
  const isAiOwned = useCallback((field: string) => aiOwnedRef.current.has(field), []);

  /** Call from a field's onChange — the user takes ownership of the field. */
  const markUserOwned = useCallback((field: string) => {
    aiOwnedRef.current.delete(field);
  }, []);

  /** Empty fields and AI-owned fields may be (re)filled; user text is sacred. */
  const canAutoFill = useCallback((field: string, currentValue: string | string[]) => {
    const isEmpty = Array.isArray(currentValue)
      ? currentValue.length === 0
      : !currentValue.trim();
    return isEmpty || aiOwnedRef.current.has(field);
  }, []);

  /** Mark fields the AI just filled + flash a highlight ring on them. */
  const markAiFilled = useCallback((fields: string[]) => {
    if (!fields.length) return;
    fields.forEach(f => aiOwnedRef.current.add(f));
    setFlashFields(new Set(fields));
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashFields(new Set()), 2200);
  }, []);

  /** Mark default-initialised fields as replaceable without flashing them. */
  const markAutoFillable = useCallback((fields: string[]) => {
    fields.forEach(f => aiOwnedRef.current.add(f));
  }, []);

  /** Extra classes for an input that was just AI-filled (brief glow). */
  const fillFlashClass = useCallback(
    (field: string) =>
      flashFields.has(field)
        ? "ring-2 ring-brand-action/50 border-brand-action/60 transition-all duration-500"
        : "",
    [flashFields],
  );

  return { isAiOwned, markUserOwned, canAutoFill, markAiFilled, markAutoFillable, fillFlashClass };
}

/* ── Ask AI button ──────────────────────────────────────────────────────── */

export function AskAiButton({
  onClick,
  loading,
  disabled,
  disabledReason,
  label = "Auto-fill with AI",
  loadingLabel = "Thinking…",
}: {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
  /** Tooltip shown when disabled (e.g. out of AI credits). */
  disabledReason?: string;
  label?: string;
  loadingLabel?: string;
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      title={
        disabled && disabledReason
          ? disabledReason
          : "Fills only the fields you left empty — anything you typed stays. Uses 1 AI credit."
      }
      className={
        "group relative inline-flex h-11 items-center gap-2 overflow-hidden rounded-full border px-5 text-[14px] font-semibold transition-all duration-200 " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-action/40 " +
        (isDisabled
          ? "cursor-not-allowed border-border-subtle text-text-tertiary opacity-70"
          : "border-brand-action/40 text-text-primary hover:border-brand-action hover:shadow-md hover:shadow-brand-action/15 hover:-translate-y-px active:translate-y-0")
      }
    >
      {/* soft gradient wash while loading */}
      {loading ? (
        <span
          aria-hidden
          className="absolute inset-0 animate-pulse bg-gradient-to-r from-brand-action/10 via-brand-action/20 to-brand-action/10"
        />
      ) : null}
      <span
        aria-hidden
        className={
          "relative text-[15px] leading-none text-brand-action transition-transform duration-300 " +
          (loading ? "animate-spin" : "group-hover:rotate-12 group-hover:scale-110")
        }
        style={loading ? { animationDuration: "1.6s" } : undefined}
      >
        ✦
      </span>
      <span className="relative">{loading ? loadingLabel : label}</span>
      {!isDisabled && !loading ? (
        <span className="relative hidden text-[10px] font-medium uppercase tracking-wider text-text-tertiary sm:inline">
          fills empty fields
        </span>
      ) : null}
    </button>
  );
}

/* ── Topic suggestion chips ─────────────────────────────────────────────── */

export function TopicSuggestionChips({
  suggestions,
  activeTopic,
  onPick,
  onReload,
  loading,
  label = "AI topic ideas",
}: {
  suggestions: string[];
  /** Current topic value — the matching chip renders as selected. */
  activeTopic: string;
  onPick: (topic: string) => void;
  /** Fetch a fresh batch of ideas (costs 1 AI credit). */
  onReload: () => void;
  loading: boolean;
  label?: string;
}) {
  if (!suggestions.length && !loading) return null;
  return (
    <div className="mt-2.5 rounded-xl border border-brand-action/20 bg-brand-action/5 p-3 animate-fade-in">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-action">
          <span aria-hidden>✦</span>
          {label}
        </span>
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          title="Get different ideas (uses 1 AI credit)"
          className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-elevated px-2 py-1 text-[10px] font-semibold text-text-secondary transition-colors hover:border-brand-action/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg
            className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          More ideas
        </button>
      </div>
      {loading && !suggestions.length ? (
        <p className="text-[11px] text-text-tertiary">Finding topic angles for you…</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map(s => {
            const selected = s.trim() === activeTopic.trim();
            return (
              <button
                key={s}
                type="button"
                onClick={() => onPick(s)}
                className={
                  "max-w-full rounded-lg border px-2.5 py-1.5 text-left text-[12px] leading-snug transition-all duration-150 " +
                  (selected
                    ? "border-brand-action bg-brand-action/15 font-semibold text-text-primary"
                    : "border-border-subtle bg-surface-elevated text-text-secondary hover:border-brand-action/50 hover:text-text-primary hover:-translate-y-px")
                }
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-text-tertiary">
        Tap an idea to use it as your topic — your other inputs stay untouched.
      </p>
    </div>
  );
}
