"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type WithChildren = { children: ReactNode; className?: string };

export function PageTitle({
  children,
  className,
  as: As = "h1",
  size = "lg",
}: WithChildren & { as?: "h1" | "h2"; size?: "md" | "lg" }) {
  return (
    <As
      className={cn(
        "font-normal text-text-primary font-display leading-none",
        size === "lg"
          ? "text-[32px] sm:text-[40px] md:text-[48px] tracking-[-0.96px]"
          : "text-[28px] sm:text-[36px] tracking-[-0.84px]",
        className,
      )}
    >
      {children}
    </As>
  );
}

export function PageSubtitle({ children, className }: WithChildren) {
  return (
    <p
      className={cn(
        "mt-3 text-[14px] text-text-tertiary leading-relaxed max-w-[640px]",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SectionTitle({
  children,
  className,
  as: As = "h2",
}: WithChildren & { as?: "h2" | "h3" }) {
  return (
    <As
      className={cn(
        "text-[20px] font-semibold tracking-tight text-text-primary",
        className,
      )}
    >
      {children}
    </As>
  );
}

export function CardTitle({
  children,
  className,
  as: As = "h3",
}: WithChildren & { as?: "h3" | "h4" }) {
  return (
    <As
      className={cn(
        "text-[15px] font-semibold tracking-tight text-text-primary",
        className,
      )}
    >
      {children}
    </As>
  );
}

/** Small, all-caps eyebrow label used above sections and inside stat cards. */
export function Eyebrow({ children, className }: WithChildren) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-widest text-text-tertiary",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Body({
  children,
  className,
  ...rest
}: WithChildren & HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-[14px] text-text-secondary leading-relaxed", className)}
      {...rest}
    >
      {children}
    </p>
  );
}

export function Caption({ children, className }: WithChildren) {
  return (
    <p className={cn("text-[12px] text-text-tertiary leading-relaxed", className)}>
      {children}
    </p>
  );
}

export function Muted({
  children,
  className,
  as: As = "span",
}: WithChildren & { as?: "span" | "p" }) {
  return (
    <As className={cn("text-text-tertiary", className)}>{children}</As>
  );
}
