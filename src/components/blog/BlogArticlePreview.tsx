"use client";

import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Blog, BlogContentData } from "@/lib/types";
import {
  internalSetForBlog,
  stripHeroHeading,
  buildMarkdownComponents,
  markdownUrlTransform,
  type ImageGenOptions,
} from "./BlogMarkdownComponents";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import { prepareForRender, type ContentValidation } from "@/lib/content-validation";

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
  onRegenerate,
}: {
  blog: Blog;
  ownSiteHost: string | null;
  imageGenOptions?: ImageGenOptions;
  onRegenerate?: () => void;
} & ArticleMetaSchedulingProps) {
  // Render guard: never dump a raw JSON envelope. Recover leaked-envelope
  // content transparently; fall back gracefully when it can't be salvaged.
  const prep = useMemo(() => prepareForRender(blog.content ?? "", { type: "blog" }), [blog.content]);
  const effectiveBlog = useMemo(
    () => (prep.recovered ? { ...blog, content: prep.content } : blog),
    [blog, prep.recovered, prep.content],
  );
  const internalSet = useMemo(() => internalSetForBlog(effectiveBlog), [effectiveBlog]);
  const { heroTitle, body } = useMemo(() => stripHeroHeading(effectiveBlog), [effectiveBlog]);
  const coverImageUrl = (blog.content_data as BlogContentData | undefined)?.cover_image_url;
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
      {prep.ok ? (
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
        {coverImageUrl && (
          <div className="mb-10 rounded-2xl overflow-hidden aspect-[16/9] bg-surface-secondary border border-border-subtle shadow-sm">
            <img
              src={coverImageUrl}
              alt={blog.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
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
      ) : (
        <BrokenDraftNotice blog={blog} validation={prep.validation} onRegenerate={onRegenerate} />
      )}
    </>
  );
}

// ─── Broken-draft fallback ─────────────────────────────────────────────────
// Shown when stored content can't be safely rendered (e.g. the model leaked its
// raw JSON envelope and it can't be recovered). Never dumps raw JSON; offers a
// Regenerate action when the parent provides one.
function BrokenDraftNotice({
  blog,
  validation,
  onRegenerate,
}: {
  blog: Blog;
  validation: ContentValidation;
  onRegenerate?: () => void;
}) {
  const reasons = validation.issues.filter((i) => i.severity === "fatal");
  return (
    <article className="mx-auto max-w-[860px] px-8 py-16">
      <div className="rounded-2xl border border-status-warning/30 bg-status-warning/5 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-status-warning/30 bg-status-warning/10">
          <svg className="h-6 w-6 text-status-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 className="text-[18px] font-bold text-text-primary">This draft didn&apos;t generate cleanly</h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-text-tertiary">
          The model returned malformed output for{" "}
          <span className="font-semibold text-text-secondary">{blog.title || "this article"}</span>, so we&apos;re not
          rendering it to avoid showing broken content. Regenerate to get a clean version.
        </p>
        {reasons.length > 0 && (
          <ul className="mx-auto mt-4 inline-flex flex-col gap-1 text-left text-[12px] text-text-tertiary">
            {reasons.map((r) => (
              <li key={r.code} className="flex items-center gap-2">
                <span className="h-1 w-1 shrink-0 rounded-full bg-status-warning" />
                {r.message}
              </li>
            ))}
          </ul>
        )}
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-action px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 9a8 8 0 0 1 14.32-3.32M20 4v4h-4M20 15a8 8 0 0 1-14.32 3.32M4 20v-4h4" />
            </svg>
            Regenerate
          </button>
        )}
      </div>
    </article>
  );
}
