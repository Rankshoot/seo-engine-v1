"use client";

import type { RefObject } from "react";
import { cn } from "@/lib/cn";

const BTN =
  "inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md border border-border-subtle bg-surface-elevated px-2 text-[12px] font-medium text-text-secondary transition-colors hover:border-border-default hover:text-text-primary disabled:opacity-40";

function execOn(el: HTMLElement | null, command: string, value?: string) {
  if (!el) return;
  el.focus();
  try {
    document.execCommand(command, false, value);
  } catch {
    /* noop — unsupported in some environments */
  }
}

export interface MarkdownFormatToolbarProps {
  /** The contentEditable body (or any HTMLElement) receiving formatting. */
  editorRef: RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * Lightweight formatting bar for the visual markdown editor (contentEditable).
 * Uses `document.execCommand` so Turndown on save still produces clean Markdown.
 */
export function MarkdownFormatToolbar({ editorRef, className }: MarkdownFormatToolbarProps) {
  const el = () => editorRef.current;

  const link = () => {
    const url = typeof window !== "undefined" ? window.prompt("Link URL (https://…)", "https://") : null;
    if (!url || !url.trim()) return;
    execOn(el(), "createLink", url.trim());
  };

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-lg border border-border-subtle bg-surface-secondary px-2 py-1.5",
        className,
      )}
      onMouseDown={e => {
        /* Keep selection inside the editor when pressing toolbar buttons */
        e.preventDefault();
      }}
    >
      <span className="mr-1 pr-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary shrink-0">
        Format
      </span>
      <button type="button" className={BTN} title="Bold" onClick={() => execOn(el(), "bold")}>
        <strong>B</strong>
      </button>
      <button type="button" className={BTN} title="Italic" onClick={() => execOn(el(), "italic")}>
        <em>I</em>
      </button>
      <button type="button" className={BTN} title="Underline" onClick={() => execOn(el(), "underline")}>
        <span className="underline">U</span>
      </button>
      <span className="mx-1 h-5 w-px bg-border-subtle shrink-0" aria-hidden />
      <button type="button" className={BTN} title="Heading 2" onClick={() => execOn(el(), "formatBlock", "h2")}>
        H2
      </button>
      <button type="button" className={BTN} title="Quote" onClick={() => execOn(el(), "formatBlock", "blockquote")}>
        “”
      </button>
      <span className="mx-1 h-5 w-px bg-border-subtle shrink-0" aria-hidden />
      <button type="button" className={BTN} title="Bulleted list" onClick={() => execOn(el(), "insertUnorderedList")}>
        • List
      </button>
      <button type="button" className={BTN} title="Numbered list" onClick={() => execOn(el(), "insertOrderedList")}>
        1.
      </button>
      <span className="mx-1 h-5 w-px bg-border-subtle shrink-0" aria-hidden />
      <button type="button" className={BTN} title="Insert link" onClick={link}>
        Link
      </button>
      <button type="button" className={BTN} title="Remove link" onClick={() => execOn(el(), "unlink")}>
        Unlink
      </button>
      <span className="mx-1 h-5 w-px bg-border-subtle shrink-0" aria-hidden />
      <button type="button" className={BTN} title="Normal paragraph" onClick={() => execOn(el(), "formatBlock", "p")}>
        ¶
      </button>
      <button type="button" className={BTN} title="Clear formatting" onClick={() => execOn(el(), "removeFormat")}>
        Clear
      </button>
    </div>
  );
}
