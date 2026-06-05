"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { blogsApi } from "@/frontend/api/blogs";
import { Dialog, Button, Input, Spinner } from "@/components/common";
import {
  applyPendingReplacementsToMarkdown,
  classifySelectionLinkType,
  enrichSelectionLinks,
  extractDisplayTextFromRewriteResponse,
  extractSafeUrlsFromText,
  parseAIRewriteResponse,
  resolveForcedSingleLinkHrefUpdate,
  type BlogRewriteSelectionLink,
  type BlogRewriteSelectionSnapshot,
  type PendingLinkReplacement,
} from "@/lib/blog-editor-rewrite-selection";

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

type ResolverCandidate = {
  url: string;
  title: string;
  domain: string;
  status: number;
  reason: string;
  credibilityScore: number;
};

type AutoReplacement = {
  linkId: string;
  oldHref: string;
  newHref: string;
  newAnchorText: string;
  type: "internal" | "external";
  reason: string;
  status: number;
};

export interface BlogAiRewriterModalProps {
  open: boolean;
  blogId: string;
  projectDomain: string;
  selection: BlogRewriteSelectionSnapshot | null;
  renderMarkdownSnippet: (markdown: string) => ReactNode;
  onClose: () => void;
  onInsert: (rewritten: string) => void;
}

