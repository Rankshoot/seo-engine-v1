"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Play, Search, Wand2, TrendingUp } from "lucide-react";
import {
  AuthSignedIn as SignedIn,
  AuthSignedOut as SignedOut,
} from "@/components/auth-wrapper";
import { BRAND } from "@/constants/brand";
import { stats, marqueItems, integrationLogos } from "./landing-data";

function IntegrationLogo({ item }: { item: typeof integrationLogos[number] }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-border-subtle overflow-hidden shadow-[var(--shadow-xs)]"
      style={{ backgroundColor: failed ? item.bg : "white" }}
    >
      {!failed ? (
        <img
          src={item.logoUrl}
          alt={item.name}
          width={22}
          height={22}
          loading="lazy"
          decoding="async"
          className="h-[22px] w-[22px] object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[11px] font-bold" style={{ color: item.color }}>{item.abbr}</span>
      )}
    </span>
  );
}

export function LandingHero() {
  return (
    <section className="relative px-4 pt-28 pb-16 sm:px-6 sm:pt-36 sm:pb-24" id="hero">
      <div className="mx-auto max-w-[960px] text-center">
        <h1 className="animate-fade-in-up mt-2 text-balance text-4xl font-semibold tracking-[-0.035em] leading-[1.04] sm:text-5xl lg:text-[76px]">
          Rank higher. Publish faster.<br />
          <span className="gradient-text">Automate everything.</span>
        </h1>

        <p className="animate-fade-in-up delay-100 mx-auto mt-6 max-w-[620px] text-balance text-[16px] leading-relaxed text-text-secondary sm:text-[18px]">
          Rankshoot discovers your best keywords, writes SEO-optimized content, and tracks your rankings — all in one place. From zero to ranked in days, not months.
        </p>

        <div className="animate-fade-in-up delay-200 mt-9 flex flex-wrap items-center justify-center gap-3">
          <SignedOut>
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-full bg-brand-violet px-7 py-3.5 text-[15px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover hover:shadow-[var(--shadow-glow-md)]"
            >
              Start free — no card needed
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/projects"
              className="group inline-flex items-center gap-2 rounded-full bg-brand-violet px-7 py-3.5 text-[15px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover hover:shadow-[var(--shadow-glow-md)]"
            >
              Open dashboard <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </SignedIn>
          <a
            href="#preview"
            className="bg-glass inline-flex items-center gap-2 rounded-full border border-border-default px-6 py-3.5 text-[15px] font-semibold text-text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-hover"
          >
            <Play className="h-4 w-4 fill-brand-violet text-brand-violet" /> Watch 2-min demo
          </a>
        </div>

        <p className="animate-fade-in-up delay-300 mt-4 text-[12.5px] text-text-tertiary">
          14-day full-feature trial · Cancel anytime · Setup under 15 minutes
        </p>

        <div className="animate-fade-in-up delay-400 relative mx-auto mt-14 max-w-[900px]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-px sm:overflow-hidden sm:rounded-[20px] sm:border sm:border-border-subtle sm:bg-border-subtle sm:shadow-[var(--shadow-md)]">
            {stats.map(stat => (
              <div key={stat.label} className="rounded-[16px] border border-border-subtle bg-surface-elevated p-5 text-center sm:rounded-none sm:border-none">
                <div className="text-3xl font-semibold tracking-tight gradient-text">{stat.value}</div>
                <div className="mt-1 text-[12px] leading-relaxed text-text-tertiary">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="pointer-events-none mt-8 hidden lg:block">
            <div className="relative h-[120px]">
              <div className="animate-card-float-a absolute left-0 top-2 w-[210px] rounded-2xl border border-border-subtle bg-surface-elevated p-4 shadow-[var(--shadow-md)]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-violet/15">
                    <Search className="h-3.5 w-3.5 text-brand-violet" />
                  </div>
                  <span className="text-[12px] font-semibold text-text-primary">34 keywords found</span>
                </div>
                <div className="text-[10.5px] text-text-tertiary">Score &gt;80 · BOFU priority · +24% trend</div>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-status-success animate-pulse-glow" />
                  <span className="text-[10px] font-medium text-status-success">Live data</span>
                </div>
              </div>

              <div className="animate-card-float-b absolute left-1/2 -translate-x-1/2 top-0 w-[220px] rounded-2xl border border-brand-violet/30 bg-surface-elevated p-4 shadow-[var(--shadow-glow-sm)]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-violet/15">
                    <Wand2 className="h-3.5 w-3.5 text-brand-violet" />
                  </div>
                  <span className="text-[12px] font-semibold text-text-primary">Generating blog…</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-tertiary">
                  <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-brand-violet to-brand-aqua animate-shimmer" />
                </div>
                <div className="mt-2 text-[10.5px] text-text-tertiary">2,400 words · JSON-LD · E-E-A-T</div>
              </div>

              <div className="animate-card-float-c absolute right-0 top-2 w-[200px] rounded-2xl border border-border-subtle bg-surface-elevated p-4 shadow-[var(--shadow-md)]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-status-success/15">
                    <TrendingUp className="h-3.5 w-3.5 text-status-success" />
                  </div>
                  <span className="text-[12px] font-semibold text-text-primary">Ranking #3</span>
                </div>
                <div className="text-[10.5px] text-text-tertiary">↑ from #18 in 14 days</div>
                <div className="mt-2 text-[10px] font-medium text-brand-violet">In AI Overviews ✓</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PoweredBy() {
  return (
    <section className="border-y border-border-subtle/70 bg-surface-secondary/40 py-5 overflow-hidden">
      <div className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
        Powered by the same data sources top-ranking teams rely on
      </div>
      <div className="relative flex overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-surface-secondary/80 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-surface-secondary/80 to-transparent" />
        <div className="animate-marquee items-center">
          {marqueItems.map((item, i) => (
            <span key={`${item.name}-${i}`} className="shrink-0 mx-7 flex items-center gap-2.5">
              <IntegrationLogo item={item} />
              <span className="text-[13.5px] font-semibold text-text-secondary whitespace-nowrap">{item.name}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
