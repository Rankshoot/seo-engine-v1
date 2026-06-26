"use client";

import { useState } from "react";
import { ProjectNavLink } from "@/components/ProjectNavLink";

// ─── Icons ─────────────────────────────────────────────────────────────────

export function SpinIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return <div className={`animate-spin rounded-full border-2 border-current/20 border-t-current ${className}`} />;
}

export function ResearchIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23-.607L5 14.5" />
    </svg>
  );
}

export function ExternalLinkIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

export function LinkIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
    </svg>
  );
}

export function DownloadIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

// ─── Pill ──────────────────────────────────────────────────────────────────

export function Pill({
  color,
  border,
  bg,
  children,
}: {
  color: string;
  border: string;
  bg?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium"
      style={{ color, border: `1px solid ${border}`, background: bg ?? "transparent" }}
    >
      {children}
    </span>
  );
}

// ─── Repair banner ─────────────────────────────────────────────────────────

export function RepairBanner({
  sourceUrl,
  repairNotes,
  projectId,
}: {
  sourceUrl: string;
  repairNotes: string[];
  projectId: string;
}) {
  const [open, setOpen] = useState(repairNotes.length > 0);
  return (
    <div className="rounded-[8px] px-4 py-3 border border-border-subtle bg-surface-secondary">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-surface-tertiary"
            style={{ color: "var(--brand-action)" }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase text-text-tertiary mb-0.5" style={{ fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" }}>
              Repair Draft
            </p>
            <p className="text-[13px] text-text-primary">
              Surgical repair of{" "}
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
                style={{ color: "var(--brand-action)" }}
              >
                {sourceUrl}
              </a>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {repairNotes.length > 0 && (
            <button
              onClick={() => setOpen(v => !v)}
              className="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border-subtle text-text-tertiary hover:text-text-primary transition-colors"
            >
              {open ? "Hide" : "Summary"}
            </button>
          )}
          <ProjectNavLink
            href={`/projects/${projectId}/audit`}
            className="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border-subtle text-text-primary hover:bg-surface-tertiary transition-colors"
          >
            ← Audit
          </ProjectNavLink>
        </div>
      </div>
      {open && repairNotes.length > 0 && (
        <div className="mt-2.5 rounded-[6px] p-3 bg-surface-tertiary">
          <ul className="space-y-1 text-[11px] text-text-secondary">
            {repairNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-2">
                <svg className="mt-0.5 h-3 w-3 shrink-0 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