export function BlogAiRewriterModal({
  open,
  blogId,
  projectDomain,
  selection,
  renderMarkdownSnippet,
  onClose,
  onInsert,
}: BlogAiRewriterModalProps) {
  const [customPrompt, setCustomPrompt] = useState("");
  const [rewriteBase, setRewriteBase] = useState<string | null>(null);
  const [pendingByLinkId, setPendingByLinkId] = useState<Record<string, PendingLinkReplacement>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolvedLinkType, setResolvedLinkType] = useState<"internal" | "external" | null>(null);
  const [resolverSuggestions, setResolverSuggestions] = useState<ResolverCandidate[]>([]);
  const [candidatesByLinkId, setCandidatesByLinkId] = useState<Record<string, ResolverCandidate[]>>({});
  const [autoReplacements, setAutoReplacements] = useState<AutoReplacement[]>([]);

  const markdown = selection?.markdown ?? "";

  useEffect(() => {
    if (!open) return;
    setCustomPrompt("");
    setRewriteBase(null);
    setPendingByLinkId({});
    setError("");
    setLoading(false);
    setResolverSuggestions([]);
    setCandidatesByLinkId({});
    setAutoReplacements([]);
    setResolveLoading(false);
    setResolvedLinkType(null);
  }, [open, markdown]);

  const enrichedLinks = useMemo((): BlogRewriteSelectionLink[] => {
    if (!selection?.links.length) return [];
    return enrichSelectionLinks(selection.links, projectDomain);
  }, [selection, projectDomain]);

  const selectionForApi = useMemo((): BlogRewriteSelectionSnapshot | null => {
    if (!selection) return null;
    return { ...selection, links: enrichedLinks };
  }, [selection, enrichedLinks]);

  const detectedLinkType = useMemo(() => {
    if (enrichedLinks.length !== 1 || !projectDomain.trim()) return null;
    return enrichedLinks[0].type ?? classifySelectionLinkType(enrichedLinks[0].href, projectDomain);
  }, [enrichedLinks, projectDomain]);

  const previewMarkdown = useMemo(() => {
    const base = rewriteBase ?? selection?.markdown ?? "";
    if (!base.trim()) return null;
    return applyPendingReplacementsToMarkdown(base, enrichedLinks, pendingByLinkId);
  }, [rewriteBase, selection?.markdown, enrichedLinks, pendingByLinkId]);

  const hasPreview = Boolean(
    previewMarkdown?.trim() && (rewriteBase?.trim() || Object.keys(pendingByLinkId).length > 0)
  );

  const selectReplacement = useCallback(
    (linkId: string, candidate: { url: string; reason?: string; status?: number; title?: string }) => {
      const link = enrichedLinks.find(l => (l.id ?? l.href) === linkId);
      if (!link) return;
      setPendingByLinkId(prev => ({
        ...prev,
        [linkId]: {
          oldHref: link.href,
          newHref: candidate.url,
          oldAnchorText: link.anchorText,
          newAnchorText: link.anchorText,
          reason: candidate.reason,
          status: candidate.status ?? 200,
        },
      }));
    },
    [enrichedLinks]
  );

  const seedPendingFromResolutions = useCallback(
    (
      rows: Array<{
        linkId: string;
        oldHref: string;
        newHref: string;
        type: "internal" | "external";
        reason?: string;
        status?: number;
      }>
    ) => {
      if (!rows.length) return;
      setPendingByLinkId(prev => {
        const next = { ...prev };
        for (const r of rows) {
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
      setAutoReplacements(
        rows.map(r => {
          const link = enrichedLinks.find(l => l.id === r.linkId);
          return {
            linkId: r.linkId,
            oldHref: r.oldHref,
            newHref: r.newHref,
            newAnchorText: link?.anchorText ?? "",
            type: r.type,
            reason: r.reason ?? "Verified replacement",
            status: r.status ?? 200,
          };
        })
      );
    },
    [enrichedLinks]
  );

  const applyRewriteResponse = useCallback(
    (rawRewritten: string, linkResolutions?: Array<{
      linkId: string;
      oldHref: string;
      newHref: string;
      type: "internal" | "external";
      status: number;
      reason: string;
    }>) => {
      const parsed = parseAIRewriteResponse(rawRewritten);
      const display =
        parsed?.displayText.trim() || extractDisplayTextFromRewriteResponse(rawRewritten).trim();
      if (!display) {
        setError("Could not read the AI response. Try again.");
        return false;
      }
      setRewriteBase(display);
      if (linkResolutions?.length) {
        seedPendingFromResolutions(linkResolutions);
      }
      return true;
    },
    [seedPendingFromResolutions]
  );

  const runRewrite = useCallback(
    async (instruction: string) => {
      if (!selectionForApi) {
        setError("Nothing selected.");
        return;
      }
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
        });
        if (res.trace) console.log("[blog AI rewrite]", res.trace);
        if (res.success && res.rewritten) {
          const ok = applyRewriteResponse(res.rewritten, res.linkResolutions);
          if (!ok) return;
          if (res.linkResolution?.linkType) setResolvedLinkType(res.linkResolution.linkType);
        } else {
          setError(res.error ?? "Rewrite failed.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed.");
      } finally {
        setLoading(false);
      }
    },
    [blogId, selectionForApi, enrichedLinks, pendingByLinkId, applyRewriteResponse]
  );

  const findRelevantWorkingLinks = useCallback(async () => {
    if (!selectionForApi || enrichedLinks.length === 0) {
      setError("Select text with at least one link, then try again.");
      return;
    }
    setResolveLoading(true);
    setError("");
    setResolverSuggestions([]);
    setCandidatesByLinkId({});
    setAutoReplacements([]);
    const resolveInstruction = customPrompt.trim() || "find a relevant replacement link";
    try {
      const res = await blogsApi.resolveRewriteLinkCandidates(blogId, {
        selectedText: selectionForApi.markdown,
        plainText: selectionForApi.plainText,
        htmlFragment: selectionForApi.htmlFragment,
        links: selectionForApi.links,
        instruction: resolveInstruction,
      });
      if (res.trace) console.log("[blog AI rewrite resolve]", res.trace);
      if (res.linkType) setResolvedLinkType(res.linkType);

      if (res.candidatesByLinkId && Object.keys(res.candidatesByLinkId).length > 0) {
        const mapped: Record<string, ResolverCandidate[]> = {};
        for (const [linkId, list] of Object.entries(res.candidatesByLinkId)) {
          mapped[linkId] = list.slice(0, 4).map(c => ({
            url: c.url,
            title: c.title,
            domain: c.domain,
            status: c.status,
            reason: c.reason,
            credibilityScore: c.credibilityScore,
          }));
        }
        setCandidatesByLinkId(mapped);
      }

      if (res.replacements?.length) {
        setAutoReplacements(
          res.replacements.map(r => {
            const link = enrichedLinks.find(l => l.id === r.linkId);
            return {
              linkId: r.linkId,
              oldHref: r.oldHref,
              newHref: r.newHref,
              newAnchorText: r.newAnchorText || link?.anchorText || "",
              type: r.type,
              reason: r.reason,
              status: r.status,
            };
          })
        );
      }

      if (res.success && res.candidates?.length && enrichedLinks.length === 1) {
        setResolverSuggestions(
          res.candidates.slice(0, 6).map(c => ({
            url: c.url,
            title: c.title,
            domain: c.domain,
            status: c.status,
            reason: c.reason,
            credibilityScore: c.credibilityScore,
          }))
        );
      } else if (
        !res.success &&
        !res.replacements?.length &&
        !Object.values(res.candidatesByLinkId ?? {}).some(c => c.length > 0)
      ) {
        setError(res.error ?? "No verified replacement links found.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setResolveLoading(false);
    }
  }, [blogId, selectionForApi, enrichedLinks, customPrompt]);

  const applyAllVerifiedReplacements = useCallback(() => {
    if (!autoReplacements.length) return;
    setPendingByLinkId(prev => {
      const next = { ...prev };
      for (const r of autoReplacements) {
        const link = enrichedLinks.find(l => l.id === r.linkId);
        if (!link) continue;
        next[r.linkId] = {
          oldHref: link.href,
          newHref: r.newHref,
          oldAnchorText: link.anchorText,
          newAnchorText: r.newAnchorText || link.anchorText,
          reason: r.reason,
          status: r.status,
        };
      }
      return next;
    });
    if (!rewriteBase && selection?.markdown) {
      const withLinks = applyPendingReplacementsToMarkdown(
        selection.markdown,
        enrichedLinks,
        Object.fromEntries(
          autoReplacements.map(r => {
            const link = enrichedLinks.find(l => l.id === r.linkId)!;
            return [
              r.linkId,
              {
                oldHref: link.href,
                newHref: r.newHref,
                oldAnchorText: link.anchorText,
                newAnchorText: r.newAnchorText || link.anchorText,
                reason: r.reason,
                status: r.status,
              },
            ];
          })
        )
      );
      setRewriteBase(withLinks);
    }
  }, [autoReplacements, enrichedLinks, rewriteBase, selection?.markdown]);

  const handleInsert = useCallback(() => {
    const final = previewMarkdown?.trim();
    if (!final) return;
    onInsert(final);
    setRewriteBase(null);
    setPendingByLinkId({});
    setAutoReplacements([]);
    setCandidatesByLinkId({});
    setResolverSuggestions([]);
  }, [previewMarkdown, onInsert]);

  const submitCustom = useCallback(() => {
    const t = customPrompt.trim();
    if (!t || loading) return;
    void runRewrite(t);
  }, [customPrompt, loading, runRewrite]);

  const truncatedOriginal =
    markdown.length > 520 ? `${markdown.slice(0, 520).trim()}…` : markdown;

  const forcedUrlPreview = useMemo(() => {
    if (!selectionForApi?.markdown) return null;
    return resolveForcedSingleLinkHrefUpdate(
      selectionForApi.markdown,
      selectionForApi.links,
      customPrompt
    );
  }, [selectionForApi, customPrompt]);

  const promptUrls = useMemo(() => extractSafeUrlsFromText(customPrompt), [customPrompt]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="AI rewriter"
      closeOnBackdrop={!loading && !resolveLoading}
      closeOnEscape={!loading && !resolveLoading}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-border-subtle bg-surface-tertiary/80 px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-400">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
            </svg>
            Rewriting
          </p>
          <div className="max-h-[200px] overflow-y-auto text-[12px] leading-relaxed text-text-secondary [&_p]:my-0 [&_p+_p]:mt-2">
            {renderMarkdownSnippet(truncatedOriginal)}
          </div>
        </div>

        {selectionForApi && enrichedLinks.length > 0 && (
          <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2.5 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/90">
              Detected link{enrichedLinks.length > 1 ? "s" : ""}
            </p>
            <ul className="space-y-2 text-[12px] text-text-secondary">
              {enrichedLinks.map(l => {
                const linkType =
                  l.type ?? classifySelectionLinkType(l.href, projectDomain);
                const linkId = l.id ?? l.href;
                const auto = autoReplacements.find(r => r.linkId === linkId);
                const pending = pendingByLinkId[linkId];
                const perLinkCandidates = candidatesByLinkId[linkId] ?? [];
                const isSelected = (url: string) =>
                  pending?.newHref && pending.newHref === url;

                return (
                  <li
                    key={linkId}
                    className="rounded-md border border-violet-500/10 bg-surface-tertiary/40 px-2.5 py-2 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text-primary">{l.anchorText || "(link)"}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          linkType === "internal"
                            ? "bg-blue-500/15 text-blue-300"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {linkType === "internal" ? "Internal" : "External"}
                      </span>
                    </div>
                    <span className="block break-all font-mono text-[11px] text-text-tertiary">
                      {l.href.length > 80 ? `${l.href.slice(0, 80)}…` : l.href}
                    </span>

                    {auto && !pending && (
                      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 space-y-1">
                        <p className="text-[10px] font-medium text-emerald-300/90">Suggested replacement</p>
                        <span className="block font-mono text-[10px] text-text-tertiary break-all">{auto.newHref}</span>
                        <span className="text-[10px] text-emerald-400/90">{auto.reason}</span>
                        <span className="inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                          HTTP {auto.status}
                        </span>
                        <button
                          type="button"
                          className="mt-1 rounded-full border border-violet-500/40 px-2.5 py-0.5 text-[10px] font-medium text-violet-200 hover:bg-violet-500/15"
                          onClick={() =>
                            selectReplacement(linkId, {
                              url: auto.newHref,
                              reason: auto.reason,
                              status: auto.status,
                            })
                          }
                        >
                          Use this link
                        </button>
                      </div>
                    )}

                    {pending && (
                      <div className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1.5 space-y-1">
                        <p className="text-[10px] font-semibold text-violet-200">Selected replacement</p>
                        <span className="block font-mono text-[10px] text-text-primary break-all">{pending.newHref}</span>
                        {pending.reason && (
                          <span className="text-[10px] text-text-tertiary">{pending.reason}</span>
                        )}
                        {typeof pending.status === "number" && (
                          <span className="inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                            Verified · HTTP {pending.status}
                          </span>
                        )}
                      </div>
                    )}

                    {perLinkCandidates.length > 0 && (
                      <ul className="space-y-1.5 border-t border-violet-500/10 pt-1.5">
                        {perLinkCandidates.map((c, i) => (
                          <li
                            key={`${c.url}-${i}`}
                            className={`rounded-md px-2 py-1.5 ${
                              isSelected(c.url) ? "border border-violet-400/50 bg-violet-500/15" : "bg-surface-tertiary/50"
                            }`}
                          >
                            <span className="text-text-primary line-clamp-2 text-[11px]">{c.title}</span>
                            <span className="font-mono text-[10px] text-text-tertiary break-all">{c.url}</span>
                            <span className="text-[10px] text-text-tertiary">{c.reason}</span>
                            <span className="mr-2 inline-block text-[10px] text-emerald-400/90">HTTP {c.status}</span>
                            <button
                              type="button"
                              className="mt-1 rounded-full border border-violet-500/40 px-2.5 py-0.5 text-[10px] font-medium text-violet-200 hover:bg-violet-500/15"
                              onClick={() =>
                                selectReplacement(linkId, {
                                  url: c.url,
                                  reason: c.reason,
                                  status: c.status,
                                  title: c.title,
                                })
                              }
                            >
                              {isSelected(c.url) ? "Selected" : "Use this link"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-violet-500/15">
              <button
                type="button"
                disabled={resolveLoading || loading}
                onClick={() => void findRelevantWorkingLinks()}
                className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-[11px] font-medium text-violet-200 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
              >
                {resolveLoading
                  ? "Searching…"
                  : enrichedLinks.length > 1
                    ? "Find verified replacements"
                    : detectedLinkType === "external"
                      ? "Find credible external source"
                      : "Find relevant internal link"}
              </button>
              {autoReplacements.length > 0 && (
                <button
                  type="button"
                  disabled={resolveLoading || loading}
                  onClick={applyAllVerifiedReplacements}
                  className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                >
                  Apply all verified replacements
                </button>
              )}
            </div>

            {resolverSuggestions.length > 0 && enrichedLinks.length === 1 && (
              <div className="space-y-1.5 border-t border-violet-500/15 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                  Suggested {resolvedLinkType === "external" ? "external" : "internal"} replacements
                </p>
                <ul className="max-h-40 space-y-1.5 overflow-y-auto text-[11px]">
                  {resolverSuggestions.map((c, i) => {
                    const linkId = enrichedLinks[0]?.id ?? enrichedLinks[0]?.href ?? "";
                    const selected = isSelectedForLink(linkId, c.url, pendingByLinkId);
                    return (
                      <li
                        key={`${c.url}-${i}`}
                        className={`flex flex-col gap-0.5 rounded-md px-2 py-1.5 ${
                          selected ? "border border-violet-400/50 bg-violet-500/15" : "bg-surface-tertiary/60"
                        }`}
                      >
                        <span className="text-text-primary line-clamp-2">{c.title}</span>
                        <span className="text-[10px] text-text-tertiary">{c.domain}</span>
                        <span className="font-mono text-[10px] text-text-tertiary break-all">{c.url}</span>
                        <span className="text-[10px] text-emerald-400/90">{c.reason}</span>
                        <span className="text-[10px] text-emerald-400/80">HTTP {c.status}</span>
                        <button
                          type="button"
                          className="self-start rounded-full border border-violet-500/40 px-2.5 py-0.5 text-[10px] font-medium text-violet-200 hover:bg-violet-500/15"
                          onClick={() =>
                            selectReplacement(linkId, {
                              url: c.url,
                              reason: c.reason,
                              status: c.status,
                            })
                          }
                        >
                          {selected ? "Selected" : "Use this link"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {forcedUrlPreview && (
              <p className="text-[11px] leading-relaxed text-emerald-400/95 border-t border-violet-500/15 pt-2">
                Link will be updated to:{" "}
                <span className="font-mono break-all">{forcedUrlPreview.newHref}</span>
              </p>
            )}
            {promptUrls.length > 1 && enrichedLinks.length === 1 && (
              <p className="text-[10px] text-amber-400/90">
                Multiple URLs in your prompt — only a single explicit destination is applied automatically when one
                link is selected.
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5 10.5 6.75 14.25 10.5 20.25 4.5M3.75 13.5v4.5A2.25 2.25 0 0 0 6 20.25h12A2.25 2.25 0 0 0 20.25 18v-4.5" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              {loading ? (
                <p className="flex items-center gap-2 text-[13px] text-text-tertiary">
                  <Spinner size={12} /> Working…
                </p>
              ) : hasPreview && previewMarkdown ? (
                <div className="text-[13px] leading-relaxed text-text-primary [&_p]:my-0 [&_p+_p]:mt-2">
                  {renderMarkdownSnippet(previewMarkdown)}
                </div>
              ) : (
                <p className="text-[13px] text-text-tertiary">
                  Pick a quick action or describe the change below.
                </p>
              )}
            </div>
          </div>
          {error && <p className="text-[12px] text-rose-400">{error}</p>}
          <Button variant="primary" size="sm" disabled={!hasPreview || loading} onClick={handleInsert}>
            Insert
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              disabled={loading}
              onClick={() => void runRewrite(p.instruction)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-tertiary px-3 py-1.5 text-[11px] font-medium text-text-secondary transition-colors duration-(--duration-fast) ease-out hover:border-border-default hover:text-text-primary disabled:opacity-50"
            >
              <PresetIcon kind={p.icon} />
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
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
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            disabled={loading || !customPrompt.trim()}
            onClick={submitCustom}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white transition-opacity hover:bg-violet-500 disabled:opacity-40"
            aria-label="Send prompt"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function isSelectedForLink(
  linkId: string,
  url: string,
  pending: Record<string, PendingLinkReplacement>
): boolean {
  const p = pending[linkId];
  return Boolean(p?.newHref && p.newHref === url);
}
