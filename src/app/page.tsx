"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getPublicPricingData } from "@/app/actions/stripe-actions";
import { PricingCards } from "./pricing/PricingCards";
import {
  AuthSignedIn as SignedIn,
  AuthSignedOut as SignedOut,
  AuthUserButton as UserButton,
} from "@/components/auth-wrapper";
import { Logo } from "@/components/brand/Logo";
import { BRAND } from "@/constants/brand";
import { useScrolledPast } from "@/hooks/useScrollPosition";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ArrowRight,
  Sparkles,
  Search,
  Target,
  Calendar,
  FileText,
  BarChart3,
  Wand2,
  Bot,
  Activity,
  Layers,
  Globe2,
  ShieldCheck,
  Workflow,
  LineChart,
  Menu,
  X,
  Check,
  Zap,
} from "lucide-react";

/* ───────────────────────────── Mock data ───────────────────────────── */

const mockKeywords = [
  { keyword: "AI recruitment platform", volume: "8.1K", difficulty: 42, trend: "+24%", score: 92, intent: "Commercial" },
  { keyword: "automated hiring software", volume: "5.4K", difficulty: 38, trend: "+18%", score: 87, intent: "Commercial" },
  { keyword: "HR automation tools 2026", volume: "3.2K", difficulty: 55, trend: "+12%", score: 78, intent: "Informational" },
  { keyword: "AI candidate screening", volume: "2.9K", difficulty: 31, trend: "+32%", score: 85, intent: "Informational" },
  { keyword: "recruitment CRM comparison", volume: "1.8K", difficulty: 67, trend: "+8%", score: 64, intent: "Commercial" },
];

const features = [
  {
    icon: Search,
    title: "Demand discovery",
    desc: "Real DataForSEO + Ahrefs traffic data, intent classification, TOFU/MOFU/BOFU funnel mapping, and embedding-based topical filtering against your own business brief.",
  },
  {
    icon: Target,
    title: "Competitor benchmarking",
    desc: "Crawl competitors with Jina + Serper, surface ranking gaps, weak pages, and content opportunities you can ship before they catch up.",
  },
  {
    icon: Workflow,
    title: "Editorial calendar",
    desc: "Drag-and-drop publishing schedule with status, AI suggestions, and automatic generation queues — never stare at a blank week again.",
  },
  {
    icon: Wand2,
    title: "AI content studio",
    desc: "Blogs, ebooks, whitepapers, LinkedIn posts. Each asset includes Article + FAQ JSON-LD, internal links from your brief, and inline citations.",
  },
  {
    icon: Activity,
    title: "Content Health",
    desc: "Auto-audit live URLs, surface broken pages, score keyword demand decay, and rank fix priorities by traffic impact — built for AI Overviews in 2026.",
  },
  {
    icon: Bot,
    title: "Contextual AI assistant",
    desc: "A copilot embedded on every page. It already knows your brief, keyword set, competitors, calendar, and audit — no prompt engineering needed.",
  },
];

const workflowSteps = [
  { num: "01", title: "Tell Rankshoot about your business", desc: "Drop your domain, audience, and competitors. We scrape and brief everything." },
  { num: "02", title: "Discover real demand", desc: "Live DataForSEO + Ahrefs research, classified by funnel and filtered against your brief." },
  { num: "03", title: "Approve and schedule", desc: "Pick the winners, drop them into the calendar. Rankshoot handles the queue." },
  { num: "04", title: "Ship ranked content", desc: "Generate, audit, repair, and publish — GEO + SEO optimised by default." },
];

const stats = [
  { value: "94%", label: "AI Overviews coverage on generated blogs" },
  { value: "10×", label: "Faster keyword → published cycle" },
  { value: "30+", label: "Built-in SEO + GEO checks per asset" },
  { value: "5", label: "Premium content formats out of the box" },
];

const integrations = [
  { name: "Ahrefs", role: "Primary keyword + backlink data" },
  { name: "DataForSEO", role: "Fallback keyword + SERP data" },
  { name: "Serper", role: "Live SERP + People Also Ask" },
  { name: "Jina Reader", role: "Frictionless competitor crawling" },
  { name: "AI Engine", role: "Brief synthesis + content generation" },
  { name: "Editorial AI", role: "Long-form editorial polish" },
  { name: "Image AI", role: "Hero image generation" },
];

