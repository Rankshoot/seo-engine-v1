"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { FaqItem } from "./blog-format";

/**
 * Collapsible FAQ. SEO-safe: every answer is always rendered in the DOM (we
 * only animate height / visibility, never unmount), so crawlers and the
 * FAQPage JSON-LD still see the full text. Accessible (button + aria-expanded).
 */
export function FaqAccordion({ faqs }: { faqs: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  if (!faqs.length) return null;

  return (
    <section id="faqs" className="scroll-mt-28">
      <div className="mb-6 flex items-center gap-3">
        <h2 className="text-[26px] font-bold tracking-tight text-text-primary">Frequently asked questions</h2>
        <div className="h-px flex-1 bg-border-subtle" />
      </div>

      <div className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-surface-elevated/50">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={i}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-hover"
              >
                <span className="text-[15px] font-semibold text-text-primary">{f.question}</span>
                <motion.span
                  animate={{ rotate: isOpen ? 45 : 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[15px] leading-none ${
                    isOpen ? "border-brand-violet/40 text-brand-violet" : "border-border-subtle text-text-tertiary"
                  }`}
                >
                  +
                </motion.span>
              </button>
              {/* Answer stays in the DOM at all times (height-only animation) → crawlable. */}
              <motion.div
                initial={false}
                animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <p className="px-5 pb-5 text-[14.5px] leading-relaxed text-text-secondary">{f.answer}</p>
              </motion.div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
