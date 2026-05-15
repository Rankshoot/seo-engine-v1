"use client";

import { useCallback, useRef } from "react";
import type { LinkedInContentData } from "@/lib/types";
import { Textarea, Field, Input } from "@/components/common";
import { cn } from "@/lib/cn";

const MONO_LABEL = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

export interface LinkedInDraft {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
}

export function draftFromContentData(data: Partial<LinkedInContentData>): LinkedInDraft {
  return {
    hook: data.hook ?? "",
    body: data.body ?? "",
    cta: data.cta ?? "",
    hashtags: data.hashtags ?? [],
  };
}

const INSERT_BTN =
  "inline-flex h-8 items-center justify-center rounded-md border border-border-subtle bg-surface-elevated px-2.5 text-[11px] font-medium text-text-secondary transition-colors hover:border-border-default hover:text-text-primary";

function PlainTextInsertToolbar({
  value,
  onPatch,
  textareaRef,
  ariaLabel,
}: {
  value: string;
  onPatch: (next: string, caret: number) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  ariaLabel: string;
}) {
  const run = useCallback(
    (fn: (b: string, s: number, e: number) => { next: string; caret: number }) => {
      const el = textareaRef.current;
      const s = el?.selectionStart ?? value.length;
      const e = el?.selectionEnd ?? value.length;
      const { next, caret } = fn(value, s, e);
      onPatch(next, caret);
    },
    [value, onPatch, textareaRef],
  );

  return (
    <div
      className="mb-1.5 flex flex-wrap gap-1 rounded-md border border-border-subtle bg-surface-secondary px-1.5 py-1"
      role="toolbar"
      aria-label={ariaLabel}
      onMouseDown={e => e.preventDefault()}
    >
      <span className="w-full pl-1 text-[9px] font-semibold uppercase tracking-widest text-text-tertiary">
        Insert
      </span>
      <button
        type="button"
        className={INSERT_BTN}
        onClick={() => run((b, s, e) => ({ next: `${b.slice(0, s)}\n\n${b.slice(e)}`, caret: s + 2 }))}
      >
        Paragraph
      </button>
      <button
        type="button"
        className={INSERT_BTN}
        onClick={() => run((b, s, e) => ({ next: `${b.slice(0, s)}• ${b.slice(e)}`, caret: s + 2 }))}
      >
        Bullet
      </button>
      <button
        type="button"
        className={INSERT_BTN}
        onClick={() => run((b, s, e) => ({ next: `${b.slice(0, s)}—${b.slice(e)}`, caret: s + 1 }))}
      >
        Em dash
      </button>
      <button
        type="button"
        className={INSERT_BTN}
        onClick={() => {
          const url = typeof window !== "undefined" ? window.prompt("Paste URL", "https://") : null;
          if (!url?.trim()) return;
          const link = url.trim();
          run((b, s, e) => {
            const sel = b.slice(s, e).trim();
            const ins = sel ? `${sel} (${link})` : link;
            return { next: b.slice(0, s) + ins + b.slice(e), caret: s + ins.length };
          });
        }}
      >
        Link (text)
      </button>
    </div>
  );
}

/**
 * Structured editor for a LinkedIn post.
 *
 * Hook / body / CTA / hashtags stay in separate fields (LinkedIn is plain text).
 * Body and CTA include an insert bar for paragraph breaks, bullets, em dash,
 * and “label (url)” link style — the format that survives a paste into the feed.
 */
export function LinkedInStructuredEditor({
  draft,
  onChange,
  className,
}: {
  draft: LinkedInDraft;
  onChange: (next: LinkedInDraft) => void;
  className?: string;
}) {
  const composedChars = [draft.hook, draft.body, draft.cta, draft.hashtags.join(" ")].filter(Boolean).join("\n\n").length;
  const composedFitsFold = composedChars <= 1300;

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const ctaRef = useRef<HTMLTextAreaElement>(null);

  const update = useCallback(
    (patch: Partial<LinkedInDraft>) => onChange({ ...draft, ...patch }),
    [draft, onChange],
  );

  const setBodyWithCaret = useCallback(
    (nextBody: string, caret: number) => {
      update({ body: nextBody });
      queueMicrotask(() => {
        const el = bodyRef.current;
        if (!el) return;
        el.focus();
        const c = Math.min(caret, nextBody.length);
        el.setSelectionRange(c, c);
      });
    },
    [update],
  );

  const setCtaWithCaret = useCallback(
    (nextCta: string, caret: number) => {
      update({ cta: nextCta });
      queueMicrotask(() => {
        const el = ctaRef.current;
        if (!el) return;
        el.focus();
        const c = Math.min(caret, nextCta.length);
        el.setSelectionRange(c, c);
      });
    },
    [update],
  );

  const onHashtagInput = (raw: string) => {
    const tokens = raw
      .split(/[,\s]+/)
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => (t.startsWith("#") ? t : `#${t}`))
      .slice(0, 8);
    update({ hashtags: tokens });
  };

  return (
    <div className={`mx-auto max-w-[640px] space-y-5 px-4 py-6 ${className ?? ""}`}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5" style={MONO_LABEL}>
          Hook · the line that survives the fold
        </p>
        <Field label={null}>
          <Input
            inputSize="lg"
            value={draft.hook}
            onChange={e => update({ hook: e.target.value })}
            placeholder="≤ 12 words. Counter-intuitive, specific, magnetic."
          />
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary" style={MONO_LABEL}>
            Body
          </p>
          <span
            className="text-[10px] font-mono tabular-nums"
            style={{ color: composedFitsFold ? "var(--text-tertiary)" : "var(--brand-coral)" }}
          >
            {composedChars} / 1,300 chars
          </span>
        </div>
        <PlainTextInsertToolbar
          value={draft.body}
          onPatch={setBodyWithCaret}
          textareaRef={bodyRef}
          ariaLabel="Body formatting inserts"
        />
        <Textarea
          ref={bodyRef}
          rows={10}
          value={draft.body}
          onChange={e => update({ body: e.target.value })}
          placeholder="Short paragraphs. 1–2 sentences each. Generous whitespace."
          className="leading-relaxed"
        />
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5" style={MONO_LABEL}>
          Call to action
        </p>
        <PlainTextInsertToolbar
          value={draft.cta}
          onPatch={setCtaWithCaret}
          textareaRef={ctaRef}
          ariaLabel="Call to action formatting inserts"
        />
        <Textarea
          ref={ctaRef}
          rows={2}
          value={draft.cta}
          onChange={e => update({ cta: e.target.value })}
          placeholder="A real question or a clear ask — drives replies that boost reach."
        />
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5" style={MONO_LABEL}>
          Hashtags · 3–5 ideal
        </p>
        <Field
          label={null}
          description="Space- or comma-separated. We add the # if you forget."
        >
          <Input
            inputSize="lg"
            value={draft.hashtags.join(" ")}
            onChange={e => onHashtagInput(e.target.value)}
            placeholder="#AIcontent #SEOEngine #B2BMarketing"
          />
        </Field>
      </div>
    </div>
  );
}

/** Pack the draft back into a Markdown blob the server understands. */
export function draftToMarkdown(blogTitle: string, draft: LinkedInDraft): string {
  return [
    `# ${blogTitle}`,
    "",
    "## Hook",
    draft.hook,
    "",
    "## Body",
    draft.body,
    "",
    "## Call to Action",
    draft.cta,
    "",
    "## Hashtags",
    draft.hashtags.join(" "),
  ].join("\n");
}
