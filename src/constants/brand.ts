/**
 * Rankshoot brand constants — single source of truth for product name, tagline,
 * domain placeholder, support email, and other strings that show up across the
 * UI. Centralising these means a future rename only touches one file.
 */

export const BRAND = {
  /** Product name as displayed everywhere in the UI. */
  name: "Rankshoot",
  /** Short product positioning line — used in nav, hero, modals. */
  tagline: "AI-Powered SEO Operating System",
  /** Long-form one-liner — landing hero subtitle / OG description. */
  description:
    "Rankshoot is an AI-native SEO operating system that researches keywords, audits competitors, plans your editorial calendar, and ships ranked content — automatically.",
  /** Hostname placeholder shown in mockups (browser chrome). */
  marketingDomain: "rankshoot.ai",
  /** Years to render in copyright. */
  copyrightStart: 2026,
  /** Lightning bolt + Rankshoot wordmark uses these two characters as glyphs. */
  glyph: "R",
} as const;

export type BrandKey = keyof typeof BRAND;
