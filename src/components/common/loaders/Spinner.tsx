"use client";

import { cn } from "@/lib/cn";

export interface SpinnerProps {
  size?: number;
  className?: string;
  "aria-label"?: string;
}

/**
 * Spinner — single CSS spinner used by buttons, dialogs, and inline loaders.
 * `currentColor` so it adapts to surrounding text color.
 */
export function Spinner({ size = 16, className, ...rest }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={rest["aria-label"] ?? "Loading"}
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-current/25 border-t-current",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}

/** Centered spinner block — for in-page async loading. */
export function SpinnerBlock({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-text-tertiary",
        className,
      )}
    >
      <Spinner size={20} />
      {label ? <span className="text-[13px]">{label}</span> : null}
    </div>
  );
}
