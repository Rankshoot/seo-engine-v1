"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Zap, ShieldCheck } from "lucide-react";
import {
  AuthSignedIn as SignedIn,
  AuthSignedOut as SignedOut,
} from "@/components/auth-wrapper";
import { getPublicPricingData } from "@/app/actions/stripe-actions";
import { PricingCards } from "@/app/pricing/PricingCards";
import { useInView, SectionEyebrow, SectionTitle, SectionSub } from "./landing-ui";

export function PricingSection() {
  const [pricingData, setPricingData] = useState<{
    plans: any[];
    userActivePlanId: string;
    isUserSubscribed: boolean;
    isLoggedIn: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getPublicPricingData()
      .then(data => { if (active) setPricingData(data); })
      .catch(err => console.error("Failed to load pricing:", err))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section id="pricing" className="px-4 py-28 relative bg-surface-secondary/20 sm:px-6">
      <div className="max-w-[1240px] mx-auto space-y-16 relative z-10">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <SectionEyebrow icon={<Zap className="h-3.5 w-3.5" />} label="Pricing" />
          <SectionTitle>
            One platform.{" "}
            <span className="gradient-text">A fraction of the cost.</span>
          </SectionTitle>
          <SectionSub className="mx-auto text-center">
            Compare to $500+/mo in fragmented tools. All plans include the full AI pipeline — keywords, calendar, content studio, and audit.
          </SectionSub>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse rounded-[24px] p-8 bg-surface-secondary border border-border-subtle h-[550px]" />
            ))}
          </div>
        ) : pricingData ? (
          <PricingCards
            plans={pricingData.plans}
            userActivePlanId={pricingData.userActivePlanId}
            isUserSubscribed={pricingData.isUserSubscribed}
            isLoggedIn={pricingData.isLoggedIn}
          />
        ) : (
          <div className="text-center text-text-secondary py-12">
            Failed to load pricing plans. Please refresh or try again.
          </div>
        )}
      </div>
    </section>
  );
}

export function FinalCTA() {
  const [ref, inView] = useInView();
  return (
    <section className="px-4 py-32 sm:px-6">
      <div
        ref={ref}
        className={`relative mx-auto max-w-[960px] overflow-hidden rounded-[28px] border border-border-subtle bg-surface-secondary p-8 text-center shadow-[var(--shadow-xl)] transition-all duration-700 sm:p-16 ${inView ? "opacity-100 scale-100" : "opacity-0 scale-[0.97]"}`}
      >
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand-violet/28 dark:bg-brand-violet/15 blur-[120px]" />
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-violet/30 bg-brand-violet/10 px-3.5 py-1.5 text-[12.5px] font-medium text-brand-violet">
          <span className="ai-orb" /> Ready when you are
        </div>
        <h2 className="mt-5 text-balance text-3xl font-semibold tracking-[-0.025em] sm:text-4xl lg:text-5xl">
          Stop being invisible.<br />
          <span className="gradient-text">Start ranking automatically.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-[520px] text-[15px] leading-relaxed text-text-secondary">
          Plug in your domain. Rankshoot researches, writes, and publishes — you watch your organic traffic climb week over week.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <SignedOut>
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-full bg-brand-violet px-7 py-3.5 text-[15px] font-semibold text-white shadow-[var(--shadow-glow-md)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover"
            >
              <Zap className="h-4 w-4" /> Start free trial
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/projects"
              className="group inline-flex items-center gap-2 rounded-full bg-brand-violet px-7 py-3.5 text-[15px] font-semibold text-white shadow-[var(--shadow-glow-md)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover"
            >
              <Zap className="h-4 w-4" /> Open dashboard
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </SignedIn>
          <a
            href="#features"
            className="bg-glass inline-flex items-center gap-2 rounded-full border border-border-default px-6 py-3.5 text-[15px] font-semibold text-text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-hover"
          >
            <ShieldCheck className="h-4 w-4 text-brand-violet" /> Explore the platform
          </a>
        </div>
        <p className="mt-5 text-[12.5px] text-text-tertiary">
          No credit card · 14-day full trial · Cancel anytime · Under 15 min setup
        </p>
      </div>
    </section>
  );
}
