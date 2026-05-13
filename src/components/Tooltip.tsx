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

const TOOLTIP_GAP = 8; // px between anchor and tooltip box
const VIEWPORT_PADDING = 12; // min px from viewport edge

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
  const [pos, setPos] = React.useState<{ top: number; left: number; actualPlacement: TooltipPlacement }>({
    top: 0,
    left: 0,
    actualPlacement: placement,
  });
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => { setMounted(true); }, []);

  const computePosition = React.useCallback(() => {
    const anchor = anchorRef.current;
    const tip = tooltipRef.current;
    if (!anchor || !tip) return;

    const ar = anchor.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Decide placement: prefer requested, flip if not enough space
    let useAbove = placement === "above";
    if (useAbove && ar.top - tr.height - TOOLTIP_GAP < VIEWPORT_PADDING) useAbove = false;
    if (!useAbove && ar.bottom + tr.height + TOOLTIP_GAP > vh - VIEWPORT_PADDING) useAbove = true;

    // Vertical position
    const top = useAbove
      ? ar.top + window.scrollY - tr.height - TOOLTIP_GAP
      : ar.bottom + window.scrollY + TOOLTIP_GAP;

    // Horizontal: centre on anchor, then clamp to viewport
    let left = ar.left + window.scrollX + ar.width / 2 - tr.width / 2;
    left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - tr.width - VIEWPORT_PADDING));

    setPos({ top, left, actualPlacement: useAbove ? "above" : "below" });
  }, [placement]);

  const handleMouseEnter = React.useCallback(() => {
    setVisible(true);
  }, []);

  const handleMouseLeave = React.useCallback(() => {
    setVisible(false);
  }, []);

  // Recompute position whenever visibility changes or on resize/scroll
  React.useLayoutEffect(() => {
    if (!visible) return;
    computePosition();
    const onUpdate = () => computePosition();
    window.addEventListener("scroll", onUpdate, true);
    window.addEventListener("resize", onUpdate);
    return () => {
      window.removeEventListener("scroll", onUpdate, true);
      window.removeEventListener("resize", onUpdate);
    };
  }, [visible, computePosition]);

  const arrowUp = (
    <>
      <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 border-[5px] border-transparent border-b-border-subtle" />
      <div className="absolute -top-[4px] left-1/2 -translate-x-1/2 border-[5px] border-transparent border-b-surface-elevated" />
    </>
  );
  const arrowDown = (
    <>
      <div className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-border-subtle" />
      <div className="absolute -bottom-[4px] left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-surface-elevated" />
    </>
  );

  return (
    <div
      ref={anchorRef}
      className={`group/tooltip relative inline-flex items-center justify-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
            transform: visible ? "scale(1) translateY(0)" : `scale(0.95) translateY(${pos.actualPlacement === "above" ? "4px" : "-4px"})`,
            transition: "opacity 150ms ease, transform 150ms ease",
          }}
        >
          <div className="relative w-max max-w-xs rounded-xl border border-border-subtle bg-surface-elevated text-xs font-medium text-text-secondary shadow-2xl shadow-black/40">
            {content}
            {pos.actualPlacement === "below" ? arrowUp : arrowDown}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
