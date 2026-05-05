"use client";

import { useCallback, useEffect, useState } from "react";
import { blogsApi } from "@/frontend/api/blogs";

const PRESETS: { label: string; instruction: string; icon: "scissors" | "sparkle" | "pencil" | "info" }[] = [
  {
    label: "Shorten it",
    instruction: "Make this passage shorter while preserving meaning and key facts. Remove redundancy.",
    icon: "scissors",
  },
  {
    label: "Simplify it",
    instruction: "Simplify the language for a general business audience. Use shorter sentences and plain words.",
    icon: "sparkle",
  },
  {
    label: "More detailed",
    instruction: "Expand with concrete detail, examples, or nuance. Keep the same topic and tone.",
    icon: "pencil",
  },
  {
    label: "More informative",
    instruction: "Make it more informative: add useful context or takeaways readers can use. Stay factual.",
    icon: "info",
  },
];

function PresetIcon({ kind }: { kind: (typeof PRESETS)[number]["icon"] }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (kind === "scissors") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.848 8.25l1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 3.417 1.448l.005.212a2.165 2.165 0 1 1-4.33 0l.005-.212a2.165 2.165 0 0 1 1.448-1.448m6.442 4.852-3.811-2.202m3.811 2.202a2.165 2.165 0 0 0 1.448-1.448l.005-.212a2.165 2.165 0 1 0-4.33 0l.005.212a2.165 2.165 0 0 0 1.448 1.448m0 0 3.811 2.202-3.811-2.202" />
      </svg>
    );
  }
  if (kind === "sparkle") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09Z" />
      </svg>
    );
  }
  if (kind === "pencil") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
      </svg>
    );
  }
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
    </svg>
  );
}

export interface BlogAiRewriterModalProps {
  open: boolean;
  blogId: string;
  selectedText: string;
  onClose: () => void;
  onInsert: (rewritten: string) => void;
}

export function BlogAiRewriterModal({ open, blogId, selectedText, onClose, onInsert }: BlogAiRewriterModalProps) {
  const [customPrompt, setCustomPrompt] = useState("");
  const [rewritten, setRewritten] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setCustomPrompt("");
    setRewritten(null);
    setError("");
    setLoading(false);
  }, [open, selectedText]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const runRewrite = useCallback(
    async (instruction: string) => {
      setError("");
      setLoading(true);
      setRewritten(null);
      try {
        const res = await blogsApi.rewriteSelection(blogId, { selectedText, instruction });
        if (res.trace) console.log("[blog AI rewrite]", res.trace);
        if (res.success && res.rewritten) setRewritten(res.rewritten);
        else setError(res.error ?? "Rewrite failed.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed.");
      } finally {
        setLoading(false);
      }
    },
    [blogId, selectedText]
  );

  const submitCustom = useCallback(() => {
    const t = customPrompt.trim();
    if (!t || loading) return;
    void runRewrite(t);
  }, [customPrompt, loading, runRewrite]);

  if (!open) return null;

  const previewOriginal =
    selectedText.length > 520 ? `${selectedText.slice(0, 520).trim()}…` : selectedText;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI rewriter"
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-surface-primary/85 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative my-4 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-secondary shadow-2xl shadow-black/60"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <h2 className="text-[15px] font-semibold text-text-primary">AI rewriter</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="max-h-[min(70vh,560px)] overflow-y-auto px-5 py-4 space-y-4">
          <div className="rounded-xl border border-border-subtle bg-surface-tertiary/80 px-4 py-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
              </svg>
              Rewriting
            </p>
            <p className="text-[13px] leading-relaxed text-text-secondary whitespace-pre-wrap">{previewOriginal}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5 10.5 6.75 14.25 10.5 20.25 4.5M3.75 13.5v4.5A2.25 2.25 0 0 0 6 20.25h12A2.25 2.25 0 0 0 20.25 18v-4.5" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                {loading ? (
                  <p className="text-[13px] text-text-tertiary">Working…</p>
                ) : rewritten ? (
                  <p className="text-[13px] leading-relaxed text-text-primary whitespace-pre-wrap">{rewritten}</p>
                ) : (
                  <p className="text-[13px] text-text-tertiary">Pick a quick action or describe the change below.</p>
                )}
              </div>
            </div>
            {error && <p className="text-[12px] text-rose-400">{error}</p>}
            <button
              type="button"
              disabled={!rewritten || loading}
              onClick={() => {
                if (rewritten) onInsert(rewritten);
              }}
              className="rounded-full px-4 py-2 text-[12px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--text-primary)", color: "var(--surface-primary)" }}
            >
              Insert
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                disabled={loading}
                onClick={() => void runRewrite(p.instruction)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-tertiary px-3 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:border-border-default hover:text-text-primary disabled:opacity-50"
              >
                <PresetIcon kind={p.icon} />
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitCustom();
                }
              }}
              placeholder="Make it better…"
              disabled={loading}
              className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-primary px-3 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-border-default"
            />
            <button
              type="button"
              disabled={loading || !customPrompt.trim()}
              onClick={submitCustom}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition-opacity disabled:opacity-40"
              aria-label="Send prompt"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
