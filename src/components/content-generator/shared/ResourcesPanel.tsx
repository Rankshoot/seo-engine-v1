"use client";

import { useMemo, useState } from "react";
import type { Blog } from "@/lib/types";
import { reclassifyBlogLinkSidebarLists } from "@/lib/blog-content";

const MONO_LABEL = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

/**
 * External + internal links list used in the right rail of every long-form
 * previewer. Mirrors the look of the blog viewer's link sidebar so the
 * studio feels native — same brand colours, same truncation behaviour,
 * same opens-in-new-tab semantics.
 */
export function ResourcesPanel({
  blog,
  projectDomain,
  className = "px-4 py-4",
  maxExternal = 8,
  maxInternal = 6,
}: {
  blog: Blog;
  projectDomain?: string | null;
  className?: string;
  maxExternal?: number;
  maxInternal?: number;
}) {
  const [showAllExternal, setShowAllExternal] = useState(false);
  const [showAllInternal, setShowAllInternal] = useState(false);

  const { externalLinks, internalLinks } = useMemo(
    () =>
      reclassifyBlogLinkSidebarLists(
        blog.external_links ?? [],
        blog.internal_links ?? [],
        projectDomain ?? "",
      ),
    [blog.external_links, blog.internal_links, projectDomain],
  );

  if (externalLinks.length === 0 && internalLinks.length === 0) {
    return null;
  }

  const displayedExternal = showAllExternal ? externalLinks : externalLinks.slice(0, maxExternal);
  const displayedInternal = showAllInternal ? internalLinks : internalLinks.slice(0, maxInternal);
  const hasMoreExternal = externalLinks.length > maxExternal;
  const hasMoreInternal = internalLinks.length > maxInternal;

  return (
    <div className={className}>
      {externalLinks.length > 0 ? (
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5" style={MONO_LABEL}>
            External sources ({externalLinks.length})
          </p>
          <ul
            className={`space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-tertiary scrollbar-track-transparent pr-1 transition-all duration-300 ease-out ${
              showAllExternal ? "max-h-[160px]" : "max-h-[140px]"
            }`}
          >
            {displayedExternal.map((url, i) => (
              <li key={i} className="transition-opacity duration-200">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] truncate hover:underline text-brand-action"
                  title={url}
                >
                  <ExternalLinkIcon />
                  <span className="truncate">{prettyUrl(url)}</span>
                </a>
              </li>
            ))}
          </ul>
          {hasMoreExternal ? (
            <button
              onClick={() => setShowAllExternal(v => !v)}
              className="mt-2 text-[10px] text-text-tertiary hover:text-brand-action transition-all duration-200 cursor-pointer flex items-center gap-1"
            >
              <span className={`transform transition-transform duration-200 ${showAllExternal ? "rotate-180" : ""}`}>▼</span>
              {showAllExternal ? "Show less" : `+${externalLinks.length - maxExternal} more`}
            </button>
          ) : null}
        </div>
      ) : null}

      {internalLinks.length > 0 ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5" style={MONO_LABEL}>
            Internal links ({internalLinks.length})
          </p>
          <ul
            className={`space-y-0.5 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-tertiary scrollbar-track-transparent pr-1 transition-all duration-300 ease-out ${
              showAllInternal ? "max-h-[140px]" : "max-h-[120px]"
            }`}
          >
            {displayedInternal.map((path, i) => {
              const fullUrl =
                path.startsWith("/") && projectDomain
                  ? `https://${projectDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}${path}`
                  : path;
              return (
                <li key={i} className="transition-opacity duration-200">
                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-[11px] hover:underline text-brand-coral"
                    style={{ fontFamily: "CohereMono, monospace" }}
                    title={fullUrl}
                  >
                    {fullUrl}
                  </a>
                </li>
              );
            })}
          </ul>
          {hasMoreInternal ? (
            <button
              onClick={() => setShowAllInternal(v => !v)}
              className="mt-2 text-[10px] text-text-tertiary hover:text-brand-action transition-all duration-200 cursor-pointer flex items-center gap-1"
            >
              <span className={`transform transition-transform duration-200 ${showAllInternal ? "rotate-180" : ""}`}>▼</span>
              {showAllInternal ? "Show less" : `+${internalLinks.length - maxInternal} more`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="h-3 w-3 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + (u.pathname && u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url;
  }
}
