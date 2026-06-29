"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { DropdownMenu } from "@/components/common/dropdowns/DropdownMenu";
import { cn } from "@/lib/cn";
import type { ExportOption } from "@/lib/content-exports";

const MONO_LABEL = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

export interface ExportMenuProps<T extends string> {
  options: ExportOption<T>[];
  onExport: (format: T) => Promise<void> | void;
  /** Optional copy-to-clipboard shortcuts above the export dropdown. */
  copyActions?: Array<{ label: string; hint: string; getText: () => string }>;
  /** Section title shown above the control. */
  title?: string;
  className?: string;
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-4 w-4 shrink-0 text-text-tertiary", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/**
 * Compact export control for Content Studio sidebars: optional copy shortcuts
 * plus a single dropdown listing all file formats (label, extension, hint).
 */
export function ExportMenu<T extends string>({
  options,
  onExport,
  copyActions,
  title = "Export",
  className,
}: ExportMenuProps<T>) {
  const [busy, setBusy] = useState<T | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleExport = async (format: T) => {
    setBusy(format);
    try {
      await onExport(format);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async (label: string, getText: () => string) => {
    try {
      const text = getText();
      if (!text.trim()) {
        toast.error("Nothing to copy yet.");
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Could not access clipboard.");
    }
  };

  const busyLabel = busy !== null ? options.find(o => o.key === busy)?.label : null;

  return (
    <div className={cn("w-full space-y-2", className)}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary" style={MONO_LABEL}>
        {title}
      </p>

      {copyActions && copyActions.length > 0 ? (
        <div className="space-y-1">
          {copyActions.map(action => {
            const isCopied = copied === action.label;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => void handleCopy(action.label, action.getText)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors",
                  isCopied
                    ? "border border-status-success/40 bg-status-success/10 text-status-success"
                    : "border border-border-subtle bg-surface-tertiary text-text-secondary hover:border-border-default hover:text-text-primary",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate leading-tight">{action.label}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-normal text-text-tertiary">
                    {action.hint}
                  </span>
                </span>
                <span className="shrink-0 text-[9px] font-mono uppercase tracking-widest text-text-tertiary">
                  {isCopied ? "ok" : "copy"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <DropdownMenu
        fillWidth
        closeOnMenuClick
        align="start"
        menuWidth="stretch"
        trigger={
          <button
            type="button"
            disabled={busy !== null}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-tertiary px-3 py-2.5 text-left transition-colors hover:border-border-default hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-text-primary">
                {busy !== null ? "Exporting…" : "Export as file"}
              </span>
              {busy !== null && busyLabel ? (
                <span className="mt-0.5 block truncate text-[10px] text-text-tertiary">{busyLabel}</span>
              ) : (
                <span className="mt-0.5 block text-[10px] text-text-tertiary">
                  {options.length} format{options.length === 1 ? "" : "s"}
                </span>
              )}
            </span>
            <ChevronDown />
          </button>
        }
      >
        <div className="max-h-[min(380px,55vh)] overflow-y-auto py-0.5">
          {options.map(opt => (
            <button
              key={String(opt.key)}
              type="button"
              role="menuitem"
              title={opt.hint}
              disabled={busy === opt.key}
              onClick={() => void handleExport(opt.key)}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
                "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-text-primary">
                  {opt.label}
                </span>
                <span
                  className="shrink-0 pt-0.5 text-[10px] tabular-nums text-text-tertiary"
                  style={MONO_LABEL}
                >
                  {busy === opt.key ? "…" : opt.ext}
                </span>
              </span>
              <span className="line-clamp-2 text-[11px] leading-snug text-text-tertiary">{opt.hint}</span>
            </button>
          ))}
        </div>
      </DropdownMenu>
    </div>
  );
}
