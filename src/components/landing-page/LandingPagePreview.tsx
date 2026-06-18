"use client";

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
    fontFamily:       project?.brand_font_family     || "Inter, sans-serif",
  } as React.CSSProperties;
}

// ─── Heading highlight parser ───────────────────────────────────────────────

export function renderHeading(text: string | undefined, isDark: boolean = false) {
  if (!text) return null;
  const parts = text.split("**");
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          return (
            <span key={i} className="text-[var(--lp-accent)] font-extrabold">
              {part}
            </span>
          );
        }
        return part;
      })}
    </>
  );
}

// ─── CTA Link Helper Component ───────────────────────────────────────────────

function CtaButton({
  href,
  children,
  className,
  buttonStyle,
}: {
  href?: string | null;
  children: React.ReactNode;
  className: string;
  buttonStyle?: string | null;
}) {
  const radiusClass =
    buttonStyle === "rounded-none"
      ? "rounded-none"
      : buttonStyle === "rounded-md"
      ? "rounded-md"
      : "rounded-full";

  // Strip standard roundings and apply configuration
  const cleanedClass = className.replace(/\brounded-(?:full|md|none)\b/g, "").trim() + " " + radiusClass;

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center justify-center transition-all duration-200 cursor-pointer ${cleanedClass}`}
      >
        {children}
      </a>
    );
  }
  return (
    <button className={`transition-all duration-200 ${cleanedClass}`}>
      {children}
    </button>
  );
}

// ─── Section Image rendering with AI Generation integration ──────────────────

function SectionImage({
  imageUrl,
  headline,
  index,
  onGenerateImage,
  generatingImageIndex,
  isDark,
  companyName,
  primaryKeyword,
  aspectRatio = "aspect-[4/3]",
}: {
  imageUrl?: string;
  headline: string;
  index: number;
  onGenerateImage?: (idx: number, alt: string) => void;
  generatingImageIndex?: number | null;
  isDark: boolean;
  companyName: string;
  primaryKeyword: string;
  aspectRatio?: string;
}) {
  if (imageUrl) {
    return (
      <div className={`relative w-full max-w-sm rounded-2xl overflow-hidden border border-slate-200/85 dark:border-slate-800 shadow-2xl ${aspectRatio} bg-slate-900 group`}>
        <img src={imageUrl} alt={headline} className="w-full h-full object-cover" />
        {onGenerateImage && (
          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-200">
            <button
              type="button"
              onClick={() => onGenerateImage(index, headline)}
              disabled={generatingImageIndex === index}
              className="px-4 py-2 bg-white text-slate-900 text-xs font-bold rounded-lg hover:scale-105 active:scale-95 transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {generatingImageIndex === index ? (
                <>
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-slate-900 border-t-transparent rounded-full" />
                  Generating...
                </>
              ) : (
                "✨ Regenerate Image"
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (onGenerateImage) {
    return (
      <div className={`relative w-full max-w-sm ${aspectRatio} rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-100/30 dark:bg-slate-900 flex flex-col items-center justify-center p-6 text-center shadow-xl`}>
        <div className="h-12 w-12 rounded-full bg-[var(--lp-primary)]/10 text-[var(--lp-primary)] flex items-center justify-center mb-3 text-xl">
          🖼️
        </div>
        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">No Image Generated</h4>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 max-w-[200px] mt-1 mb-4 leading-relaxed">
          Generate a customized brand graphic targeting: "{headline}".
        </p>
        <button
          type="button"
          onClick={() => onGenerateImage(index, headline)}
          disabled={generatingImageIndex === index}
          className="px-4 py-2 bg-[var(--lp-primary)] text-white text-xs font-bold rounded-lg hover:scale-105 active:scale-95 transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          {generatingImageIndex === index ? (
            <>
              <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
              Generating...
            </>
          ) : (
            "✨ Generate Image"
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full max-w-sm aspect-square rounded-2xl p-6 shadow-2xl flex flex-col justify-between overflow-hidden border ${
        isDark
          ? "bg-white/10 border-white/20 text-white backdrop-blur-md"
          : "bg-white border-slate-200/80 text-slate-800"
      }`}
    >
      <div
        className={`absolute top-0 right-0 -mr-12 -mt-12 w-36 h-36 rounded-full blur-2xl ${
          isDark ? "bg-[var(--lp-secondary)]/20" : "bg-[var(--lp-secondary)]/10"
        }`}
      />
      <div className={`flex items-center justify-between border-b pb-3 ${isDark ? "border-white/10" : "border-slate-100"}`}>
        <div className="flex gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isDark ? "bg-white/40" : "bg-slate-300"}`} />
          <span className={`w-2 h-2 rounded-full ${isDark ? "bg-white/40" : "bg-slate-300"}`} />
          <span className={`w-2 h-2 rounded-full ${isDark ? "bg-white/40" : "bg-slate-300"}`} />
        </div>
        <span className={`text-[9px] font-mono tracking-widest ${isDark ? "text-white/40" : "text-slate-400"}`}>
          SEO SUPPORTING PAGE
        </span>
      </div>
      <div className="my-auto space-y-3 text-center">
        <div
          className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-inner border ${
            isDark
              ? "bg-white/10 border-white/15"
              : "bg-slate-50 border-slate-100"
          }`}
        >
          🎯
        </div>
        <h3 className="text-base font-bold tracking-tight">{headline.slice(0, 30)}...</h3>
        <p className={`text-[11px] leading-relaxed max-w-xs mx-auto ${isDark ? "text-white/70" : "text-slate-500"}`}>
          This landing page targets the search intent to drive traffic.
        </p>
      </div>
      <div className={`border-t pt-3 flex items-center justify-between text-[10px] ${isDark ? "border-white/10 text-white/50" : "border-slate-100 text-slate-400"}`}>
        <span>{companyName}</span>
        <span>100% SEO Ready</span>
      </div>
    </div>
  );
}

// ─── Section: Hero ────────────────────────────────────────────────────────────

function HeroSection({
  s,
  project,
  index,
  onGenerateImage,
  generatingImageIndex,
}: {
  s: LandingPageHeroSection;
  project?: Project | null;
  index: number;
  onGenerateImage?: (idx: number, alt: string) => void;
  generatingImageIndex?: number | null;
}) {
  const isDark = project?.brand_theme === "dark";
  const ctaLink = project?.brand_cta_link || null;
  const buttonStyle = project?.brand_button_style;
  const companyName = project?.name || "Studio";

  const renderVisual = () => {
    if (s.image_url) {
      return (
        <div className="relative w-full max-w-sm rounded-2xl overflow-hidden border border-slate-200/85 dark:border-slate-800 shadow-2xl aspect-[4/3] bg-slate-900 group">
          <img src={s.image_url} alt={s.headline} className="w-full h-full object-cover" />
          {onGenerateImage && (
            <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-200">
              <button
                type="button"
                onClick={() => onGenerateImage(index, s.headline)}
                disabled={generatingImageIndex === index}
                className="px-4 py-2 bg-white text-slate-900 text-xs font-bold rounded-lg hover:scale-105 active:scale-95 transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {generatingImageIndex === index ? (
                  <>
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-slate-900 border-t-transparent rounded-full" />
                    Generating...
                  </>
                ) : (
                  "✨ Regenerate Image"
                )}
              </button>
            </div>
          )}
        </div>
      );
    }

    if (onGenerateImage) {
      return (
        <div className="relative w-full max-w-sm aspect-[4/3] rounded-2xl border border-dashed border-slate-355 dark:border-slate-800 bg-slate-100/30 dark:bg-slate-900 flex flex-col items-center justify-center p-6 text-center shadow-xl">
          <div className="h-12 w-12 rounded-full bg-[var(--lp-primary)]/10 text-[var(--lp-primary)] flex items-center justify-center mb-3 text-xl">
            🖼️
          </div>
          <h4 className="text-xs font-bold text-slate-850 dark:text-slate-200">No Image Generated</h4>
          <p className="text-[10px] text-slate-500 dark:text-slate-450 max-w-[200px] mt-1 mb-4 leading-relaxed">
            Generate a customized brand graphic targeting your keyword: "{project?.name || "this page"}".
          </p>
          <button
            type="button"
            onClick={() => onGenerateImage(index, s.headline)}
            disabled={generatingImageIndex === index}
            className="px-4 py-2 bg-[var(--lp-primary)] text-white text-xs font-bold rounded-lg hover:scale-105 active:scale-95 transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {generatingImageIndex === index ? (
              <>
                <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                Generating...
              </>
            ) : (
              "✨ Generate Image"
            )}
          </button>
        </div>
      );
    }

    return (
      <div
        className={`relative w-full max-w-sm aspect-square rounded-2xl p-6 shadow-2xl flex flex-col justify-between overflow-hidden border ${
          isDark
            ? "bg-white/10 border-white/20 text-white backdrop-blur-md"
            : "bg-white border-slate-200/80 text-slate-800"
        }`}
      >
        <div
          className={`absolute top-0 right-0 -mr-12 -mt-12 w-36 h-36 rounded-full blur-2xl ${
            isDark ? "bg-[var(--lp-secondary)]/20" : "bg-[var(--lp-secondary)]/10"
          }`}
        />
        <div className={`flex items-center justify-between border-b pb-3 ${isDark ? "border-white/10" : "border-slate-100"}`}>
          <div className="flex gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isDark ? "bg-white/40" : "bg-slate-300"}`} />
            <span className={`w-2 h-2 rounded-full ${isDark ? "bg-white/40" : "bg-slate-300"}`} />
            <span className={`w-2 h-2 rounded-full ${isDark ? "bg-white/40" : "bg-slate-300"}`} />
          </div>
          <span className={`text-[9px] font-mono tracking-widest ${isDark ? "text-white/40" : "text-slate-400"}`}>
            SEO SUPPORTING PAGE
          </span>
        </div>
        <div className="my-auto space-y-3 text-center">
          <div
            className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-inner border ${
              isDark
                ? "bg-white/10 border-white/15"
                : "bg-slate-50 border-slate-100"
            }`}
          >
            🎯
          </div>
          <h3 className="text-base font-bold tracking-tight">{s.headline.slice(0, 30)}...</h3>
          <p className={`text-[11px] leading-relaxed max-w-xs mx-auto ${isDark ? "text-white/70" : "text-slate-500"}`}>
            This landing page targets the search intent to drive high-intent organic traffic to {companyName}.
          </p>
        </div>
        <div className={`border-t pt-3 flex items-center justify-between text-[10px] ${isDark ? "border-white/10 text-white/50" : "border-slate-100 text-slate-400"}`}>
          <span>{companyName}</span>
          <span>100% SEO Ready</span>
        </div>
      </div>
    );
  };

  return (
    <section
      className={`relative overflow-hidden px-8 py-20 lg:py-28 transition-colors ${
        isDark
          ? "bg-gradient-to-br from-[var(--lp-primary)] to-[var(--lp-accent)] text-white"
          : "bg-gradient-to-br from-white via-[var(--lp-secondary)]/10 to-slate-50 text-slate-900 border-b border-slate-100"
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.07),transparent_70%)]" />
      <div className="relative mx-auto max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
          {s.badge && (
            <span
              className={`inline-block rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur mb-2 border ${
                isDark
                  ? "border-white/30 bg-white/15 text-white"
                  : "border-[var(--lp-primary)]/20 bg-[var(--lp-primary)]/5 text-[var(--lp-primary)]"
              }`}
            >
              {s.badge}
            </span>
          )}
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight tracking-tight">
            {renderHeading(s.headline, isDark)}
          </h1>
          <p
            className={`text-base md:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0 ${
              isDark ? "text-white/80" : "text-slate-600"
            }`}
          >
            {s.subheadline}
          </p>
          <div className="flex flex-wrap gap-3 justify-center lg:justify-start pt-2">
            <CtaButton
              href={ctaLink}
              buttonStyle={buttonStyle}
              className={`px-7 py-3 text-sm font-bold shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all ${
                isDark
                  ? "bg-white text-[var(--lp-primary)]"
                  : "bg-[var(--lp-primary)] text-white"
              }`}
            >
              {s.cta_primary}
            </CtaButton>
            {s.cta_secondary && (
              <CtaButton
                href={ctaLink}
                buttonStyle={buttonStyle}
                className={`px-7 py-3 text-sm font-semibold hover:scale-105 active:scale-95 transition-all ${
                  isDark
                    ? "border border-white/50 text-white/90 hover:bg-white/10 hover:border-white"
                    : "border border-[var(--lp-primary)]/30 text-[var(--lp-primary)] hover:bg-[var(--lp-primary)]/5"
                }`}
              >
                {s.cta_secondary}
              </CtaButton>
            )}
          </div>
          {s.trust_signals?.length ? (
            <div
              className={`flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-2 text-xs ${
                isDark ? "text-white/60" : "text-slate-400"
              }`}
            >
              {s.trust_signals.map((t, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className={isDark ? "text-white/80" : "text-[var(--lp-primary)]"}>✓</span> {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="lg:col-span-5 flex justify-center">
          {renderVisual()}
        </div>
      </div>
    </section>
  );
}

// ─── Section: Stats ───────────────────────────────────────────────────────────

function StatsSection({ s, project }: { s: LandingPageStatsSection; project?: Project | null }) {
  const isDark = project?.brand_theme === "dark";

  return (
    <section
      className={`px-8 py-14 border-y transition-colors ${
        isDark
          ? "bg-slate-900/60 border-slate-800"
          : "bg-[var(--lp-secondary)]/15 border-[var(--lp-primary)]/5"
      }`}
    >
      <div className="mx-auto max-w-4xl">
        {s.heading && (
          <h2 className="text-center text-xl font-bold text-[var(--lp-primary)] mb-8">{renderHeading(s.heading, isDark)}</h2>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {s.items.map((item, i) => (
            <div key={i} className="space-y-1">
              <div className="text-3xl md:text-4xl font-extrabold text-[var(--lp-primary)]">{item.value}</div>
              <div className={`text-xs md:text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: Features ────────────────────────────────────────────────────────

function FeaturesSection({
  s,
  project,
  index,
  onGenerateImage,
  generatingImageIndex,
}: {
  s: LandingPageFeaturesSection;
  project?: Project | null;
  index: number;
  onGenerateImage?: (idx: number, alt: string) => void;
  generatingImageIndex?: number | null;
}) {
  const isDark = project?.brand_theme === "dark";
  const companyName = project?.name || "Studio";

  const itemsHtml = s.items.map((item, i) => (
    <div
      key={i}
      className={`rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 space-y-3 border ${
        isDark
          ? "bg-slate-900 border-slate-800/80 text-white"
          : "bg-white border-slate-100 text-slate-900"
      }`}
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--lp-secondary)]/30 text-2xl">
        {item.icon}
      </span>
      <h3 className="font-bold text-base leading-snug">{renderHeading(item.title, isDark)}</h3>
      <p className={`text-xs md:text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
        {item.description}
      </p>
    </div>
  ));

  const hasImage = !!s.image_url || !!onGenerateImage;

  return (
    <section className={`px-8 py-16 transition-colors ${isDark ? "bg-slate-955" : "bg-slate-50"}`}>
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <h2 className={`text-2xl md:text-3xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{renderHeading(s.heading, isDark)}</h2>
          {s.subheading && (
            <p className={`mt-3 text-sm md:text-base max-w-xl mx-auto ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {s.subheading}
            </p>
          )}
        </div>

        {hasImage ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
              {itemsHtml}
            </div>
            <div className="lg:col-span-5 flex justify-center">
              <SectionImage
                imageUrl={s.image_url}
                headline={s.heading}
                index={index}
                onGenerateImage={onGenerateImage}
                generatingImageIndex={generatingImageIndex}
                isDark={isDark}
                companyName={companyName}
                primaryKeyword={project?.name || "Target keyword"}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {itemsHtml}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Section: Benefits ────────────────────────────────────────────────────────

function BenefitsSection({
  s,
  project,
  index,
  onGenerateImage,
  generatingImageIndex,
}: {
  s: LandingPageBenefitsSection;
  project?: Project | null;
  index: number;
  onGenerateImage?: (idx: number, alt: string) => void;
  generatingImageIndex?: number | null;
}) {
  const isDark = project?.brand_theme === "dark";
  const companyName = project?.name || "Studio";

  const itemsHtml = s.items.map((item, i) => (
    <div
      key={i}
      className={`flex gap-4 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow border ${
        isDark
          ? "bg-slate-955 border-slate-800 text-white"
          : "bg-white border-slate-100 text-slate-900"
      }`}
    >
      {item.icon ? (
        <span className="mt-0.5 shrink-0 text-xl">{item.icon}</span>
      ) : (
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--lp-primary)] text-white text-xs font-bold">
          {i + 1}
        </span>
      )}
      <div>
        <h3 className="font-bold text-base leading-snug">{renderHeading(item.title, isDark)}</h3>
        <p className={`mt-1 text-xs md:text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-650"}`}>
          {item.description}
        </p>
      </div>
    </div>
  ));

  const hasImage = !!s.image_url || !!onGenerateImage;

  return (
    <section className={`px-8 py-16 transition-colors ${isDark ? "bg-slate-900" : "bg-white"}`}>
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <h2 className={`text-2xl md:text-3xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{renderHeading(s.heading, isDark)}</h2>
          {s.subheading && (
            <p className={`mt-3 text-sm md:text-base max-w-xl mx-auto ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {s.subheading}
            </p>
          )}
        </div>

        {hasImage ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-4">
              {itemsHtml}
            </div>
            <div className="lg:col-span-5 flex justify-center">
              <SectionImage
                imageUrl={s.image_url}
                headline={s.heading}
                index={index}
                onGenerateImage={onGenerateImage}
                generatingImageIndex={generatingImageIndex}
                isDark={isDark}
                companyName={companyName}
                primaryKeyword={project?.name || "Target keyword"}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {itemsHtml}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Section: How It Works ────────────────────────────────────────────────────

function HowItWorksSection({ s, project }: { s: LandingPageHowItWorksSection; project?: Project | null }) {
  const isDark = project?.brand_theme === "dark";

  return (
    <section className={`px-8 py-16 transition-colors ${isDark ? "bg-slate-950" : "bg-slate-50"}`}>
      <div className="mx-auto max-w-3xl">
        <div className="text-center mb-12">
          <h2 className={`text-2xl md:text-3xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{renderHeading(s.heading, isDark)}</h2>
          {s.subheading && (
            <p className={`mt-3 text-sm md:text-base max-w-xl mx-auto ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {s.subheading}
            </p>
          )}
        </div>
        <div className="relative space-y-6">
          {s.steps.map((step, i) => (
            <div key={i} className="flex gap-5 items-start">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lp-primary)] text-white font-bold text-sm shadow-md">
                {i + 1}
              </div>
              <div className={`pb-8 border-b flex-1 last:border-0 last:pb-0 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                <h3 className={`font-bold text-base md:text-lg leading-snug ${isDark ? "text-white" : "text-slate-900"}`}>
                  {renderHeading(step.title, isDark)}
                </h3>
                <p className={`mt-2 text-xs md:text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: Testimonials ────────────────────────────────────────────────────

function TestimonialsSection({ s, project }: { s: LandingPageTestimonialsSection; project?: Project | null }) {
  const isDark = project?.brand_theme === "dark";

  return (
    <section className={`px-8 py-16 transition-colors ${isDark ? "bg-slate-900" : "bg-white"}`}>
      <div className="mx-auto max-w-5xl">
        <h2 className={`text-center text-2xl md:text-3xl font-bold mb-12 ${isDark ? "text-white" : "text-slate-900"}`}>
          {renderHeading(s.heading, isDark)}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {s.items.map((t, i) => (
            <div
              key={i}
              className={`rounded-2xl border p-6 flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow ${
                isDark
                  ? "bg-slate-950 border-slate-800 text-white"
                  : "bg-white border-slate-100 shadow-sm text-slate-900"
              }`}
            >
              <div className="space-y-3">
                <div className="flex text-amber-400 gap-0.5">
                  {"★".repeat(5).split("").map((star, si) => <span key={si}>{star}</span>)}
                </div>
                <p className={`text-xs md:text-sm leading-relaxed italic ${isDark ? "text-slate-350" : "text-slate-700"}`}>
                  "{t.quote}"
                </p>
              </div>
              <div className={`pt-2 border-t ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                <div className="font-bold text-xs md:text-sm">{t.author}</div>
                <div className="text-[10px] md:text-xs text-gray-500">{t.role}{t.company ? `, ${t.company}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: FAQ ─────────────────────────────────────────────────────────────

function FaqSection({ s, project }: { s: LandingPageFaqSection; project?: Project | null }) {
  const isDark = project?.brand_theme === "dark";
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className={`px-8 py-16 transition-colors ${isDark ? "bg-slate-950" : "bg-slate-50"}`}>
      <div className="mx-auto max-w-3xl">
        <h2 className={`text-2xl md:text-3xl font-bold mb-8 text-center ${isDark ? "text-white" : "text-slate-900"}`}>
          {renderHeading(s.heading, isDark)}
        </h2>
        <div className="space-y-3">
          {s.items.map((faq, i) => (
            <div
              key={i}
              className={`rounded-xl border overflow-hidden shadow-sm transition-colors ${
                isDark
                  ? "bg-slate-900 border-slate-800 text-white"
                  : "bg-white border-slate-200 text-slate-900"
              }`}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold transition-colors ${
                  isDark ? "hover:bg-slate-850" : "hover:bg-slate-50"
                }`}
              >
                <span className="text-xs md:text-sm">{faq.question}</span>
                <span className="text-[var(--lp-primary)] shrink-0 text-lg font-bold">{open === i ? "−" : "+"}</span>
              </button>
              {open === i && (
                <div
                  className={`px-5 pb-4 text-xs md:text-sm leading-relaxed border-t pt-3 ${
                    isDark ? "text-slate-400 border-slate-800" : "text-gray-600 border-slate-100"
                  }`}
                >
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

function CtaSection({ s, project }: { s: LandingPageCtaSection; project?: Project | null }) {
  const isDark = project?.brand_theme === "dark";
  const ctaLink = project?.brand_cta_link || null;
  const buttonStyle = project?.brand_button_style;

  return (
    <section
      className={`px-8 py-20 text-center relative overflow-hidden transition-colors ${
        isDark
          ? "bg-gradient-to-br from-[var(--lp-primary)] to-[var(--lp-accent)] text-white"
          : "bg-gradient-to-br from-white via-[var(--lp-secondary)]/20 to-slate-50 text-slate-900 border-t border-slate-100"
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(255,255,255,0.06),transparent_50%)]" />
      <div className="relative mx-auto max-w-2xl space-y-6">
        <h2 className="text-3xl md:text-4xl font-extrabold leading-tight tracking-tight">{renderHeading(s.heading, isDark)}</h2>
        {s.subheading && (
          <p className={`text-base md:text-lg ${isDark ? "text-white/80" : "text-slate-600"}`}>
            {s.subheading}
          </p>
        )}
        <div className="flex flex-wrap gap-3 justify-center pt-2">
          <CtaButton
            href={ctaLink}
            buttonStyle={buttonStyle}
            className={`px-8 py-3 text-sm font-bold shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all ${
              isDark
                ? "bg-white text-[var(--lp-primary)]"
                : "bg-[var(--lp-primary)] text-white"
            }`}
          >
            {s.cta_primary}
          </CtaButton>
          {s.cta_secondary && (
            <CtaButton
              href={ctaLink}
              buttonStyle={buttonStyle}
              className={`px-8 py-3 text-sm font-semibold hover:scale-105 active:scale-95 transition-all ${
                isDark
                  ? "border border-white/50 text-white/90 hover:bg-white/10"
                  : "border border-[var(--lp-primary)]/30 text-[var(--lp-primary)] hover:bg-[var(--lp-primary)]/5"
              }`}
            >
              {s.cta_secondary}
            </CtaButton>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Section dispatcher ────────────────────────────────────────────────────────

function Section({
  section,
  project,
  index,
  onGenerateImage,
  generatingImageIndex,
}: {
  section: LandingPageSection;
  project?: Project | null;
  index: number;
  onGenerateImage?: (idx: number, alt: string) => void;
  generatingImageIndex?: number | null;
}) {
  switch (section.type) {
    case "hero":         return <HeroSection s={section as LandingPageHeroSection} project={project} index={index} onGenerateImage={onGenerateImage} generatingImageIndex={generatingImageIndex} />;
    case "stats":        return <StatsSection s={section as LandingPageStatsSection} project={project} />;
    case "features":     return <FeaturesSection s={section as LandingPageFeaturesSection} project={project} index={index} onGenerateImage={onGenerateImage} generatingImageIndex={generatingImageIndex} />;
    case "benefits":     return <BenefitsSection s={section as LandingPageBenefitsSection} project={project} index={index} onGenerateImage={onGenerateImage} generatingImageIndex={generatingImageIndex} />;
    case "how-it-works": return <HowItWorksSection s={section as LandingPageHowItWorksSection} project={project} />;
    case "testimonials": return <TestimonialsSection s={section as LandingPageTestimonialsSection} project={project} />;
    case "faq":          return <FaqSection s={section as LandingPageFaqSection} project={project} />;
    case "cta":          return <CtaSection s={section as LandingPageCtaSection} project={project} />;
    default:             return null;
  }
}

// ─── Public component ─────────────────────────────────────────────────────────

interface LandingPagePreviewProps {
  data: LandingPageContentData;
  project?: Project | null;
  className?: string;
  onGenerateImage?: (sectionIndex: number, imageAlt: string) => void;
  generatingImageIndex?: number | null;
}

export function LandingPagePreview({
  data,
  project,
  className = "",
  onGenerateImage,
  generatingImageIndex,
}: LandingPagePreviewProps) {
  const styles = useMemo(() => brandStyles(project), [project]);
  const companyName = data.company_name || project?.name || "Studio";
  const isDark = project?.brand_theme === "dark";

  if (!data?.sections?.length) {
    return (
      <div className="flex items-center justify-center h-64 text-text-tertiary text-sm">
        No sections to preview.
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-[12px] border border-border-subtle font-sans shadow-lg transition-colors ${
        isDark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"
      } ${className}`}
      style={styles}
    >
      {/* Page meta browser mock bar */}
      <div
        className={`flex items-center gap-2 border-b px-4 py-2 transition-colors ${
          isDark ? "border-slate-800 bg-slate-900" : "border-slate-100 bg-white"
        }`}
      >
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
        <div
          className={`flex-1 ml-2 h-6 rounded-full px-3 flex items-center text-[11px] truncate font-mono transition-colors ${
            isDark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-gray-400"
          }`}
        >
          https://{project?.domain || "yourdomain.com"}/{data.primary_keyword ? data.primary_keyword.toLowerCase().replace(/\s+/g, "-") : "lp"}
        </div>
      </div>

      {/* Sections */}
      <div className="overflow-auto max-h-[750px]">
        {data.sections.map((section, i) => (
          <div key={i}>
            <Section
              section={section}
              project={project}
              index={i}
              onGenerateImage={onGenerateImage}
              generatingImageIndex={generatingImageIndex}
            />
          </div>
        ))}

        {/* Branded Footer */}
        <footer
          className={`border-t px-6 py-12 text-center text-xs space-y-4 transition-colors ${
            isDark
              ? "border-slate-850 bg-slate-950 text-slate-400"
              : "border-slate-150 bg-slate-100 text-slate-500"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            {project?.brand_logo_url ? (
              <img
                src={project.brand_logo_url}
                alt={companyName}
                className="h-6 object-contain grayscale opacity-60"
              />
            ) : (
              <span className={`font-bold ${isDark ? "text-slate-400" : "text-slate-600"}`}>{companyName}</span>
            )}
          </div>
          <p className="max-w-md mx-auto leading-relaxed">
            Supporting SEO landing page for {project?.domain || "yourdomain.com"}. Optimized for organic search intent: <i>"{data.primary_keyword}"</i>.
          </p>
          <p>© {new Date().getFullYear()} {companyName}. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
