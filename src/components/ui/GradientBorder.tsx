"use client";

import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * Decorative gradient border using a wrapping div trick. Use on the
 * cards/panels we want to make feel "premium AI". Renders a 1px gradient
 * outline around any rounded child.
 *
 *   <GradientBorder radius="lg">
 *     <YourCard />
 *   </GradientBorder>
 */
export function GradientBorder({
  children,
  className,
  radius = "card",
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  radius?: "md" | "lg" | "card";
  glow?: boolean;
}) {
  const radiusClass = radius === "md" ? "rounded-md" : radius === "lg" ? "rounded-lg" : "rounded-card";
  return (
    <div
      className={cn(
        "relative p-px",
        radiusClass,
        "bg-[linear-gradient(135deg,var(--brand-violet)_0%,var(--brand-violet-soft)_40%,transparent_75%)]",
        glow && "shadow-(--shadow-glow-sm)",
        className,
      )}
    >
      <div className={cn("relative h-full w-full bg-surface-elevated", radiusClass)}>{children}</div>
    </div>
  );
}
