"use client";

import { Star, Quote, Globe2 } from "lucide-react";
import { useInView, SectionEyebrow, SectionTitle, SectionSub } from "./landing-ui";
import { testimonials, integrations } from "./landing-data";

export function TestimonialsSection() {
  const [ref, inView] = useInView();
  return (
    <section className="px-4 py-28 bg-surface-secondary/20 sm:px-6">
      <div className="mx-auto max-w-[1240px]">
        <div
          ref={ref}
          className={`text-center transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <SectionEyebrow icon={<Star className="h-3.5 w-3.5" />} label="Social proof" />
          <SectionTitle className="mx-auto max-w-[600px] text-center">
            Teams that ship more rank{" "}
            <span className="gradient-text">higher with Rankshoot.</span>
          </SectionTitle>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <div
              key={t.name}
              className={`relative overflow-hidden rounded-[20px] border border-border-subtle bg-surface-elevated p-7 shadow-[var(--shadow-sm)] transition-all duration-700 hover:-translate-y-1 hover:shadow-[var(--shadow-md)] ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: inView ? `${i * 110}ms` : "0ms" }}
            >
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-brand-violet/40 to-transparent" />
              <div className="mb-4 flex gap-1">
                {Array(t.stars).fill(0).map((_, s) => (
                  <Star key={s} className="h-3.5 w-3.5 fill-brand-violet text-brand-violet" />
                ))}
              </div>
              <Quote className="mb-3 h-6 w-6 text-brand-violet/25" />
              <p className="text-[14.5px] leading-relaxed text-text-secondary">&ldquo;{t.quote}&rdquo;</p>
              <div className="mt-6 flex items-center gap-3 border-t border-border-subtle pt-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-violet/15 text-[12px] font-bold text-brand-violet">
                  {t.avatar}
                </div>
                <div>
                  <div className="text-[13.5px] font-semibold text-text-primary">{t.name}</div>
                  <div className="text-[12px] text-text-tertiary">{t.title} · {t.company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function IntegrationsRow() {
  const [ref, inView] = useInView();
  return (
    <section className="border-y border-border-subtle px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-[1240px]">
        <div
          ref={ref}
          className={`transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <SectionEyebrow icon={<Globe2 className="h-3.5 w-3.5" />} label="Data sources" />
          <SectionTitle>
            Live data from the tools{" "}
            <span className="gradient-text">enterprise SEO teams trust.</span>
          </SectionTitle>
          <SectionSub>
            Rankshoot routes to the right provider automatically — Ahrefs first, DataForSEO as a clean fallback — and caches aggressively so your costs stay predictable.
          </SectionSub>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-[20px] border border-border-subtle bg-border-subtle shadow-[var(--shadow-md)] sm:grid-cols-2 lg:grid-cols-4">
          {integrations.map((item, i) => (
            <div
              key={item.name}
              className={`flex flex-col gap-1 bg-surface-elevated p-5 transition-all duration-500 hover:bg-surface-hover ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
              style={{ transitionDelay: inView ? `${i * 60}ms` : "0ms" }}
            >
              <div className="text-[14px] font-semibold tracking-tight text-text-primary">{item.name}</div>
              <div className="text-[12px] text-text-tertiary">{item.role}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
