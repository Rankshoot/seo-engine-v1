"use client";

import { useState } from "react";
import { useScrolledPast } from "@/hooks/useScrollPosition";
import { BackgroundFx, LandingNav } from "./LandingNav";
import { LandingFooter } from "./LandingFooter";

/**
 * Shared chrome for the public blog so it feels like part of the marketing site
 * — same scroll-aware floating nav, ambient background, and footer as the
 * landing page — instead of a separate, plain blog shell. Thin client wrapper
 * that owns the nav's scroll + mobile-menu state (mirrors src/app/page.tsx).
 */
export function BlogChrome({ children }: { children: React.ReactNode }) {
  const scrolled = useScrolledPast(60);
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-surface-primary text-text-primary">
      <BackgroundFx />
      <LandingNav scrolled={scrolled} mobileMenu={mobileMenu} setMobileMenu={setMobileMenu} />
      <div className="pt-24 sm:pt-28">{children}</div>
      <LandingFooter />
    </main>
  );
}
