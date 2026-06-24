"use client";

import { useState } from "react";
import { useScrolledPast } from "@/hooks/useScrollPosition";
import { BackgroundFx, LandingNav } from "./_components/LandingNav";
import { LandingHero, PoweredBy } from "./_components/LandingHero";
import { PainSection, FeaturesGrid, WorkflowSection } from "./_components/LandingContent";
import { DashboardPreview, AssistantShowcase } from "./_components/LandingPreview";
import { TestimonialsSection, IntegrationsRow } from "./_components/LandingProof";
import { FAQSection } from "./_components/LandingFAQ";
import { PricingSection, FinalCTA } from "./_components/LandingConversion";
import { LandingFooter } from "./_components/LandingFooter";

export default function LandingPage() {
  const scrolled = useScrolledPast(60);
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <main className="relative bg-surface-primary text-text-primary overflow-x-hidden">
      <BackgroundFx />
      <LandingNav scrolled={scrolled} mobileMenu={mobileMenu} setMobileMenu={setMobileMenu} />
      <LandingHero />
      <PoweredBy />
      <PainSection />
      <FeaturesGrid />
      <WorkflowSection />
      <DashboardPreview />
      <AssistantShowcase />
      <TestimonialsSection />
      <IntegrationsRow />
      <FAQSection />
      <PricingSection />
      <FinalCTA />
      <LandingFooter />
    </main>
  );
}
