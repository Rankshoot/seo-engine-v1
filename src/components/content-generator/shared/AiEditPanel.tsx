"use client";

/**
 * AiEditPanel — the AI selection-rewrite assistant rendered in the previewer's
 * RIGHT PANEL while in edit mode (replaces the old centered modal, so the user
 * sees the content change side-by-side). Shares the exact same rewrite API and
 * link-safety logic the modal used.
 *
 * Shown with an empty "select some text" state until the user selects text in
 * the editor and clicks the floating "✦ Edit with AI" button.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { blogsApi } from "@/frontend/api/blogs";
import {
  applyPendingReplacementsToMarkdown,
  classifySelectionLinkType,
  enrichSelectionLinks,
  extractDisplayTextFromRewriteResponse,
  parseAIRewriteResponse,
  type BlogRewriteSelectionLink,
  type BlogRewriteSelectionSnapshot,
  type PendingLinkReplacement,
} from "@/lib/blog-editor-rewrite-selection";

/* ── Preset quick actions ───────────────────────────────────────────────── */
const PRESETS = [
  { label: "Shorten", icon: "✂", instruction: "Make this passage shorter while preserving meaning and key facts. Remove redundancy." },
  { label: "Simplify", icon: "◈", instruction: "Simplify the language for a general business audience. Use shorter sentences and plain words." },
  { label: "Expand", icon: "⊕", instruction: "Expand with concrete detail, examples, or nuance. Keep the same topic and tone." },
  { label: "Strengthen", icon: "↑", instruction: "Make it more informative and impactful: add useful context or takeaways readers can use. Stay factual." },
] as const;

function Spin() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2"
      style={{ borderColor: "currentColor", borderTopColor: "transparent" }}
    />
  );
}

/* ── Props ─────────────────────────────────────────────────────────────── */
export interface AiEditPanelProps {
  blogId: string;
  projectDomain: string;
  /** Captured selection — `null` renders the "select text" empty state. */
  selection: BlogRewriteSelectionSnapshot | null;
  renderMarkdownSnippet: (markdown: string) => ReactNode;
  /** Insert the rewritten markdown back into the editor. */
  onInsert: (rewritten: string) => void;
  /** Clear the current selection / rewrite state. */
  onDiscard: () => void;
  contentType?: string;
  contentPart?: string;
  surroundingContext?: string;
}

