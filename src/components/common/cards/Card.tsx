"use client";

import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CardPadding = "none" | "sm" | "md" | "lg";
export type CardElevation = "flat" | "raised" | "interactive";

const paddingClass: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

const elevationClass: Record<CardElevation, string> = {
  flat: "bg-surface-elevated border border-border-subtle",
  raised:
    "bg-surface-elevated border border-border-subtle shadow-(--shadow-sm)",
  interactive:
    "bg-surface-elevated border border-border-subtle hover:border-border-strong hover:shadow-(--shadow-md) transition-all duration-(--duration-base) ease-out cursor-pointer",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  elevation?: CardElevation;
  as?: "div" | "section" | "article";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = "md", elevation = "flat", className, children, as = "div", ...rest },
  ref,
) {
  const Tag = as as "div";
  return (
    <Tag
      ref={ref as never}
      className={cn(
        "rounded-card",
        paddingClass[padding],
        elevationClass[elevation],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-border-subtle/60",
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-text-primary truncate">
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-1 text-[12.5px] text-text-tertiary leading-relaxed">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
