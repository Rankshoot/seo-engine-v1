"use client";

import { useState, useEffect, useRef, useCallback, type RefObject } from "react";
import {
  extractInlineMarkdownLinks,
  type BlogRewriteSelectionSnapshot,
} from "@/lib/blog-editor-rewrite-selection";
import {
  rangeSelectionToMarkdown,
  rangeSelectionHtmlFragment,
} from "@/lib/editor-selection-markdown";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Multi-line selections often expose a zero-size client rect on the Range; merge getClientRects(). */
function rangeSelectionViewportRect(range: Range): DOMRect | null {
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

// ─── BlogImageEditOverlay ─────────────────────────────────────────────────

interface BlogImageEditOverlayProps {
  active: boolean;
  bodyRef: RefObject<HTMLDivElement | null>;
  onUpload: (img: HTMLImageElement) => void;
  onRegenerate: (img: HTMLImageElement) => void;
  onRemove: (img: HTMLImageElement) => void;
  isRegenerating: boolean;
}

export function BlogImageEditOverlay({
  active,
  bodyRef,
  onUpload,
  onRegenerate,
  onRemove,
  isRegenerating,
}: BlogImageEditOverlayProps) {
  const [targetImg, setTargetImg] = useState<HTMLImageElement | null>(null);
  const btnRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    if (!active || !targetImg || !btnRef.current) return;
    const rect = targetImg.getBoundingClientRect();
    btnRef.current.style.top = `${rect.top + 8}px`;
    btnRef.current.style.left = `${rect.right - 8}px`;
  }, [active, targetImg]);

  useEffect(() => {
    if (!active) return;
    const handleBodyClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "IMG" && bodyRef.current?.contains(target)) {
        setTargetImg(target as HTMLImageElement);
      } else if (!btnRef.current?.contains(target)) {
        setTargetImg(null);
      }
    };
    document.addEventListener("click", handleBodyClick);
    return () => document.removeEventListener("click", handleBodyClick);
  }, [active, bodyRef]);

  useEffect(() => {
    if (!targetImg) return;
    const schedule = () => requestAnimationFrame(updatePosition);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [targetImg, updatePosition]);

  if (!active || !targetImg) return null;

  return (
    <div
      ref={btnRef}
      className="fixed z-50 flex gap-1.5 -translate-x-full bg-surface-elevated border border-border-subtle rounded-md shadow-md p-1.5"
    >
      <button
        onClick={() => { onUpload(targetImg); setTargetImg(null); }}
        disabled={isRegenerating}
        className="px-2 py-1 text-[11px] font-medium rounded hover:bg-surface-hover text-text-secondary transition-colors disabled:opacity-50"
      >
        Upload
      </button>
      <button
        onClick={() => onRegenerate(targetImg)}
        disabled={isRegenerating}
        className="px-2 py-1 text-[11px] font-medium rounded hover:bg-surface-hover text-text-secondary transition-colors disabled:opacity-50"
      >
        {isRegenerating ? "Regenerating..." : "Regenerate"}
      </button>
      <button
        onClick={() => { onRemove(targetImg); setTargetImg(null); }}
        disabled={isRegenerating}
        className="px-2 py-1 text-[11px] font-medium rounded hover:bg-surface-hover text-rose-500 transition-colors disabled:opacity-50"
      >
        Remove
      </button>
    </div>
  );
}

// ─── BlogEditAiFixOverlay ─────────────────────────────────────────────────

interface BlogEditAiFixOverlayProps {
  active: boolean;
  getRoots: () => Array<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  onOpen: (payload: { snapshot: BlogRewriteSelectionSnapshot; range: Range }) => void;
}

/**
 * Positions the "Edit with AI" button imperatively so selectionchange does not
 * trigger parent re-renders (which would reset contentEditable / React-managed children).
 */
export function BlogEditAiFixOverlay({ active, getRoots, panelRef: _panelRef, onOpen }: BlogEditAiFixOverlayProps) {
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
    const walk = node.nodeType === Node.TEXT_NODE
      ? (node.parentElement as HTMLElement | null)
      : (node as HTMLElement);
    if (!walk || !roots.some(r => r.contains(walk))) { btn.style.display = "none"; return; }
    if (!sel.toString().trim()) { btn.style.display = "none"; return; }
    const rect = rangeSelectionViewportRect(sel.getRangeAt(0));
    if (!rect) { btn.style.display = "none"; return; }
    btn.style.display = "block";
    btn.style.position = "fixed";
    btn.style.top = `${rect.bottom + 6}px`;
    btn.style.left = `${rect.left}px`;
    btn.style.zIndex = "70";
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
      className="pointer-events-auto rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-lg transition-all"
      style={{
        display: "none",
        background: "var(--text-primary)",
        color: "var(--surface-primary)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        letterSpacing: "0.01em",
      }}
      onMouseDown={e => {
        e.preventDefault();
        const sel = window.getSelection();
        if (!sel?.rangeCount || sel.isCollapsed) return;
        const roots = getRoots().filter(Boolean) as HTMLElement[];
        const node: Node | null = sel.anchorNode;
        if (!node) return;
        const walk = node.nodeType === Node.TEXT_NODE
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