export function AiEditPanel({
  blogId,
  projectDomain,
  selection,
  renderMarkdownSnippet,
  onInsert,
  onDiscard,
  contentType,
  contentPart,
  surroundingContext,
}: AiEditPanelProps) {
  const [customPrompt, setCustomPrompt] = useState("");
  const [rewriteBase, setRewriteBase] = useState<string | null>(null);
  const [pendingByLinkId, setPendingByLinkId] = useState<Record<string, PendingLinkReplacement>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const markdown = selection?.markdown ?? "";

  /* Reset whenever a new selection is captured */
  useEffect(() => {
    setCustomPrompt("");
    setRewriteBase(null);
    setPendingByLinkId({});
    setError("");
    setLoading(false);
    if (markdown) setTimeout(() => inputRef.current?.focus(), 60);
  }, [markdown]);

  const enrichedLinks = useMemo((): BlogRewriteSelectionLink[] => {
    if (!selection?.links.length) return [];
    return enrichSelectionLinks(selection.links, projectDomain);
  }, [selection, projectDomain]);

  const selectionForApi = useMemo((): BlogRewriteSelectionSnapshot | null => {
    if (!selection) return null;
    return { ...selection, links: enrichedLinks };
  }, [selection, enrichedLinks]);

  const previewMarkdown = useMemo(() => {
    // When AI has rewritten the text, trust its output directly —
    // the model already updated both anchor text and href in the markdown.
    if (rewriteBase?.trim()) return rewriteBase;
    const base = selection?.markdown ?? "";
    if (!base.trim() || !Object.keys(pendingByLinkId).length) return null;
    return applyPendingReplacementsToMarkdown(base, enrichedLinks, pendingByLinkId);
  }, [rewriteBase, selection?.markdown, enrichedLinks, pendingByLinkId]);

  const hasPreview = Boolean(previewMarkdown?.trim() && rewriteBase?.trim());

  const primaryLink = enrichedLinks[0] ?? null;
  const linkType = primaryLink
    ? (primaryLink.type ?? classifySelectionLinkType(primaryLink.href, projectDomain))
    : null;

  /* Extract boundary tokens from the raw markdown (first/last non-whitespace chunk) */
  function extractBoundaryTokens(text: string): { first: string; last: string } | null {
    const chunks = text.match(/\S+/g);
    if (!chunks || chunks.length === 0) return null;
    return { first: chunks[0]!, last: chunks[chunks.length - 1]! };
  }

  /* Minimal boundary fix — only prepend/append if the rewritten text diverges */
  function enforceBoundaries(original: string, rewritten: string): string {
    const bounds = extractBoundaryTokens(original);
    if (!bounds) return rewritten;
    const rwChunks = rewritten.match(/\S+/g);
    if (!rwChunks || rwChunks.length === 0) return rewritten;
    let result = rewritten;
    if (!rewritten.trimStart().startsWith(bounds.first)) {
      result = bounds.first + " " + result.trimStart();
    }
    if (!result.trimEnd().endsWith(bounds.last)) {
      result = result.trimEnd() + " " + bounds.last;
    }
    return result;
  }

  /* ── Core rewrite call ─────────────────────────────────────────────── */
  const runRewrite = useCallback(
    async (instruction: string) => {
      if (!selectionForApi) { setError("Nothing selected."); return; }
      setError("");
      setLoading(true);
      setRewriteBase(null);

      const prefReplacements = Object.entries(pendingByLinkId).map(([linkId, p]) => ({
        linkId,
        newHref: p.newHref,
      }));

      try {
        const res = await blogsApi.rewriteSelection(blogId, {
          selectedText: selectionForApi.markdown,
          instruction,
          plainText: selectionForApi.plainText,
          htmlFragment: selectionForApi.htmlFragment,
          links: selectionForApi.links,
          prefValidatedReplacementUrl:
            enrichedLinks.length === 1 ? pendingByLinkId[enrichedLinks[0].id!]?.newHref : undefined,
          prefValidatedReplacements: prefReplacements.length ? prefReplacements : undefined,
          contentType,
          contentPart,
          surroundingContext,
        });

        if (res.success && res.rewritten) {
          const parsed = parseAIRewriteResponse(res.rewritten);
          const raw =
            parsed?.displayText.trim() || extractDisplayTextFromRewriteResponse(res.rewritten).trim();
          if (!raw) { setError("Could not read the AI response. Try again."); return; }
          const display = enforceBoundaries(selectionForApi.markdown, raw);
          setRewriteBase(display);
          if (res.linkResolutions?.length) {
            setPendingByLinkId(prev => {
              const next = { ...prev };
              for (const r of res.linkResolutions!) {
                const link = enrichedLinks.find(l => l.id === r.linkId);
                next[r.linkId] = {
                  oldHref: r.oldHref || link?.href || "",
                  newHref: r.newHref,
                  oldAnchorText: link?.anchorText ?? "",
                  newAnchorText: link?.anchorText ?? "",
                  reason: r.reason,
                  status: r.status ?? 200,
                };
              }
              return next;
            });
          }
        } else {
          setError(res.error ?? "Rewrite failed.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed.");
      } finally {
        setLoading(false);
      }
    },
    [blogId, selectionForApi, enrichedLinks, pendingByLinkId, contentType, contentPart, surroundingContext]
  );

  const handleInsert = useCallback(() => {
    const final = previewMarkdown?.trim();
    if (!final) return;
    onInsert(final);
    setRewriteBase(null);
    setPendingByLinkId({});
  }, [previewMarkdown, onInsert]);

  const submitCustom = useCallback(() => {
    const t = customPrompt.trim();
    if (!t || loading) return;
    void runRewrite(t);
  }, [customPrompt, loading, runRewrite]);

  /* ── Empty state — edit mode, nothing selected yet ─────────────────── */
  if (!selection) {
    return (
      <div data-ai-panel="true" className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-[18px]"
          style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)" }}
        >
          ✦
        </span>
        <p className="text-[13px] font-semibold text-text-primary">AI Edit</p>
        <p className="max-w-[240px] text-[12px] leading-relaxed text-text-tertiary">
          Select any text in the editor, then click the floating{" "}
          <span className="font-medium text-text-secondary">✦ Edit with AI</span> button. Your
          rewrite appears here so you can compare it with the content side by side.
        </p>
      </div>
    );
  }

  return (
    <div data-ai-panel="true" className="flex h-full min-h-0 flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[13px]"
            style={{ background: "var(--surface-secondary)" }}
          >
            ✦
          </span>
          <span className="text-[13px] font-semibold text-text-primary">AI Edit</span>
          {primaryLink && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium"
              style={{
                background: linkType === "internal" ? "rgba(59,130,246,0.12)" : "rgba(251,146,60,0.12)",
                color: linkType === "internal" ? "rgb(147,197,253)" : "rgb(253,186,116)",
                border: `1px solid ${linkType === "internal" ? "rgba(59,130,246,0.25)" : "rgba(251,146,60,0.25)"}`,
              }}
            >
              ⬡ {linkType === "internal" ? "Internal link" : "External link"}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onDiscard}
          disabled={loading}
          title="Clear selection"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary disabled:opacity-40"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Scrollable body ────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-2.5 px-4 pb-3 pt-3.5">
          {/* BEFORE */}
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
                {hasPreview ? "Before" : "Selected"}
              </span>
              {hasPreview && <div className="h-px flex-1" style={{ background: "var(--border-subtle)" }} />}
            </div>
            <div
              className="relative rounded-xl px-3.5 py-3 text-[12px] leading-relaxed"
              style={{
                background: hasPreview ? "transparent" : "var(--surface-secondary)",
                border: "1px solid var(--border-subtle)",
                borderLeft: hasPreview ? "3px solid var(--border-default)" : "1px solid var(--border-subtle)",
                color: hasPreview ? "var(--text-tertiary)" : "var(--text-secondary)",
                opacity: hasPreview ? 0.7 : 1,
                maxHeight: hasPreview ? 140 : 220,
                overflowY: "auto",
              }}
            >
              <div className="whitespace-pre-wrap [&_p]:my-0 [&_p+p]:mt-1.5 [&_strong]:font-semibold [&_em]:italic [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-2">
                {renderMarkdownSnippet(markdown)}
              </div>
            </div>
          </div>

          {/* AFTER */}
          {(loading || hasPreview) && (
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
                  After
                </span>
                <div className="h-px flex-1" style={{ background: "var(--border-subtle)" }} />
                {hasPreview && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                    style={{
                      background: "rgba(34,197,94,0.1)",
                      color: "rgb(134,239,172)",
                      border: "1px solid rgba(34,197,94,0.2)",
                    }}
                  >
                    AI Suggestion
                  </span>
                )}
              </div>
              <div
                className="relative rounded-xl px-3.5 py-3 text-[12px] leading-relaxed"
                style={{
                  background: hasPreview ? "rgba(var(--brand-action-rgb, 59 130 246)/0.05)" : "var(--surface-secondary)",
                  border: `1px solid ${hasPreview ? "rgba(59,130,246,0.18)" : "var(--border-subtle)"}`,
                  borderLeft: hasPreview ? "3px solid rgba(59,130,246,0.5)" : "1px solid var(--border-subtle)",
                  color: "var(--text-secondary)",
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                {loading ? (
                  <div className="flex items-center gap-2.5 py-1 text-text-tertiary">
                    <Spin />
                    <span className="text-[12px]">Rewriting…</span>
                  </div>
                ) : hasPreview && previewMarkdown ? (
                  <div className="[&_p]:my-0 [&_p+p]:mt-1.5 [&_strong]:font-semibold [&_em]:italic [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-2">
                    {renderMarkdownSnippet(previewMarkdown)}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {error && <p className="text-[11px]" style={{ color: "#f87171" }}>{error}</p>}
        </div>

        {/* Quick actions */}
        <div className="px-4 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                disabled={loading}
                onClick={() => void runRewrite(p.instruction)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-secondary px-2.5 py-1.5 text-[11px] font-medium text-text-secondary transition-all hover:border-border-default hover:text-text-primary disabled:opacity-40"
              >
                <span className="text-[12px]">{p.icon}</span>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Link context */}
        {primaryLink && !hasPreview && (
          <div
            className="mx-4 mb-3 rounded-xl px-3 py-2.5 text-[11px]"
            style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)" }}
          >
            <p className="mb-1 font-medium text-text-secondary">{primaryLink.anchorText || "Link"}</p>
            <p className="break-all font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              {primaryLink.href.length > 64 ? `${primaryLink.href.slice(0, 64)}…` : primaryLink.href}
            </p>
            <p className="mt-1.5 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              The AI will preserve or update this link based on your prompt.
            </p>
          </div>
        )}
      </div>

      {/* ── Footer — input + actions ─────────────────────────────────────── */}
      <div className="flex shrink-0 flex-col gap-2.5 px-4 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-default)" }}
        >
          <input
            ref={inputRef}
            type="text"
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); submitCustom(); }
            }}
            placeholder="Describe your change…"
            disabled={loading}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-tertiary disabled:opacity-50"
          />
          <button
            type="button"
            disabled={loading || !customPrompt.trim()}
            onClick={submitCustom}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-all disabled:opacity-30"
            style={{
              background: customPrompt.trim() && !loading ? "var(--text-primary)" : "var(--surface-elevated)",
              color: customPrompt.trim() && !loading ? "var(--surface-primary)" : "var(--text-tertiary)",
            }}
            aria-label="Send"
          >
            {loading ? (
              <Spin />
            ) : (
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onDiscard}
            disabled={loading}
            className="text-[12px] text-text-tertiary transition-colors hover:text-text-secondary disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={!hasPreview || loading}
            onClick={handleInsert}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-semibold transition-all disabled:opacity-30"
            style={{
              background: hasPreview && !loading ? "var(--text-primary)" : "var(--surface-secondary)",
              color: hasPreview && !loading ? "var(--surface-primary)" : "var(--text-tertiary)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {loading ? <><Spin /> Working…</> : "Apply edit"}
          </button>
        </div>
      </div>
    </div>
  );
}