/* ───────────────────────────── Page ───────────────────────────── */

export default function LandingPage() {
  const scrolled = useScrolledPast(40);
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <main className="relative bg-surface-primary text-text-primary">
      <BackgroundFx />
      <Nav scrolled={scrolled} mobileMenu={mobileMenu} setMobileMenu={setMobileMenu} />
      <Hero />
      <SocialProof />
      <FeaturesGrid />
      <WorkflowSection />
      <DashboardPreview />
      <AssistantShowcase />
      <IntegrationsRow />
      <PricingSection />
      <FinalCTA />
      <Footer />
    </main>
  );
}

/* ───────────────────────────── Pieces ───────────────────────────── */

function BackgroundFx() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(124,126,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(124,126,255,0.06) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at top, black 25%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at top, black 25%, transparent 75%)",
        }}
      />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[640px] w-[1100px] rounded-full bg-brand-violet/12 blur-[140px] animate-pulse-glow" />
      <div className="absolute top-[40%] left-[8%] h-[420px] w-[420px] rounded-full bg-brand-aqua/8 blur-[120px] animate-pulse-glow delay-300" />
      <div className="absolute bottom-[-160px] right-[6%] h-[480px] w-[480px] rounded-full bg-brand-violet-soft/10 blur-[140px] animate-pulse-glow delay-500" />
    </div>
  );
}

