"use client";

import { useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

/**
 * Inline keyword-tag input. Uses the same chip aesthetic as the
 * Keywords workspace so authors recognise it instantly. Accepts
 * comma-, semicolon-, or Enter-delimited input.
 */
export function KeywordChips({
  value,
  onChange,
  placeholder = "Type and press Enter to add…",
  max = 20,
  id,
  invalid,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  id?: string;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const addToken = (raw: string) => {
    const cleaned = raw.trim().replace(/^[#@]/, "");
    if (!cleaned) return;
    if (value.includes(cleaned)) return;
    if (value.length >= max) return;
    onChange([...value, cleaned]);
    setDraft("");
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      addToken(draft);
      return;
    }
    if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5 rounded-md border bg-surface-secondary px-2.5 py-2 transition-colors",
        invalid
          ? "border-rose-500/60 focus-within:ring-1 focus-within:ring-rose-500/40"
          : "border-border-subtle focus-within:border-brand-action focus-within:ring-1 focus-within:ring-brand-action/60",
      )}
    >
      {value.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full border border-brand-action/30 bg-brand-action/10 px-2 py-0.5 text-[12px] font-medium text-brand-action"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter(v => v !== tag))}
            className="rounded-full p-0.5 text-brand-action/70 transition-colors hover:bg-brand-action/20 hover:text-brand-action"
            aria-label={`Remove ${tag}`}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => addToken(draft)}
        placeholder={value.length === 0 ? placeholder : ""}
        className="min-w-[120px] flex-1 bg-transparent text-[13px] text-text-primary placeholder:text-text-tertiary outline-none"
      />
    </div>
  );
}
