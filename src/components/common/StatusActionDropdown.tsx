"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type StatusActionItem = {
  key: string;
  label: string;
  disabled?: boolean;
  /** Highlight as the current selection in the menu. */
  selected?: boolean;
  onSelect: () => void;
};

type Props = {
  triggerLabel: string;
  triggerClassName: string;
  busy?: boolean;
  /** Screen reader label for the trigger. */
  ariaLabel?: string;
  items: StatusActionItem[];
  /** Menu alignment relative to the trigger (horizontal). */
  align?: "left" | "right";
  /** Marks the control for keywords table row click guards. */
  keywordActionMarker?: boolean;
};

const GAP = 6;
const VIEWPORT_PAD = 8;
const MENU_MIN_W = 160;

function placeFixedMenu(
  trigger: DOMRect,
  menuWidth: number,
  menuHeight: number,
  align: "left" | "right"
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = align === "right" ? trigger.right - menuWidth : trigger.left;
  left = Math.max(VIEWPORT_PAD, Math.min(left, vw - menuWidth - VIEWPORT_PAD));

  const spaceBelow = vh - trigger.bottom - GAP - VIEWPORT_PAD;
  const spaceAbove = trigger.top - GAP - VIEWPORT_PAD;
  const preferBelow = spaceBelow >= menuHeight || spaceBelow >= spaceAbove;

  let top: number;
  if (preferBelow) {
    top = trigger.bottom + GAP;
    if (top + menuHeight > vh - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - menuHeight);
    }
  } else {
    top = trigger.top - GAP - menuHeight;
    if (top < VIEWPORT_PAD) {
      top = VIEWPORT_PAD;
      if (top + menuHeight > vh - VIEWPORT_PAD) {
        top = Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - menuHeight);
      }
    }
  }

  return { top, left };
}

export function StatusActionDropdown({
  triggerLabel,
  triggerClassName,
  busy,
  ariaLabel,
  items,
  align = "right",
  keywordActionMarker,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [fixedPos, setFixedPos] = useState<{ top: number; left: number } | null>(null);

  const displayPos = fixedPos;

  const reposition = useCallback(() => {
    const tr = triggerRef.current;
    const menu = menuRef.current;
    if (!tr || !open) return;
    const rect = tr.getBoundingClientRect();
    const mw = Math.max(menu?.offsetWidth ?? MENU_MIN_W, MENU_MIN_W);
    const mh = Math.max(menu?.offsetHeight ?? items.length * 40 + 12, 48);
    setFixedPos(placeFixedMenu(rect, mw, mh, align));
  }, [open, items.length, align]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const id = requestAnimationFrame(() => requestAnimationFrame(() => reposition()));
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const itemCls =
    "block w-full text-left px-3 py-2 text-[13px] text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-150 first:rounded-t-[8px] last:rounded-b-[8px] disabled:opacity-40 disabled:pointer-events-none";

  const menu = (
    <ul
      ref={menuRef}
      role="listbox"
      /** Prevent document-level mousedown handlers (sidebar, other menus) from seeing this event — fixes option clicks not firing in portaled menus. */
      onMouseDown={e => e.stopPropagation()}
      style={
        displayPos && open
          ? {
              position: "fixed",
              top: displayPos.top,
              left: displayPos.left,
              zIndex: 200,
              minWidth: MENU_MIN_W,
            }
          : undefined
      }
      className={`max-h-[min(280px,calc(100vh-16px))] overflow-y-auto rounded-[8px] border border-border-subtle bg-surface-elevated py-1 shadow-lg transition-[opacity,transform] duration-150 ${
        open && displayPos ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
      }`}
    >
      {items.map(item => (
        <li key={item.key} role="option" aria-selected={item.selected}>
          <button
            type="button"
            disabled={item.disabled || busy}
            className={`${itemCls} ${item.selected ? "bg-surface-hover/80 text-text-primary" : ""}`}
            onClick={async (e) => {
              e.stopPropagation();
              setOpen(false);
              try {
                await item.onSelect();
              } catch (err) {
                console.error("Error executing status action:", err);
              }
            }}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className="relative inline-flex justify-center"
      {...(keywordActionMarker ? ({ "data-keyword-action": "" } as const) : {})}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel || triggerLabel || "Dropdown menu"}
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
        className={triggerClassName}
      >
        <span className="min-w-0 truncate">{triggerLabel}</span>
        <svg className="h-3.5 w-3.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {typeof document !== "undefined" && open && displayPos ? createPortal(menu, document.body) : null}
    </div>
  );
}
