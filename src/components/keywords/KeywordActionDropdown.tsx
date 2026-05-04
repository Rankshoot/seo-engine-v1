"use client";

import { useEffect, useRef, useState } from "react";
import type { KeywordStatus } from "@/lib/types";

const STATUS_LABEL: Record<KeywordStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const TRIGGER_BASE =
  "inline-flex min-w-[7.5rem] items-center justify-between gap-2 rounded-[8px] border px-2.5 py-1.5 text-[11px] font-bold capitalize outline-none transition-colors focus-visible:ring-1 focus-visible:ring-brand-action/40 disabled:opacity-50";

const STATUS_TRIGGER: Record<KeywordStatus, string> = {
  approved: "border-brand-action/30 bg-brand-action/10 text-brand-action",
  rejected: "border-brand-coral/30 bg-brand-coral/10 text-brand-coral",
  pending: "border-border-subtle bg-surface-secondary text-text-tertiary",
};

type Props = {
  status: KeywordStatus;
  busy?: boolean;
  onChange: (next: KeywordStatus) => void;
};

export function KeywordActionDropdown({ status, busy, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const itemCls =
    "block w-full text-left px-3 py-2 text-[13px] text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-150 first:rounded-t-[8px] last:rounded-b-[8px]";

  return (
    <div className="relative inline-flex justify-center" ref={root} data-keyword-action>
      <button
        type="button"
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
        className={`${TRIGGER_BASE} ${STATUS_TRIGGER[status]}`}
      >
        {STATUS_LABEL[status]}
        <svg className="h-3.5 w-3.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      <ul
        role="listbox"
        className={`absolute right-0 top-full z-50 mt-1 min-w-[10rem] origin-top-right rounded-[8px] border border-border-subtle bg-surface-elevated py-1 shadow-lg transition-[opacity,transform] duration-150 ${
          open ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        }`}
      >
        {(["pending", "approved", "rejected"] as const).map(s => (
          <li key={s} role="option" aria-selected={s === status}>
            <button
              type="button"
              className={`${itemCls} ${s === status ? "bg-surface-hover/80 text-text-primary" : ""}`}
              onClick={e => {
                e.stopPropagation();
                setOpen(false);
                if (s !== status) onChange(s);
              }}
            >
              {STATUS_LABEL[s]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
