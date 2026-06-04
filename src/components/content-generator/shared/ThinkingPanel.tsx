"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface ThinkingPanelProps {
  /** All thinking text accumulated so far */
  thinking: string;
  /** True while Claude is still streaming thinking tokens */
  isStreaming: boolean;
  className?: string;
}

/**
 * Live Claude thinking panel.
 * - Collapsed by default; auto-expands when streaming starts.
 * - Shows animated cursor while streaming.
 * - Smooth scroll to keep the latest thinking in view.
 * - User can toggle expand / collapse at any time.
 */
export function ThinkingPanel({ thinking, isStreaming, className }: ThinkingPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevStreaming = useRef(false);

  // Auto-expand when streaming starts
  useEffect(() => {
    if (isStreaming && !prevStreaming.current) setExpanded(true);
    prevStreaming.current = isStreaming;
  }, [isStreaming]);

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (isStreaming && expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thinking, isStreaming, expanded]);

  if (!thinking && !isStreaming) return null;

  const wordCount = thinking.split(/\s+/).filter(Boolean).length;

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-all duration-300",
        "bg-[hsl(250,15%,8%)] border-[hsl(265,60%,35%,0.4)]",
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left",
          "transition-colors hover:bg-[hsl(265,30%,12%)]"
        )}
      >
        {/* Animated brain icon */}
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-40",
              isStreaming ? "animate-ping bg-violet-500" : "bg-violet-700"
            )}
          />
          <span className="relative text-[14px]">🧠</span>
        </span>

        <span className="flex-1 flex items-center gap-2">
          <span className="text-[12px] font-mono font-medium uppercase tracking-widest text-violet-300">
            {isStreaming ? "Claude is thinking" : "Claude's reasoning"}
          </span>
          {isStreaming && (
            <span className="inline-flex gap-0.5 items-end h-3">
              {[0, 0.15, 0.3].map((delay, i) => (
                <span
                  key={i}
                  className="inline-block w-[3px] h-[3px] rounded-full bg-violet-400 animate-bounce"
                  style={{ animationDelay: `${delay}s` }}
                />
              ))}
            </span>
          )}
          {!isStreaming && wordCount > 0 && (
            <span className="text-[10px] font-mono text-violet-500">
              {wordCount.toLocaleString()} words
            </span>
          )}
        </span>

        {/* Expand / collapse chevron */}
        <span
          className={cn(
            "text-violet-400 transition-transform duration-200 text-[10px]",
            expanded ? "rotate-180" : "rotate-0"
          )}
        >
          ▼
        </span>
      </button>

      {/* Body */}
      {expanded && (
        <div
          ref={scrollRef}
          className={cn(
            "max-h-[320px] overflow-y-auto px-4 pb-4",
            "scrollbar-thin scrollbar-thumb-violet-800 scrollbar-track-transparent"
          )}
        >
          <div
            className={cn(
              "font-mono text-[12px] leading-relaxed whitespace-pre-wrap",
              "text-violet-200/80 selection:bg-violet-700/50"
            )}
          >
            {thinking || (
              <span className="text-violet-400/50 italic">Waiting for thinking tokens…</span>
            )}
            {isStreaming && (
              <span
                className="inline-block w-[2px] h-[14px] ml-0.5 align-middle bg-violet-400 animate-pulse"
                aria-hidden
              />
            )}
          </div>
        </div>
      )}

      {/* Gradient fade at bottom when collapsed but has content */}
      {!expanded && thinking && (
        <div className="px-4 pb-3">
          <div className="relative h-8 overflow-hidden">
            <p className="font-mono text-[11px] text-violet-300/50 truncate">{thinking.slice(0, 120)}…</p>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[hsl(250,15%,8%)]" />
          </div>
        </div>
      )}
    </div>
  );
}
