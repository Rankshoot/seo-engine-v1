"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";
import { BRAND } from "@/constants/brand";

export type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeMap: Record<LogoSize, { px: number; mark: string; text: string; gap: string }> = {
  xs: { px: 28, mark: "w-[28px] h-[28px]", text: "text-[14px]", gap: "gap-2" },
  sm: { px: 32, mark: "w-[32px] h-[32px]", text: "text-[15px]", gap: "gap-2" },
  md: { px: 40, mark: "w-[40px] h-[40px]", text: "text-[18px]", gap: "gap-2" },
  lg: { px: 46, mark: "w-[46px] h-[46px]", text: "text-[20px]", gap: "gap-2.5" },
  xl: { px: 56, mark: "w-[56px] h-[56px]", text: "text-[24px]", gap: "gap-3" },
};

interface LogoProps {
  markOnly?: boolean;
  size?: LogoSize;
  gradient?: boolean;
  className?: string;
  priority?: boolean;
}

export function Logo({
  markOnly = false,
  size = "md",
  gradient = false,
  className,
  priority = false,
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
          "relative inline-block shrink-0 overflow-hidden",
          dim.mark,
        )}
        aria-hidden
      >
        <Image
          src="/logo.png"
          alt=""
          fill
          sizes={`${dim.px * 2}px`}
          className="object-contain select-none"
          priority={priority}
        />
      </span>
      {!markOnly && (
        <span
          className={cn(
            "flex items-center tracking-wider leading-none uppercase whitespace-nowrap",
            dim.text,
          )}
        >
          <span className={cn("font-extrabold", gradient ? "gradient-text" : "text-brand-violet")}>
            RANK
          </span>
          <span className={cn("font-normal ml-[0.02em]", gradient ? "gradient-text" : "text-text-primary")}>
            SHOOT
          </span>
        </span>
      )}
    </span>
  );
}
