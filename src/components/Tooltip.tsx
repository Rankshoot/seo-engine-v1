"use client";

import * as React from "react";

export function InfoIcon({ className = "h-[14px] w-[14px] opacity-50 hover:opacity-100 transition-opacity cursor-help" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
    </svg>
  );
}

type TooltipPlacement = "above" | "below";

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
  const isBelow = placement === "below";

  const wrapperCls = isBelow
    ? "pointer-events-none group-hover/tooltip:pointer-events-auto absolute top-full left-1/2 z-[9999] pt-2 -translate-x-1/2 -translate-y-1 scale-95 opacity-0 transition-all duration-200 ease-out group-hover/tooltip:translate-y-0 group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100"
    : "pointer-events-none group-hover/tooltip:pointer-events-auto absolute bottom-full left-1/2 z-[9999] pb-2 -translate-x-1/2 translate-y-1 scale-95 opacity-0 transition-all duration-200 ease-out group-hover/tooltip:translate-y-0 group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100";

  return (
    <div className={`group/tooltip relative inline-flex items-center justify-center ${className}`}>
      {children}
      <div className={wrapperCls}>
        <div className="relative w-max max-w-[240px] rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-xs font-medium text-text-secondary shadow-2xl text-center text-balance leading-relaxed">
          {content}
          {isBelow ? (
            <>
              {/* Arrow pointing up */}
              <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 border-[5px] border-transparent border-b-border-subtle" />
              <div className="absolute -top-[4px] left-1/2 -translate-x-1/2 border-[5px] border-transparent border-b-surface-elevated" />
            </>
          ) : (
            <>
              {/* Arrow pointing down */}
              <div className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-border-subtle" />
              <div className="absolute -bottom-[4px] left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-surface-elevated" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