function Nav({
  scrolled,
  mobileMenu,
  setMobileMenu,
}: {
  scrolled: boolean;
  mobileMenu: boolean;
  setMobileMenu: (v: boolean) => void;
}) {
  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-glass border-b border-border-subtle py-2.5"
          : "border-b border-transparent py-4"
      }`}
    >
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6">
        <Link href="/" className="shrink-0">
          <Logo size="md" />
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {[
            { label: "Product", href: "#features" },
            { label: "Workflow", href: "#workflow" },
            { label: "Assistant", href: "#assistant" },
            { label: "Pricing", href: "#pricing" },
            { label: "Preview", href: "#preview" },
          ].map(item => (
            <a
              key={item.label}
              href={item.href}
              className="text-[13.5px] font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <SignedOut>
            <Link
              href="/sign-in"
              className="px-3 py-2 text-[13.5px] font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-4 py-2 text-[13.5px] font-semibold text-surface-primary shadow-(--shadow-sm) transition-all duration-200 hover:-translate-y-0.5 hover:shadow-(--shadow-md)"
            >
              Get started <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-4 py-2 text-[13.5px] font-semibold text-surface-primary"
            >
              Open dashboard <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <UserButton />
          </SignedIn>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenu(!mobileMenu)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover md:hidden"
          aria-label="Toggle menu"
        >
          {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileMenu && (
        <div className="bg-glass absolute inset-x-0 top-full border-b border-border-subtle md:hidden">
          <div className="flex flex-col gap-2 p-6">
            {[
              { label: "Product", href: "#features" },
              { label: "Workflow", href: "#workflow" },
              { label: "Assistant", href: "#assistant" },
              { label: "Pricing", href: "#pricing" },
              { label: "Preview", href: "#preview" },
            ].map(item => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMobileMenu(false)}
                className="py-2 text-[14px] font-medium text-text-secondary"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-border-subtle pt-4">
              <SignedOut>
                <Link href="/sign-in" className="py-2 text-[14px] font-medium text-text-secondary">
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-text-primary px-4 py-2.5 text-[14px] font-semibold text-surface-primary"
                >
                  Get started
                </Link>
              </SignedOut>
              <SignedIn>
                <Link
                  href="/projects"
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-text-primary px-4 py-2.5 text-[14px] font-semibold text-surface-primary"
                >
                  Open dashboard
                </Link>
              </SignedIn>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative px-6 pt-36 pb-24 sm:pt-44 sm:pb-32" id="hero">
      <div className="mx-auto max-w-[920px] text-center">
        <div className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-border-subtle bg-glass px-3 py-1 text-[12px] font-medium text-text-secondary">
          <span className="ai-orb" />
          The AI SEO operating system · built for 2026
        </div>

        <h1 className="animate-fade-in-up delay-100 mt-6 text-balance text-5xl font-semibold tracking-[-0.035em] leading-[1.04] sm:text-6xl lg:text-[76px]">
          Research, plan, and ship <br />
          <span className="gradient-text">ranked content</span>{" "}
          <span className="text-text-tertiary">— on autopilot.</span>
        </h1>

        <p className="animate-fade-in-up delay-200 mx-auto mt-7 max-w-[640px] text-balance text-[17px] leading-relaxed text-text-secondary sm:text-[18px]">
          {BRAND.description}
        </p>

        <div className="animate-fade-in-up delay-300 mt-10 flex flex-wrap items-center justify-center gap-3">
          <SignedOut>
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-full bg-text-primary px-6 py-3.5 text-[14.5px] font-semibold text-surface-primary shadow-(--shadow-md) transition-all duration-200 hover:-translate-y-0.5 hover:shadow-(--shadow-lg)"
            >
              Start free
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/projects"
              className="group inline-flex items-center gap-2 rounded-full bg-text-primary px-6 py-3.5 text-[14.5px] font-semibold text-surface-primary shadow-(--shadow-md) transition-all duration-200 hover:-translate-y-0.5 hover:shadow-(--shadow-lg)"
            >
              Open dashboard
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </SignedIn>
          <a
            href="#preview"
            className="bg-glass inline-flex items-center gap-2 rounded-full border border-border-default px-6 py-3.5 text-[14.5px] font-semibold text-text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-hover"
          >
            <Sparkles className="h-4 w-4 text-brand-violet" /> See it in action
          </a>
        </div>

        <p className="animate-fade-in-up delay-400 mt-5 text-[12.5px] text-text-tertiary">
          No credit card required · 14-day full-feature trial · cancel anytime
        </p>
      </div>

      <div className="animate-fade-in-up delay-500 mx-auto mt-16 grid max-w-[1100px] grid-cols-2 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle sm:grid-cols-4">
        {stats.map(stat => (
          <div key={stat.label} className="bg-surface-elevated p-5">
            <div className="text-3xl font-semibold tracking-tight gradient-text">{stat.value}</div>
            <div className="mt-1.5 text-[12.5px] leading-relaxed text-text-tertiary">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SocialProof() {
  const items = [
    "AI Overviews ready",
    "Ahrefs + DataForSEO live data",
    "Article + FAQ JSON-LD by default",
    "Internal linking from your brief",
    "Built on Next.js 16 + Supabase",
  ];
  return (
    <section className="border-y border-border-subtle/70 bg-surface-secondary/40">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 py-6 text-[12px] uppercase tracking-[0.14em] text-text-tertiary">
        {items.map(item => (
          <span key={item} className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-brand-violet" />
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function FeaturesGrid() {
  return (
    <section id="features" className="px-6 py-28">
      <div className="mx-auto max-w-[1240px]">
        <SectionEyebrow icon={<Layers className="h-3.5 w-3.5" />} label="Platform" />
        <SectionTitle>
          Everything you need to rank, <span className="gradient-text">in one workspace.</span>
        </SectionTitle>
        <SectionSub>
          Built for marketing teams who want compounding traffic — not another dashboard. Every module shares the same brief, brief context, and live data layer.
        </SectionSub>

        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle md:grid-cols-2 lg:grid-cols-3">
          {features.map((feat, i) => (
            <div
              key={feat.title}
              className="group relative bg-surface-elevated p-7 transition-colors duration-200 hover:bg-surface-hover"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-violet/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div
                className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-secondary text-brand-violet"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <feat.icon className="h-5 w-5" />
              </div>
              <h3 className="text-[16px] font-semibold tracking-tight text-text-primary">{feat.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-text-tertiary">{feat.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section id="workflow" className="px-6 py-28">
      <div className="mx-auto max-w-[1240px]">
        <SectionEyebrow icon={<Workflow className="h-3.5 w-3.5" />} label="Workflow" />
        <SectionTitle>
          From <span className="gradient-text">brief</span> to <span className="gradient-text">published</span>, in days.
        </SectionTitle>
        <SectionSub>
          Rankshoot guides you through each step — never lost, never overwhelmed, every action contextual to what you just did.
        </SectionSub>

        <div className="relative mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {workflowSteps.map((step, i) => (
            <div
              key={step.num}
              className="bg-glass relative overflow-hidden rounded-card border border-border-subtle p-6"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-violet/60 to-transparent" />
              <div className="font-mono text-[12px] text-text-tertiary">{step.num}</div>
              <h3 className="mt-3 text-[15.5px] font-semibold tracking-tight text-text-primary">
                {step.title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-text-tertiary">{step.desc}</p>
              {i < workflowSteps.length - 1 && (
                <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 lg:block">
                  <ArrowRight className="h-4 w-4 text-text-tertiary/60" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DashboardPreview() {
  return (
    <section id="preview" className="px-6 py-28">
      <div className="mx-auto max-w-[1240px]">
        <SectionEyebrow icon={<BarChart3 className="h-3.5 w-3.5" />} label="Live preview" />
        <SectionTitle>
          A workspace that feels like <span className="gradient-text">a single thought.</span>
        </SectionTitle>
        <SectionSub>
          Premium dark + light themes, contextual side rails, keyboard-driven everywhere. This is not another SEO tool — it&apos;s an operating system.
        </SectionSub>

        <div className="mt-14 overflow-hidden rounded-card border border-border-default bg-surface-secondary shadow-(--shadow-xl)">
          {/* Mock window chrome */}
          <div className="flex items-center gap-3 border-b border-border-subtle bg-surface-tertiary px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex flex-1 justify-center">
              <span className="rounded-md bg-surface-secondary px-3 py-1 font-mono text-[11px] text-text-tertiary">
                {BRAND.marketingDomain}/projects/acme · keywords
              </span>
            </div>
          </div>

          <div className="grid min-h-[540px] grid-cols-1 lg:grid-cols-[220px_1fr_280px]">
            {/* Sidebar */}
            <aside className="hidden border-r border-border-subtle bg-surface-secondary p-4 lg:block">
              <div className="mb-6 flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated p-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-violet/15 text-[11px] font-bold text-brand-violet">
                  AC
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-text-primary">Acme Recruit</div>
                  <div className="truncate font-mono text-[10.5px] text-text-tertiary">acmerecruit.io</div>
                </div>
              </div>

              <div className="space-y-1">
                {[
                  { icon: BarChart3, label: "Overview" },
                  { icon: Search, label: "Keywords", active: true, count: "248" },
                  { icon: Wand2, label: "Content Generator" },
                  { icon: Target, label: "Competitors" },
                  { icon: Activity, label: "Content Health", count: "12" },
                  { icon: Calendar, label: "Calendar" },
                  { icon: FileText, label: "Blogs", count: "32" },
                ].map(item => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] font-medium ${
                      item.active
                        ? "border border-border-subtle bg-surface-elevated text-brand-violet shadow-(--shadow-xs)"
                        : "text-text-secondary"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    {item.count && (
                      <span className="rounded border border-border-subtle bg-surface-tertiary px-1.5 py-0.5 text-[10px] text-text-tertiary">
                        {item.count}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </aside>

            {/* Main */}
            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[18px] font-semibold tracking-tight">Keyword opportunities</div>
                  <div className="mt-0.5 text-[12px] text-text-tertiary">248 keywords · 34 high-opportunity</div>
                </div>
                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className="rounded-full border border-border-subtle bg-surface-elevated px-2.5 py-1 text-text-tertiary">
                    All funnels
                  </span>
                  <span className="rounded-full border border-brand-violet/30 bg-brand-violet/10 px-2.5 py-1 text-brand-violet">
                    Score &gt; 70
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Keywords", value: "248", change: "+12%", icon: Search },
                  { label: "Gaps found", value: "34", change: "+8", icon: Layers },
                  { label: "Approved", value: "62", change: "+5", icon: Check },
                  { label: "Blogs ready", value: "18", change: "+3", icon: FileText },
                ].map(m => (
                  <div key={m.label} className="rounded-xl border border-border-subtle bg-surface-elevated p-3.5">
                    <div className="flex items-center justify-between text-text-tertiary">
                      <span className="text-[10.5px] uppercase tracking-wider">{m.label}</span>
                      <m.icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="mt-2 text-[22px] font-semibold tracking-tight text-text-primary">{m.value}</div>
                    <div className="mt-1 text-[11px] font-medium text-status-success">{m.change}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated">
                <div className="grid grid-cols-[2fr_0.7fr_0.9fr_0.8fr_0.7fr] gap-3 border-b border-border-subtle px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                  <span>Keyword</span>
                  <span>Volume</span>
                  <span>Difficulty</span>
                  <span>Trend</span>
                  <span className="text-right">Score</span>
                </div>
                {mockKeywords.map(k => (
                  <div
                    key={k.keyword}
                    className="grid grid-cols-[2fr_0.7fr_0.9fr_0.8fr_0.7fr] items-center gap-3 border-b border-border-subtle px-4 py-2.5 text-[12.5px] last:border-b-0 hover:bg-surface-hover"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-text-primary">{k.keyword}</div>
                      <div className="mt-0.5 text-[10.5px] text-text-tertiary">{k.intent}</div>
                    </div>
                    <span className="font-mono text-text-secondary">{k.volume}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
                        <div
                          className={`h-full rounded-full ${
                            k.difficulty < 40 ? "bg-status-success" : k.difficulty < 60 ? "bg-status-warning" : "bg-status-danger"
                          }`}
                          style={{ width: `${k.difficulty}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-text-tertiary">{k.difficulty}</span>
                    </div>
                    <span className="font-medium text-status-success">{k.trend}</span>
                    <div className="text-right">
                      <span className="inline-flex rounded-full border border-brand-violet/30 bg-brand-violet/10 px-2 py-0.5 text-[11px] font-bold text-brand-violet">
                        {k.score}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right rail — AI assistant preview */}
            <aside className="hidden border-l border-border-subtle bg-surface-secondary p-4 lg:block">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
                <span className="ai-orb" /> Assistant
              </div>
              <div className="mt-4 space-y-3 text-[12.5px]">
                <div className="rounded-xl border border-border-subtle bg-surface-elevated p-3 text-text-secondary">
                  I noticed <span className="text-text-primary">5 BOFU keywords</span> in your latest discovery
                  trending up 24%. Want me to draft a comparison post for{" "}
                  <span className="text-brand-violet">&quot;AI recruitment platform&quot;</span>?
                </div>
                <div className="space-y-2">
                  <button className="flex w-full items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-left text-[12px] text-text-secondary hover:bg-surface-hover">
                    <Sparkles className="h-3.5 w-3.5 text-brand-violet" />
                    Draft comparison post
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-left text-[12px] text-text-secondary hover:bg-surface-hover">
                    <Wand2 className="h-3.5 w-3.5 text-brand-violet" />
                    Schedule next 30 days
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-left text-[12px] text-text-secondary hover:bg-surface-hover">
                    <LineChart className="h-3.5 w-3.5 text-brand-violet" />
                    Show keyword clusters
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

