"use client";

import type { ReactNode } from "react";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { cn } from "@/lib/cn";
import { PageTitle, PageSubtitle } from "@/components/common/typography/Typography";

/**
 * PageShell — standardized page-level layout used across every project page.
 *
 *   <PageShell title="..." subtitle="..." backHref="..." actions={...}>
 *     {filters}
 *     {content}
 *   </PageShell>
 *
 * Replaces ad-hoc inline headers and the audit-only `CHPageShell`.
 */
export interface PageShellProps {
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  /** Slim variant for nested pages — smaller title, no border under header. */
  variant?: "default" | "compact";
  children: ReactNode;
  className?: string;
}

export function PageShell({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  actions,
  variant = "default",
  children,
  className,
}: PageShellProps) {
  return (
    <div className={cn("space-y-8 pb-20", className)}>
      <ShellHeader
        title={title}
        subtitle={subtitle}
        backHref={backHref}
        backLabel={backLabel}
        actions={actions}
        variant={variant}
      />
      {children}
    </div>
  );
}

function ShellHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  actions,
  variant = "default",
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  variant?: "default" | "compact";
  className?: string;
}) {
  return (
    <header
      className={cn(
        "pt-6 pb-6",
        variant === "default" && "border-b border-border-subtle",
        className,
      )}
    >
      {backHref ? (
        <ProjectNavLink
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-tertiary hover:text-text-primary transition-colors mb-4"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
          </svg>
          {backLabel}
        </ProjectNavLink>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {variant === "compact" ? (
            <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">
              {title}
            </h1>
          ) : (
            <PageTitle>{title}</PageTitle>
          )}
          {subtitle ? <PageSubtitle>{subtitle}</PageSubtitle> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

/** Section wrapper — groups related content with consistent spacing & label. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-[16px] font-semibold tracking-tight text-text-primary">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-[12.5px] text-text-tertiary leading-relaxed max-w-[600px]">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

/** Toolbar — sticky filter / action bar used above tables and lists. */
export function Toolbar({
  leading,
  trailing,
  className,
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface-elevated px-4 py-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">{leading}</div>
      {trailing ? (
        <div className="flex items-center gap-2 shrink-0">{trailing}</div>
      ) : null}
    </div>
  );
}
