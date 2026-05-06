"use client";

import { useState, useEffect, useRef } from "react";
import { ARTICLE_TYPES } from "@/lib/types";

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const BLOG_ARTICLE_TYPES = (ARTICLE_TYPES as readonly string[]).filter((t) => t !== "Repair");

export interface AddCustomKeywordModalProps {
  open: boolean;
  onClose: () => void;
  /** If coming from a grid cell click, the date is pre-filled. Null = use next vacant date. */
  preselectedDate?: string | null;
  onSubmit: (data: {
    keyword: string;
    title: string;
    articleType: string;
    writerNotes: string;
    targetDate?: string;
  }) => Promise<{ success: boolean; error?: string; scheduled_date?: string }>;
  busy?: boolean;
}

export function AddCustomKeywordModal({
  open,
  onClose,
  preselectedDate,
  onSubmit,
  busy = false,
}: AddCustomKeywordModalProps) {
  const [keyword, setKeyword] = useState("");
  const [title, setTitle] = useState("");
  const [articleType, setArticleType] = useState("Blog Post");
  const [writerNotes, setWriterNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const keywordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setKeyword("");
      setTitle("");
      setArticleType("Blog Post");
      setWriterNotes("");
      setError(null);
      setTimeout(() => keywordRef.current?.focus(), 60);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) {
      setError("Keyword is required");
      return;
    }
    setError(null);
    const res = await onSubmit({
      keyword: keyword.trim(),
      title: title.trim(),
      articleType,
      writerNotes: writerNotes.trim(),
      targetDate: preselectedDate ?? undefined,
    });
    if (!res.success) {
      setError(res.error ?? "Something went wrong");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-custom-kw-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-[20px] border border-border-subtle bg-surface-elevated shadow-2xl ring-1 ring-border-subtle/60">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 pt-6 pb-4">
          <div>
            <h3 id="add-custom-kw-title" className="text-[18px] font-semibold text-text-primary">
              Add keyword to calendar
            </h3>
            <p className="mt-0.5 text-[13px] text-text-tertiary">
              {preselectedDate
                ? `Will be scheduled for ${fmtDate(preselectedDate)}`
                : "Will be placed on the next free date automatically"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 rounded-full p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Keyword */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-wider text-text-tertiary" htmlFor="ack-keyword">
              Focus keyword <span className="text-brand-coral">*</span>
            </label>
            <input
              id="ack-keyword"
              ref={keywordRef}
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. best CRM for small business"
              className="w-full rounded-[10px] border border-border-subtle bg-surface-secondary px-4 py-2.5 text-[14px] text-text-primary placeholder:text-text-tertiary focus:border-brand-action focus:outline-none focus:ring-1 focus:ring-brand-action/30 transition-colors"
            />
          </div>

          {/* Blog title (optional) */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-wider text-text-tertiary" htmlFor="ack-title">
              Blog title <span className="text-text-tertiary/50 font-normal normal-case tracking-normal">(optional — defaults to keyword)</span>
            </label>
            <input
              id="ack-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 7 Best CRM Tools for Small Businesses in 2026"
              className="w-full rounded-[10px] border border-border-subtle bg-surface-secondary px-4 py-2.5 text-[14px] text-text-primary placeholder:text-text-tertiary focus:border-brand-action focus:outline-none focus:ring-1 focus:ring-brand-action/30 transition-colors"
            />
          </div>

          {/* Article type */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-wider text-text-tertiary" htmlFor="ack-type">
              Article type
            </label>
            <select
              id="ack-type"
              value={articleType}
              onChange={(e) => setArticleType(e.target.value)}
              className="w-full rounded-[10px] border border-border-subtle bg-surface-secondary px-4 py-2.5 text-[14px] text-text-primary focus:border-brand-action focus:outline-none focus:ring-1 focus:ring-brand-action/30 transition-colors"
            >
              <option value="Blog Post">Blog Post</option>
              {BLOG_ARTICLE_TYPES.filter((t) => t !== "Blog Post" && t !== "Repair").map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Writer notes */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-wider text-text-tertiary" htmlFor="ack-notes">
              Writer notes <span className="text-text-tertiary/50 font-normal normal-case tracking-normal">(brief, tone, extra instructions for the AI)</span>
            </label>
            <textarea
              id="ack-notes"
              value={writerNotes}
              onChange={(e) => setWriterNotes(e.target.value)}
              placeholder="e.g. Target audience: founders. Focus on integrations with Slack and HubSpot. Keep tone conversational."
              rows={3}
              className="w-full resize-none rounded-[10px] border border-border-subtle bg-surface-secondary px-4 py-2.5 text-[14px] text-text-primary placeholder:text-text-tertiary focus:border-brand-action focus:outline-none focus:ring-1 focus:ring-brand-action/30 transition-colors"
            />
          </div>

          {error && (
            <p className="rounded-[8px] border border-brand-coral/20 bg-brand-coral/10 px-3 py-2 text-[13px] text-brand-coral">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-full border border-border-subtle px-5 py-2 text-[14px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !keyword.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-2 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Scheduling…
                </>
              ) : (
                "Add to calendar"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
