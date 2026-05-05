"use client";

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

/** Status changes use the row `<select>`; the kebab menu is retired. */
export function KeywordRowMenu(_props: Props) {
  return null;
}

/*
Previous 3-dot menu (Explore / Approve / Reject / Remove). Kept for reference.

import { useEffect, useRef, useState } from "react";

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
        className={...}
        title="Keyword actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        ...
      </button>
      <div role="menu" className={...}>...</div>
    </div>
  );
}
*/
