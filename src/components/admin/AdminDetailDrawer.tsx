"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function AdminDetailDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        className={cn(
          "relative w-full max-w-md h-full bg-surface-elevated border-l border-border-subtle",
          "shadow-2xl flex flex-col"
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border-subtle">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-text-primary truncate">{title}</h2>
            {subtitle ? (
              <p className="text-[12px] text-text-tertiary mt-0.5 truncate">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 shrink-0 rounded-md border border-border-subtle text-text-tertiary hover:text-text-primary hover:bg-surface-hover text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="py-3 border-b border-border-subtle last:border-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </dt>
      <dd className="mt-1 text-[13px] text-text-primary break-all">{value}</dd>
    </div>
  );
}

export function AdminDetailRows({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl>
      {rows.map((row) => (
        <DetailRow key={row.label} label={row.label} value={row.value} />
      ))}
    </dl>
  );
}
