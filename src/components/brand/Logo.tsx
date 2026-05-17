"use client";

import { cn } from "@/lib/cn";
import { BRAND } from "@/constants/brand";

export type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeMap: Record<LogoSize, { mark: string; text: string; gap: string }> = {
  xs: { mark: "w-6 h-6 text-[11px]", text: "text-[14px]", gap: "gap-2" },
  sm: { mark: "w-7 h-7 text-[12px]", text: "text-[15px]", gap: "gap-2" },
  md: { mark: "w-8 h-8 text-[13px]", text: "text-[18px]", gap: "gap-2.5" },
  lg: { mark: "w-9 h-9 text-[15px]", text: "text-[20px]", gap: "gap-3" },
  xl: { mark: "w-11 h-11 text-[18px]", text: "text-[24px]", gap: "gap-3" },
};

interface LogoProps {
  /** Hide the wordmark and only render the glyph. */
  markOnly?: boolean;
  /** Size token controlling glyph + text. */
  size?: LogoSize;
  /** Apply the Rankit gradient to the wordmark. */
  gradient?: boolean;
  className?: string;
}

/**
 * Rankit wordmark. The glyph is an upward-trending bar pair that doubles as a
 * stylised "R", surrounded by a soft violet glow ring — distinctive enough
 * not to read as the generic lightning bolt the previous brand used.
 */
export function Logo({
  markOnly = false,
  size = "md",
  gradient = false,
  className,
}: LogoProps) {
  const dim = sizeMap[size];
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium tracking-tight font-display",
        dim.gap,
        className,
      )}
      aria-label={BRAND.name}
    >
      <span
        className={cn(
          "relative inline-flex items-center justify-center shrink-0 rounded-[8px]",
          "bg-[radial-gradient(circle_at_30%_25%,var(--brand-violet-soft),var(--brand-violet)_55%,#3a3d99)]",
          "text-white shadow-(--shadow-glow-sm)",
          dim.mark,
        )}
        aria-hidden
      >
        <LogoGlyph />
        <span className="absolute inset-0 rounded-[8px] ring-1 ring-inset ring-white/12" />
      </span>
      {!markOnly && (
        <span
          className={cn(
            "leading-none whitespace-nowrap text-text-primary",
            gradient && "gradient-text",
            dim.text,
          )}
        >
          {BRAND.name}
        </span>
      )}
    </span>
  );
}

function LogoGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-[55%] h-[55%]"
    >
      <path d="M5 19V11" />
      <path d="M11 19V7" />
      <path d="M17 19V13" />
      <path d="M3 5l4 4 4-6 6 5 4-4" opacity="0.95" />
    </svg>
  );
}
