"use client";

import { cn } from "@/lib/cn";
import { BRAND } from "@/constants/brand";

export type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeMap: Record<LogoSize, { mark: string; text: string; gap: string }> = {
  xs: { mark: "w-[28px] h-[28px]", text: "text-[14px]", gap: "gap-2" },
  sm: { mark: "w-[32px] h-[32px]", text: "text-[15px]", gap: "gap-2" },
  md: { mark: "w-[40px] h-[40px]", text: "text-[18px]", gap: "gap-" },
  lg: { mark: "w-[46px] h-[46px]", text: "text-[20px]", gap: "gap-" },
  xl: { mark: "w-[56px] h-[56px]", text: "text-[24px]", gap: "gap-" },
};

interface LogoProps {
  /** Hide the wordmark and only render the glyph. */
  markOnly?: boolean;
  /** Size token controlling glyph + text. */
  size?: LogoSize;
  /** Apply the Rankshoot gradient to the wordmark. */
  gradient?: boolean;
  className?: string;
}

/**
 * Rankshoot logo. Renders the logo-mark PNG and a text-based wordmark.
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
          "relative inline-flex items-center justify-center shrink-0",
          dim.mark,
        )}
        aria-hidden
      >
        <img
          src="/logo.png"
          alt="Rankshoot Symbol"
          className="w-full h-full  object-contain select-none"
        />
      </span>
      {!markOnly && (
        <span
          className={cn(
            "flex items-center tracking-wider leading-none uppercase whitespace-nowrap",
            dim.text,
          )}
        >
          {/* RANK in bold brand-violet */}
          <span className={cn("font-extrabold", gradient ? "gradient-text" : "text-brand-violet")}>
            RANK
          </span>
          {/* SHOOT in normal text-primary */}
          <span className={cn("font-normal ml-[0.02em]", gradient ? "gradient-text" : "text-text-primary")}>
            SHOOT
          </span>
        </span>
      )}
    </span>
  );
}
