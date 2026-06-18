"use client";

/**
 * LandingPagePreview — renders a structured LandingPageContentData as a
 * realistic, brand-coloured landing page preview inside the content studio.
 *
 * Brand colors are injected as CSS custom properties on the wrapper element
 * so every section can reference them without prop-drilling.
 */

import { useMemo, useState } from "react";
import type {
  LandingPageContentData,
  LandingPageSection,
  LandingPageHeroSection,
  LandingPageFeaturesSection,
  LandingPageStatsSection,
  LandingPageHowItWorksSection,
  LandingPageTestimonialsSection,
  LandingPageFaqSection,
  LandingPageCtaSection,
  LandingPageBenefitsSection,
  Project,
} from "@/lib/types";

// ─── Brand-color CSS vars ─────────────────────────────────────────────────────

const DEFAULT_PRIMARY   = "#7c3aed";
const DEFAULT_SECONDARY = "#e0d9ff";
const DEFAULT_ACCENT    = "#4f46e5";

function brandStyles(project?: Project | null): React.CSSProperties {
  return {
    "--lp-primary":   project?.brand_primary_color   || DEFAULT_PRIMARY,
    "--lp-secondary": project?.brand_secondary_color || DEFAULT_SECONDARY,
    "--lp-accent":    project?.brand_accent_color    || DEFAULT_ACCENT,
  } as React.CSSProperties;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function Divider() {
  return <hr className="my-0 border-t border-[var(--lp-primary)]/10" />;
}

// ─── Section: Hero ────────────────────────────────────────────────────────────

function HeroSection({ s }: { s: LandingPageHeroSection }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[var(--lp-primary)] to-[var(--lp-accent)] px-8 py-20 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.07),transparent_70%)]" />
      <div className="relative mx-auto max-w-3xl text-center space-y-6">
        {s.badge && (
          <span className="inline-block rounded-full border border-white/30 bg-white/15 px-4 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
            {s.badge}
          </span>
        )}
        <h1 className="text-3xl md:text-5xl font-extrabold leading-tight tracking-tight">
          {s.headline}
        </h1>
        <p className="text-lg md:text-xl text-white/80 leading-relaxed max-w-2xl mx-auto">
          {s.subheadline}
        </p>
        <div className="flex flex-wrap gap-3 justify-center pt-2">
          <button className="rounded-full bg-white px-7 py-3 text-sm font-bold text-[var(--lp-primary)] shadow-lg hover:shadow-xl transition-shadow">
            {s.cta_primary}
          </button>
          {s.cta_secondary && (
            <button className="rounded-full border border-white/50 px-7 py-3 text-sm font-semibold text-white/90 hover:bg-white/10 transition-colors">
              {s.cta_secondary}
            </button>
          )}
        </div>
        {s.trust_signals?.length ? (
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-xs text-white/60">
            {s.trust_signals.map((t, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="text-white/80">✓</span> {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ─── Section: Stats ───────────────────────────────────────────────────────────

function StatsSection({ s }: { s: LandingPageStatsSection }) {
  return (
    <section className="bg-[var(--lp-secondary)]/30 px-8 py-14">
      <div className="mx-auto max-w-4xl">
        {s.heading && (
          <h2 className="text-center text-xl font-bold text-[var(--lp-primary)] mb-8">{s.heading}</h2>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {s.items.map((item, i) => (
            <div key={i}>
              <div className="text-4xl font-extrabold text-[var(--lp-primary)]">{item.value}</div>
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: Features ────────────────────────────────────────────────────────

function FeaturesSection({ s }: { s: LandingPageFeaturesSection }) {
  return (
    <section className="bg-white dark:bg-gray-900 px-8 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">{s.heading}</h2>
          {s.subheading && <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">{s.subheading}</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {s.items.map((item, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-6 space-y-3">
              <span className="text-3xl">{item.icon}</span>
              <h3 className="font-semibold text-gray-900 dark:text-white">{item.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: Benefits ────────────────────────────────────────────────────────

function BenefitsSection({ s }: { s: LandingPageBenefitsSection }) {
  return (
    <section className="bg-white dark:bg-gray-900 px-8 py-16">
      <div className="mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">{s.heading}</h2>
          {s.subheading && <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">{s.subheading}</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {s.items.map((item, i) => (
            <div key={i} className="flex gap-4 p-5 rounded-xl border border-[var(--lp-primary)]/10 bg-[var(--lp-secondary)]/20">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--lp-primary)] text-white text-xs font-bold">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{item.title}</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: How It Works ────────────────────────────────────────────────────

function HowItWorksSection({ s }: { s: LandingPageHowItWorksSection }) {
  return (
    <section className="bg-gray-50 dark:bg-gray-900/60 px-8 py-16">
      <div className="mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">{s.heading}</h2>
          {s.subheading && <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">{s.subheading}</p>}
        </div>
        <div className="relative space-y-6">
          {s.steps.map((step, i) => (
            <div key={i} className="flex gap-5 items-start">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lp-primary)] text-white font-bold text-sm shadow-md">
                {i + 1}
              </div>
              <div className="pb-6 border-b border-gray-100 dark:border-gray-800 flex-1 last:border-0 last:pb-0">
                <h3 className="font-semibold text-gray-900 dark:text-white">{step.title}</h3>
                <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: Testimonials ────────────────────────────────────────────────────

function TestimonialsSection({ s }: { s: LandingPageTestimonialsSection }) {
  return (
    <section className="bg-white dark:bg-gray-900 px-8 py-16">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-10">{s.heading}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {s.items.map((t, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-6 space-y-4">
              <div className="flex gap-1 text-[var(--lp-primary)]">
                {"★★★★★".split("").map((star, si) => <span key={si}>{star}</span>)}
              </div>
              <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed italic">"{t.quote}"</p>
              <div>
                <div className="font-semibold text-gray-900 dark:text-white text-sm">{t.author}</div>
                <div className="text-xs text-gray-500">{t.role}{t.company ? `, ${t.company}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: FAQ ─────────────────────────────────────────────────────────────

function FaqSection({ s }: { s: LandingPageFaqSection }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="bg-gray-50 dark:bg-gray-900/60 px-8 py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">{s.heading}</h2>
        <div className="space-y-3">
          {s.items.map((faq, i) => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
              >
                <span className="text-sm">{faq.question}</span>
                <span className="text-[var(--lp-primary)] shrink-0 text-lg">{open === i ? "−" : "+"}</span>
              </button>
              {open === i && (
                <div className="px-5 pb-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-gray-700 pt-3">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: CTA ─────────────────────────────────────────────────────────────

function CtaSection({ s }: { s: LandingPageCtaSection }) {
  return (
    <section className="bg-gradient-to-br from-[var(--lp-primary)] to-[var(--lp-accent)] px-8 py-20 text-white text-center">
      <div className="mx-auto max-w-2xl space-y-6">
        <h2 className="text-3xl md:text-4xl font-extrabold">{s.heading}</h2>
        {s.subheading && <p className="text-lg text-white/80">{s.subheading}</p>}
        <div className="flex flex-wrap gap-3 justify-center">
          <button className="rounded-full bg-white px-8 py-3 text-sm font-bold text-[var(--lp-primary)] shadow-lg hover:shadow-xl transition-shadow">
            {s.cta_primary}
          </button>
          {s.cta_secondary && (
            <button className="rounded-full border border-white/50 px-8 py-3 text-sm font-semibold text-white/90 hover:bg-white/10 transition-colors">
              {s.cta_secondary}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Section dispatcher ────────────────────────────────────────────────────────

function Section({ section }: { section: LandingPageSection }) {
  switch (section.type) {
    case "hero":         return <HeroSection s={section as LandingPageHeroSection} />;
    case "stats":        return <StatsSection s={section as LandingPageStatsSection} />;
    case "features":     return <FeaturesSection s={section as LandingPageFeaturesSection} />;
    case "benefits":     return <BenefitsSection s={section as LandingPageBenefitsSection} />;
    case "how-it-works": return <HowItWorksSection s={section as LandingPageHowItWorksSection} />;
    case "testimonials": return <TestimonialsSection s={section as LandingPageTestimonialsSection} />;
    case "faq":          return <FaqSection s={section as LandingPageFaqSection} />;
    case "cta":          return <CtaSection s={section as LandingPageCtaSection} />;
    default:             return null;
  }
}

// ─── Public component ─────────────────────────────────────────────────────────

interface LandingPagePreviewProps {
  data: LandingPageContentData;
  project?: Project | null;
  className?: string;
}

export function LandingPagePreview({ data, project, className = "" }: LandingPagePreviewProps) {
  const styles = useMemo(() => brandStyles(project), [project]);

  if (!data?.sections?.length) {
    return (
      <div className="flex items-center justify-center h-64 text-text-tertiary text-sm">
        No sections to preview.
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-[12px] border border-border-subtle bg-white dark:bg-gray-900 font-sans ${className}`}
      style={styles}
    >
      {/* Page meta bar */}
      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/80 px-4 py-2">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 ml-2 h-6 rounded-full bg-gray-200 dark:bg-gray-700 px-3 flex items-center text-xs text-gray-400 truncate">
          {data.meta_title || "Landing Page Preview"}
        </div>
      </div>

      {/* Sections */}
      <div className="overflow-auto max-h-[700px]">
        {data.sections.map((section, i) => (
          <div key={i}>
            <Section section={section} />
            {i < data.sections.length - 1 && <Divider />}
          </div>
        ))}
      </div>
    </div>
  );
}
