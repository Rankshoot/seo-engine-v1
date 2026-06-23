"use client";

import { useState, useEffect, useRef } from "react";
import { Spinner } from "../_shared/ch-ui";

export function GenerationStreamPanel({
  stages, thinkingChunks, isGenerating, onClose,
}: {
  stages: string[];
  thinkingChunks: string[];
  isGenerating: boolean;
  onClose: () => void;
}) {
  const [minimized, setMinimized] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current && !minimized) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [stages, minimized]);

  const allThinking = thinkingChunks.join("");

  return (
    <div className={`rounded-[16px] border bg-surface-elevated shadow-sm overflow-hidden transition-all ${
      isGenerating ? "border-brand-violet/30" : "border-status-success/30"
    }`}>
      <div className={`flex items-center justify-between px-4 py-3 ${
        isGenerating ? "bg-brand-violet/5" : "bg-status-success/5"
      }`}>
        <div className="flex items-center gap-2.5">
          {isGenerating ? (
            <Spinner size={13} />
          ) : (
            <svg className="w-3.5 h-3.5 text-status-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
            </svg>
          )}
          <span className="text-[13px] font-semibold text-text-primary">
            {isGenerating ? "Generating enhanced blog…" : "Generation complete"}
          </span>
          {stages.length > 0 && isGenerating && (
            <span className="text-[11px] text-text-tertiary hidden sm:block">
              {stages[stages.length - 1]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMinimized(v => !v)}
            className="text-[11px] font-medium text-text-tertiary hover:text-text-primary transition-colors px-2 py-0.5 rounded-[6px] hover:bg-surface-secondary"
          >
            {minimized ? "Show details" : "Minimize"}
          </button>
          {!isGenerating && (
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-[6px] text-text-tertiary hover:text-status-danger hover:bg-status-danger/10 transition-all"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {!minimized && (
        <div className="p-4 space-y-3">
          <div ref={logRef} className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
            {stages.map((stage, i) => {
              const isLatest = i === stages.length - 1;
              return (
                <div key={i} className="flex items-start gap-2">
                  {isLatest && isGenerating ? (
                    <span className="w-1.5 h-1.5 mt-[5px] rounded-full bg-brand-violet animate-pulse shrink-0" />
                  ) : (
                    <svg className="w-3 h-3 mt-0.5 shrink-0 text-status-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                  <span className={`text-[12px] leading-relaxed ${isLatest ? "text-text-primary font-medium" : "text-text-tertiary"}`}>
                    {stage}
                  </span>
                </div>
              );
            })}
            {isGenerating && stages.length === 0 && (
              <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-violet animate-pulse shrink-0" />
                Connecting to generation service…
              </div>
            )}
          </div>

          {allThinking && (
            <div className="border-t border-border-subtle/50 pt-3">
              <button
                type="button"
                onClick={() => setThinkingExpanded(v => !v)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-text-tertiary hover:text-text-primary transition-colors mb-2 w-full text-left"
              >
                <svg className={`w-3.5 h-3.5 transition-transform shrink-0 ${thinkingExpanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                </svg>
                AI reasoning process
                <span className="ml-auto text-[10px] text-text-tertiary/60">{thinkingChunks.length} steps</span>
              </button>
              {thinkingExpanded && (
                <div className="max-h-56 overflow-y-auto rounded-[10px] bg-surface-secondary/60 border border-border-subtle/50 p-3">
                  <pre className="text-[11px] text-text-tertiary font-mono leading-relaxed whitespace-pre-wrap break-words">{allThinking}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
