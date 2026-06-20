"use client";

import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Blog } from "@/lib/types";
import {
  internalSetForBlog,
  stripHeroHeading,
  buildMarkdownComponents,
  markdownUrlTransform,
  type ImageGenOptions,
} from "./BlogMarkdownComponents";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";

const MONO = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

// ─── Article meta row ──────────────────────────────────────────────────────

export interface ArticleMetaSchedulingProps {
  scheduledDate?: string | null;
  scheduledDatesSet?: Set<string>;
  onReschedule?: (date: string) => void | Promise<void>;
  onUnschedule?: () => void | Promise<void>;
  schedulingBusy?: boolean;
}

export function ArticleMetaRow({
  blog,
  scheduledDate,
  scheduledDatesSet,
  onReschedule,
  onUnschedule,
  schedulingBusy,
}: { blog: Blog } & ArticleMetaSchedulingProps) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const formattedScheduledDate = scheduledDate
    ? new Date(`${scheduledDate}T00:00:00`).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    : null;

  return (
    <div className="px-6 py-2.5 bg-surface-secondary border-b border-border-subtle">
      <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-3">
        {blog.target_keyword && (
          <span className="text-[11px] text-text-tertiary">
            Target: <span className="font-semibold text-text-secondary">{blog.target_keyword}</span>
          </span>
        )}
        <span className="text-border-subtle opacity-80">·</span>
        <span className="text-[11px] text-text-tertiary">{Math.max(1, Math.ceil(blog.word_count / 200))} min read</span>
        <span className="text-border-subtle opacity-80">·</span>
        <span className="text-[11px] text-text-tertiary">{blog.word_count.toLocaleString()} words</span>

        {/* Scheduled date — shown only when blog is scheduled */}
        {scheduledDate && formattedScheduledDate ? (
          <>
            <span className="text-border-subtle opacity-80">·</span>
            <span className="flex items-center gap-1 text-[11px] font-medium text-brand-action">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
              Scheduled {formattedScheduledDate}
              {onReschedule && (
                <CalendarDatePicker
                  open={datePickerOpen}
                  onOpenChange={setDatePickerOpen}
                  currentDate={scheduledDate}
                  onConfirm={(date) => {
                    setDatePickerOpen(false);
                    void onReschedule(date);
                  }}
                  onUnschedule={onUnschedule ? () => void onUnschedule!() : undefined}
                  saving={schedulingBusy ?? false}
                  scheduledDates={scheduledDatesSet}
                  variant="change"
                  iconOnly
                />
              )}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─── Read-only editorial preview ───────────────────────────────────────────

export function EditorialPreview({
  blog,
  ownSiteHost,
  imageGenOptions,
  scheduledDate,
  scheduledDatesSet,
  onReschedule,
  onUnschedule,
  schedulingBusy,
}: {
  blog: Blog;
  ownSiteHost: string | null;
  imageGenOptions?: ImageGenOptions;
} & ArticleMetaSchedulingProps) {
  const internalSet = useMemo(() => internalSetForBlog(blog), [blog]);
  const { heroTitle, body } = useMemo(() => stripHeroHeading(blog), [blog]);
  const components = useMemo(
    () => buildMarkdownComponents(internalSet, ownSiteHost, imageGenOptions),
    [internalSet, ownSiteHost, imageGenOptions]
  );
  return (
    <>
      <ArticleMetaRow
        blog={blog}
        scheduledDate={scheduledDate}
        scheduledDatesSet={scheduledDatesSet}
        onReschedule={onReschedule}
        onUnschedule={onUnschedule}
        schedulingBusy={schedulingBusy}
      />
      <article className="mx-auto max-w-[860px] px-8 py-12">
        <header className="mb-10 pb-8 border-b border-border-subtle">
          <h1
            className="mb-4 text-text-primary"
            style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.5 }}
          >
            {heroTitle}
          </h1>
          {blog.meta_description && (
            <p className="text-text-tertiary" style={{ fontSize: 17, lineHeight: 1.7 }}>
              {blog.meta_description}
            </p>
          )}
        </header>
        <div className="editorial-body space-y-5 text-text-secondary" style={{ fontSize: 17, lineHeight: 1.78 }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={components}
            urlTransform={markdownUrlTransform}
          >
            {body}
          </ReactMarkdown>
        </div>
        <footer className="mt-14 pt-6 text-[11px] text-text-tertiary border-t border-border-subtle">
          — End of article —
        </footer>
      </article>
    </>
  );
}
