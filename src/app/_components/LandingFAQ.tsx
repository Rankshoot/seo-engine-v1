"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { useInView, SectionEyebrow, SectionTitle, SectionSub } from "./landing-ui";
import { faqs } from "./landing-data";

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-[15px] font-semibold text-text-primary">{q}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-300"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      <div style={{ maxHeight: open ? "400px" : "0", overflow: "hidden", transition: "max-height 0.35s cubic-bezier(0.16,1,0.3,1)" }}>
        <p className="pb-5 text-[14.5px] leading-relaxed text-text-secondary">{a}</p>
      </div>
    </div>
  );
}

export function FAQSection() {
  const [ref, inView] = useInView();
  return (
    <section className="px-4 py-28 sm:px-6" id="faq">
      <div className="mx-auto max-w-[820px]">
        <div
          ref={ref}
          className={`text-center transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <SectionEyebrow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="FAQ" />
          <SectionTitle className="text-center">Honest answers</SectionTitle>
          <SectionSub className="mx-auto text-center">Common questions from teams evaluating Rankshoot.</SectionSub>
        </div>
        <div
          className={`mt-10 rounded-[20px] border border-border-subtle bg-surface-elevated px-6 py-2 shadow-[var(--shadow-sm)] transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          {faqs.map(faq => <FAQItem key={faq.q} q={faq.q} a={faq.a} />)}
        </div>
      </div>
    </section>
  );
}
