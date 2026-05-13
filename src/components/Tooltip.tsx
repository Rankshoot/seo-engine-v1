"use client";

import * as React from "react";
import { createPortal } from "react-dom";

export function InfoIcon({ className = "h-[14px] w-[14px] opacity-50 hover:opacity-100 transition-opacity cursor-help" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
    </svg>
  );
}

export type TooltipPlacement = "above" | "below";

/** How far the tooltip box is offset from the cursor */
const CURSOR_OFFSET = 16;
const VIEWPORT_PADDING = 10;

export function Tooltip({
  children,
  content,
  className = "",
  placement = "above",
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
  placement?: TooltipPlacement;
}) {
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  const [pos, setPos] = React.useState({ top: -9999, left: -9999 });
  const [mounted, setMounted] = React.useState(false);
  const cursorRef = React.useRef({ x: 0, y: 0 });

  React.useEffect(() => { setMounted(true); }, []);

  const computeFromCursor = React.useCallback((cx: number, cy: number) => {
    const tip = tooltipRef.current;
    if (!tip) return;

    const tw = tip.offsetWidth  || 320;
    const th = tip.offsetHeight || 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Determine which quadrant has the most space relative to the cursor
    const spaceRight  = vw - cx - CURSOR_OFFSET - VIEWPORT_PADDING;
    const spaceLeft   = cx - CURSOR_OFFSET - VIEWPORT_PADDING;
    const spaceBelow  = vh - cy - CURSOR_OFFSET - VIEWPORT_PADDING;
    const spaceAbove  = cy - CURSOR_OFFSET - VIEWPORT_PADDING;

    // Horizontal axis: prefer the side chosen by `placement`, flip if needed
    const preferLeft = placement === "above"
      ? spaceLeft >= tw || spaceLeft > spaceRight   // "above" hint → try left first
      : spaceRight >= tw || spaceRight >= spaceLeft; // "below" hint → try right first

    let left: number;
    if (preferLeft && spaceLeft >= tw) {
      left = cx - tw - CURSOR_OFFSET;
    } else if (!preferLeft && spaceRight >= tw) {
      left = cx + CURSOR_OFFSET;
    } else if (spaceRight >= spaceLeft) {
      left = cx + CURSOR_OFFSET;
    } else {
      left = cx - tw - CURSOR_OFFSET;
    }

    // Vertical: align top of tooltip to cursor, slide up if near bottom
    let top = cy - Math.min(th * 0.3, 60); // anchor ~1/3 from tooltip top
    // Clamp vertically
    top = Math.max(window.scrollY + VIEWPORT_PADDING, top);
    top = Math.min(window.scrollY + vh - th - VIEWPORT_PADDING, top);

    // If horizontal placement forces tooltip to be too narrow, centre vertically on cursor instead
    // Clamp horizontal too
    left = Math.max(window.scrollX + VIEWPORT_PADDING, Math.min(left, window.scrollX + vw - tw - VIEWPORT_PADDING));

    // Vertical preference: if above has more space, bias upward
    if (spaceAbove > spaceBelow) {
      top = cy + window.scrollY - th - CURSOR_OFFSET;
      top = Math.max(window.scrollY + VIEWPORT_PADDING, top);
    } else {
      top = cy + window.scrollY + CURSOR_OFFSET;
      top = Math.min(window.scrollY + vh - th - VIEWPORT_PADDING, top);
    }

    setPos({ top, left: left + window.scrollX });
  }, [placement]);

  const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
    cursorRef.current = { x: e.clientX, y: e.clientY };
    if (visible) computeFromCursor(e.clientX, e.clientY);
  }, [visible, computeFromCursor]);

  const handleMouseEnter = React.useCallback((e: React.MouseEvent) => {
    cursorRef.current = { x: e.clientX, y: e.clientY };
    setVisible(true);
    // Position immediately using cursor coords (rAF so tooltip is painted first)
    requestAnimationFrame(() => computeFromCursor(e.clientX, e.clientY));
  }, [computeFromCursor]);

  const handleMouseLeave = React.useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <div
      ref={anchorRef}
      className={`group/tooltip relative inline-flex items-center justify-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {children}

      {mounted && createPortal(
        <div
          ref={tooltipRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            position: "absolute",
            top: pos.top,
            left: pos.left,
            zIndex: 99999,
            pointerEvents: visible ? "auto" : "none",
            opacity: visible ? 1 : 0,
            transform: visible ? "scale(1)" : "scale(0.96)",
            transition: "opacity 120ms ease, transform 120ms ease",
            maxHeight: `calc(100vh - ${VIEWPORT_PADDING * 2}px)`,
            overflow: "auto",
          }}
        >
          <div className="relative w-max max-w-xs rounded-xl border border-border-subtle bg-surface-elevated text-xs font-medium text-text-secondary shadow-2xl shadow-black/50">
            {content}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
