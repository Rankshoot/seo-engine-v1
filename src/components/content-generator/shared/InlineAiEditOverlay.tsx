"use client";

/**
 * InlineAiEditOverlay + useInlineAiEdit hook — shared across all content
 * previewers (blog, ebook, whitepaper, LinkedIn).
 *
 * Renders a floating "✦ Edit with AI" button whenever the user selects text
 * inside a TipTap editor container that is in edit mode.
 */

import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  extractInlineMarkdownLinks,
  type BlogRewriteSelectionSnapshot,
} from "@/lib/blog-editor-rewrite-selection";
import { rangeSelectionToMarkdown, rangeSelectionHtmlFragment } from "@/lib/editor-selection-markdown";

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Merge all client rects from a Range into a single bounding rect. */
function rangeViewportRect(range: Range): DOMRect | null {
  const rects = range.getClientRects();
  if (!rects.length) return null;
  let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.width === 0 && r.height === 0) continue;
    minL = Math.min(minL, r.left);
    minT = Math.min(minT, r.top);
    maxR = Math.max(maxR, r.right);
    maxB = Math.max(maxB, r.bottom);
  }
  if (minL === Infinity) return null;
  return new DOMRect(minL, minT, maxR - minL, maxB - minT);
}

/* ── Component ──────────────────────────────────────────────────────────── */

export interface InlineAiEditOverlayProps {
  /** Whether the editor is in edit mode — hides the button when false. */
  active: boolean;
  /** Refs whose DOM subtrees are considered "inside the editor". */
  getRoots: () => Array<HTMLElement | null>;
  /** Called when the user clicks the button; receives the captured selection. */
  onOpen: (payload: { snapshot: BlogRewriteSelectionSnapshot; range: Range }) => void;
}

export function InlineAiEditOverlay({
  active,
  getRoots,
  onOpen,
}: InlineAiEditOverlayProps) {
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const tick = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    if (!active) { btn.style.display = "none"; return; }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { btn.style.display = "none"; return; }

    const roots = getRoots().filter(Boolean) as HTMLElement[];
    const node: Node | null = sel.anchorNode;
    if (!node) { btn.style.display = "none"; return; }

    const walk =
      node.nodeType === Node.TEXT_NODE
        ? (node.parentElement as HTMLElement | null)
        : (node as HTMLElement);

    if (!walk || !roots.some(r => r.contains(walk))) { btn.style.display = "none"; return; }
    if (!sel.toString().trim()) { btn.style.display = "none"; return; }

    const rect = rangeViewportRect(sel.getRangeAt(0));
    if (!rect) { btn.style.display = "none"; return; }

    btn.style.display = "block";
    btn.style.position = "fixed";
    // Place slightly below the selection
    btn.style.top = `${rect.bottom + 8}px`;
    // Clamp left so it doesn't spill off-screen
    btn.style.left = `${Math.min(rect.left, window.innerWidth - 160)}px`;
    btn.style.zIndex = "200";
  }, [active, getRoots]);

  useEffect(() => {
    if (!active) {
      const btn = btnRef.current;
      if (btn) btn.style.display = "none";
      return;
    }
    const schedule = () => requestAnimationFrame(tick);
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("keyup", schedule);
    document.addEventListener("mouseup", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    return () => {
      document.removeEventListener("selectionchange", schedule);
      document.removeEventListener("keyup", schedule);
      document.removeEventListener("mouseup", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [active, tick]);

  if (!active) return null;

  return (
    <button
      ref={btnRef}
      type="button"
      style={{
        display: "none",
        background: "var(--text-primary)",
        color: "var(--surface-primary)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        letterSpacing: "0.01em",
        borderRadius: "999px",
        padding: "6px 14px",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        userSelect: "none",
        transition: "opacity 0.1s ease",
        pointerEvents: "auto",
      }}
      onMouseDown={e => {
        e.preventDefault();
        const sel = window.getSelection();
        if (!sel?.rangeCount || sel.isCollapsed) return;

        const roots = getRoots().filter(Boolean) as HTMLElement[];
        const node: Node | null = sel.anchorNode;
        if (!node) return;
        const walk =
          node.nodeType === Node.TEXT_NODE
            ? (node.parentElement as HTMLElement | null)
            : (node as HTMLElement);
        if (!walk || !roots.some(r => r.contains(walk))) return;

        const range = sel.getRangeAt(0).cloneRange();
        const asMd = rangeSelectionToMarkdown(range);
        const plainText = sel.toString();
        const markdown = asMd.trim() ? asMd : plainText;
        if (!markdown.trim()) return;

        const htmlFragment = rangeSelectionHtmlFragment(range);
        const links = extractInlineMarkdownLinks(markdown);
        const snapshot: BlogRewriteSelectionSnapshot = {
          markdown,
          plainText,
          htmlFragment: htmlFragment || undefined,
          links,
        };
        onOpen({ snapshot, range });
      }}
    >
      ✦ Edit with AI
    </button>
  );
}

/* ── Hook ───────────────────────────────────────────────────────────────── */

/**
 * Encapsulates the ai-rewriter open/close state + selection snapshot.
 * Usage:
 *   const { aiEdit, openAiEdit, closeAiEdit, snapshotRef } = useInlineAiEdit();
 */
export interface AiEditState {
  open: boolean;
  snapshot: BlogRewriteSelectionSnapshot | null;
}

export function useInlineAiEdit() {
  const [aiEdit, setAiEdit] = [
    useRef<AiEditState>({ open: false, snapshot: null }),
    useRef<(s: AiEditState) => void>(() => {}),
  ];

  // Simple reactive wrapper using a useState under the hood via a tiny store
  const stateRef = useRef<AiEditState>({ open: false, snapshot: null });
  const forceRef = useRef<() => void>(() => {});

  // We need React state for reactivity, so return a simple pair:
  return { stateRef, forceRef };
}
