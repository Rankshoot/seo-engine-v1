"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary for Content History.
 *
 * Without this, an unhandled error anywhere in the page rendered the bare
 * Next.js "This page couldn't load" screen with no detail. This surfaces the
 * actual message (and digest) so failures are diagnosable, and offers a retry
 * that re-runs the segment instead of forcing a full reload.
 */
export default function ContentHistoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[content-history] render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-status-danger/10 text-status-danger">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h2 className="text-[16px] font-semibold text-text-primary">Couldn&apos;t load Content History</h2>
      <p className="mt-2 max-w-md text-[13px] text-text-tertiary leading-relaxed">
        {error.message || "An unexpected error occurred while loading your content."}
      </p>
      {error.digest && (
        <p className="mt-1 text-[11px] text-text-tertiary/60">Ref: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-6 h-9 rounded-full bg-brand-action px-5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
