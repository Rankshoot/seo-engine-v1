"use client";

import { useEffect, useRef, useState } from "react";
import type { KeywordStatus } from "@/lib/types";

type Props = {
  status: KeywordStatus;
  phrase: string;
  busy?: boolean;
  onExplore: () => void;
  onApproveCalendar: () => void;
  onReject: () => void;
  onResetPending: () => void;
  onRemove: () => void;
};

export function KeywordRowMenu({
  status,
  phrase,
  busy,
  onExplore,
  onApproveCalendar,
  onReject,
  onResetPending,
  onRemove,
}: Props) {
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
    "block w-full text-left px-3 py-2 text-[13px] text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-150 first:rounded-t-[8px] last:rounded-b-[8px] disabled:opacity-50 disabled:pointer-events-none";

  return (
    <div className="relative flex justify-center" ref={root}>
      <button
        type="button"
        disabled={busy}
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
        className={`flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-subtle bg-surface-secondary text-text-secondary transition-all duration-150 hover:bg-surface-hover hover:text-text-primary ${
          open ? "ring-1 ring-brand-action/30 text-text-primary" : ""
        }`}
        title="Keyword actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="sr-only">Open menu for {phrase}</span>
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>

      <div
        role="menu"
        className={`absolute right-0 top-full z-40 mt-1 min-w-[200px] origin-top-right rounded-[8px] border border-border-subtle bg-surface-elevated py-1 shadow-lg transition-[opacity,transform] duration-150 ${
          open ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        }`}
      >
        <button
          type="button"
          role="menuitem"
          className={itemCls}
          onClick={() => {
            setOpen(false);
            onExplore();
          }}
        >
          Explore keyword
        </button>
        {status !== "approved" ? (
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => {
              setOpen(false);
              onApproveCalendar();
            }}
          >
            Approve for calendar
          </button>
        ) : null}
        {status !== "rejected" ? (
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => {
              setOpen(false);
              onReject();
            }}
          >
            Reject
          </button>
        ) : null}
        {status !== "pending" ? (
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => {
              setOpen(false);
              onResetPending();
            }}
          >
            Mark pending
          </button>
        ) : null}
        <hr className="my-1 border-border-subtle" />
        <button
          type="button"
          role="menuitem"
          className={`${itemCls} text-brand-coral hover:text-brand-coral hover:bg-brand-coral/10`}
          onClick={() => {
            setOpen(false);
            onRemove();
          }}
        >
          Remove from list…
        </button>
      </div>
    </div>
  );
}