function AssistantShowcase() {
  return (
    <section id="assistant" className="px-6 py-28">
      <div className="mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div>
          <SectionEyebrow icon={<Bot className="h-3.5 w-3.5" />} label="AI assistant" />
          <SectionTitle className="text-balance">
            A copilot that <span className="gradient-text">knows your business.</span>
          </SectionTitle>
          <SectionSub className="max-w-none">
            The Rankshoot assistant lives on every page and changes behaviour with context — on Keywords it suggests clusters, on Competitors it surfaces gaps, on Content Health it ranks fixes by traffic impact. No prompt engineering needed.
          </SectionSub>

          <ul className="mt-8 space-y-3">
            {[
              { icon: Search, text: "Explains AI score, ranking chance, and clustering on the keywords page" },
              { icon: Target, text: "Surfaces competitor gaps and weak pages with one click" },
              { icon: Wand2, text: "Improves EEAT, semantic coverage, and CTAs inside the content studio" },
              { icon: Calendar, text: "Recommends cadence and fills empty days on the calendar" },
              { icon: Activity, text: "Prioritises Content Health fixes by SEO + traffic impact" },
            ].map(item => (
              <li key={item.text} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-elevated text-brand-violet">
                  <item.icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[14px] leading-relaxed text-text-secondary">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="absolute inset-0 -z-10 rounded-card bg-brand-violet/12 blur-3xl" />
          <div className="bg-glass space-y-3 overflow-hidden rounded-card border border-border-subtle p-5 shadow-(--shadow-xl)">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2">
                <span className="ai-orb" />
                <span className="text-[13px] font-semibold">Rankshoot assistant</span>
              </div>
              <span className="rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-[10.5px] text-text-tertiary">
                Keywords · Acme Recruit
              </span>
            </div>

            <ChatBubble role="user">
              Which of these keywords should I write first for max traffic in Q3?
            </ChatBubble>
            <ChatBubble role="assistant">
              Based on your brief + funnel mix, these three are the strongest bets:
              <ul className="mt-2 space-y-1.5 text-[12.5px] text-text-secondary">
                <li>
                  <span className="text-brand-violet">●</span> <b>AI recruitment platform</b> · BOFU · score 92 · +24% trend
                </li>
                <li>
                  <span className="text-brand-violet">●</span> <b>automated hiring software</b> · BOFU · score 87
                </li>
                <li>
                  <span className="text-brand-violet">●</span> <b>AI candidate screening</b> · TOFU · score 85 · +32%
                </li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-full border border-brand-violet/30 bg-brand-violet/10 px-2.5 py-1 text-[11px] font-medium text-brand-violet">
                  Approve all
                </button>
                <button className="rounded-full border border-border-subtle bg-surface-elevated px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                  Schedule for Q3
                </button>
                <button className="rounded-full border border-border-subtle bg-surface-elevated px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                  Cluster them
                </button>
              </div>
            </ChatBubble>
            <div className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-elevated px-3 py-2.5">
              <Sparkles className="h-3.5 w-3.5 text-brand-violet" />
              <span className="text-[12.5px] text-text-tertiary">Ask anything about your project…</span>
              <span className="ml-auto rounded border border-border-subtle bg-surface-secondary px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
                ⌘K
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChatBubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
          isUser
            ? "bg-text-primary text-surface-primary"
            : "border border-border-subtle bg-surface-elevated text-text-primary"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function IntegrationsRow() {
  return (
    <section className="border-y border-border-subtle px-6 py-24">
      <div className="mx-auto max-w-[1240px]">
        <SectionEyebrow icon={<Globe2 className="h-3.5 w-3.5" />} label="Integrations" />
        <SectionTitle>
          Live data from the tools <span className="gradient-text">enterprise SEO teams trust.</span>
        </SectionTitle>
        <SectionSub>
          Rankshoot routes requests to the right provider automatically — Ahrefs first when configured, DataForSEO as a clean fallback — and caches everything aggressively so spend stays predictable.
        </SectionSub>

        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle md:grid-cols-2 lg:grid-cols-4">
          {integrations.map(i => (
            <div key={i.name} className="flex flex-col gap-1 bg-surface-elevated p-5">
              <div className="text-[14px] font-semibold tracking-tight text-text-primary">{i.name}</div>
              <div className="text-[12px] text-text-tertiary">{i.role}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="px-6 py-32">
      <div className="relative mx-auto max-w-[920px] overflow-hidden rounded-[28px] border border-border-subtle bg-surface-secondary p-10 text-center shadow-(--shadow-xl) sm:p-16">
        <div className="absolute inset-0 -z-10 opacity-90">
          <div className="absolute -top-32 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-brand-violet/20 blur-[120px]" />
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-glass px-3 py-1 text-[12px] font-medium text-text-secondary">
          <span className="ai-orb" /> Ready when you are
        </div>
        <h2 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">
          Spend less time researching. <br />
          <span className="gradient-text">Ship more ranked content.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-[540px] text-[15px] leading-relaxed text-text-secondary">
          Plug in your domain and competitors. Rankshoot will brief, research, plan, generate, and audit — so your team can spend the day on strategy, not spreadsheets.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <SignedOut>
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-full bg-text-primary px-6 py-3.5 text-[14.5px] font-semibold text-surface-primary shadow-(--shadow-md) transition-all duration-200 hover:-translate-y-0.5 hover:shadow-(--shadow-lg)"
            >
              <Zap className="h-4 w-4" /> Start free
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/projects"
              className="group inline-flex items-center gap-2 rounded-full bg-text-primary px-6 py-3.5 text-[14.5px] font-semibold text-surface-primary shadow-(--shadow-md) transition-all duration-200 hover:-translate-y-0.5 hover:shadow-(--shadow-lg)"
            >
              <Zap className="h-4 w-4" /> Open dashboard
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </SignedIn>
          <a
            href="#features"
            className="bg-glass inline-flex items-center gap-2 rounded-full border border-border-default px-6 py-3.5 text-[14.5px] font-semibold text-text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-hover"
          >
            <ShieldCheck className="h-4 w-4 text-brand-violet" /> See the platform
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border-subtle px-6 py-16">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="max-w-[320px]">
          <Logo size="md" />
          <p className="mt-4 text-[13px] leading-relaxed text-text-tertiary">{BRAND.description}</p>
        </div>
        {[
          {
            heading: "Product",
            links: [
              { label: "Features", href: "#features" },
              { label: "Workflow", href: "#workflow" },
              { label: "AI Assistant", href: "#assistant" },
              { label: "Pricing", href: "#pricing" },
              { label: "Live preview", href: "#preview" },
            ],
          },
          {
            heading: "Resources",
            links: [
              { label: "Documentation", href: "#" },
              { label: "Changelog", href: "#" },
              { label: "API reference", href: "#" },
              { label: "Status", href: "#" },
            ],
          },
          {
            heading: "Company",
            links: [
              { label: "About", href: "#" },
              { label: "Privacy", href: "#" },
              { label: "Terms", href: "#" },
              { label: "Contact", href: "#" },
            ],
          },
        ].map(col => (
          <div key={col.heading}>
            <h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-secondary">
              {col.heading}
            </h4>
            <ul className="mt-4 space-y-2.5">
              {col.links.map(link => (
                <li key={link.label}>
                  <a href={link.href} className="text-[13px] text-text-tertiary transition-colors hover:text-text-primary">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-[1240px] flex-col items-center justify-between gap-3 border-t border-border-subtle pt-6 text-[12px] text-text-tertiary sm:flex-row">
        <span>© {new Date().getFullYear()} {BRAND.name}. Built for the AI Overviews era.</span>
        <span>Next.js · Supabase · Gemini · Ahrefs</span>
      </div>
    </footer>
  );
}

function SectionEyebrow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
      <span className="text-brand-violet">{icon}</span>
      {label}
    </div>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={`mt-4 text-balance text-4xl font-semibold tracking-[-0.028em] leading-[1.08] sm:text-[44px] ${className ?? ""}`}
    >
      {children}
    </h2>
  );
}

function SectionSub({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`mt-4 max-w-[640px] text-[15px] leading-relaxed text-text-secondary ${className ?? ""}`}>
      {children}
    </p>
  );
}

function PricingSection() {
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
      .then((data) => {
        if (active) {
          setPricingData(data);
        }
      })
      .catch((err) => {
        console.error("Failed to load pricing on home page:", err);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section id="pricing" className="px-6 py-28 relative">
      <div className="max-w-[1240px] mx-auto space-y-16 relative z-10">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <SectionEyebrow icon={<Zap className="h-3.5 w-3.5" />} label="Pricing" />
          <SectionTitle>
            Simple, transparent <span className="gradient-text">pricing.</span>
          </SectionTitle>
          <SectionSub className="mx-auto text-center">
            Select the plan that fits your growth. Manage competitor benchmarks, keywords exploration, and AI copywriting with predictable credits.
          </SectionSub>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-[24px] p-8 bg-surface-secondary border border-border-subtle h-[550px]"
              />
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

