"use client";

import { Spinner } from "@/components/common/loaders/Spinner";

/** "Ask AI" pill — opinionated micro-button that's not generic enough for the common library. */
export function AiFillLabelButton({
  busy,
  disabled,
  onClick,
  hasAiCredits = true,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  hasAiCredits?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy || !hasAiCredits}
      title={!hasAiCredits ? "You've exhausted your AI credits. Upgrade to get more." : "Fill with AI using company, domain, and description"}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-action/40 bg-brand-action/12 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-brand-action transition-all duration-(--duration-fast) ease-out hover:border-brand-action/65 hover:bg-brand-action/20 disabled:pointer-events-none disabled:opacity-40"
    >
      {busy ? (
        <Spinner size={12} className="text-brand-action" />
      ) : (
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="currentColor"
          fillOpacity={0.22}
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 2.25l1.92 7.05L20.75 12l-6.83 2.7L12 21.75l-1.92-7.05L3.25 12l6.83-2.7L12 2.25z" />
        </svg>
      )}
      <span style={{ fontFamily: "CohereMono, monospace" }}>Ask AI</span>
    </button>
  );
}
