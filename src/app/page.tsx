"use client";

import { useState, useEffect, useRef } from "react";
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
  ArrowRight, Sparkles, Search, Target, Calendar,
  FileText, BarChart3, Wand2, Bot, Activity, Layers,
  Globe2, ShieldCheck, Workflow, LineChart, Menu, X,
  Check, Zap, Quote, TrendingUp, Clock, Star,
  ChevronDown, Play, DollarSign,
} from "lucide-react";

/* ─────────────────────── useInView hook ─────────────────────── */

function useInView(threshold = 0.1): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

/* ─────────────────────── Static data ─────────────────────── */

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
    sub: "Find what ranks",
    title: "Keyword Intelligence",
    desc: "Live Ahrefs + DataForSEO data. Intent classified. Funnel-mapped. Filtered against your brief so every keyword has a real reason to rank.",
  },
  {
    icon: Target,
    sub: "Own your competitors' traffic",
    title: "Gap Analysis",
    desc: "Crawl competitors, surface weak pages, surface opportunities you can ship before they catch up.",
  },
  {
    icon: Workflow,
    sub: "Ship without the chaos",
    title: "AI Editorial Calendar",
    desc: "30-day calendar fills itself. Drag to reschedule. AI suggests cadence based on your capacity.",
  },
  {
    icon: Wand2,
    sub: "Content Google rewards",
    title: "AI Content Studio",
    desc: "Blogs, ebooks, whitepapers, LinkedIn — with JSON-LD schema, internal links, and E-E-A-T citations baked in.",
  },
  {
    icon: Activity,
    sub: "Never lose a ranking silently",
    title: "Content Health Audit",
    desc: "Auto-audit live URLs. Fix priorities ranked by traffic impact. Built for AI Overviews coverage.",
  },
  {
    icon: Bot,
    sub: "Strategy on tap",
    title: "Contextual AI Copilot",
    desc: "Lives on every page. Knows your brief, keywords, competitors, and calendar — gives specific advice, not generic prompts.",
  },
];

const workflowOutcomes = [
  {
    phase: "Day 1",
    icon: Globe2,
    title: "Brief your business in 15 min",
    desc: "Paste your domain. Add 2–3 competitors. Describe your product. Rankshoot scrapes, synthesizes, and briefs everything else automatically.",
    outcome: "Your competitive landscape, mapped.",
  },
  {
    phase: "Week 1",
    icon: Search,
    title: "AI discovers 200+ ranked keywords",
    desc: "Live data from Ahrefs + DataForSEO, filtered to keywords your business can realistically rank for — sorted by traffic opportunity.",
    outcome: "Your first keyword set, ready to approve.",
  },
  {
    phase: "Month 1",
    icon: TrendingUp,
    title: "Content published, traffic climbing",
    desc: "Every approved keyword becomes a GEO+SEO-optimised blog. Your 30-day calendar fills. Organic sessions start climbing week-over-week.",
    outcome: "Real traffic. Real rankings.",
  },
  {
    phase: "Month 3+",
    icon: Zap,
    title: "Compounding organic growth",
    desc: "Each piece builds authority for the next. Rankings compound. AI Overviews coverage grows. Your competitors can't catch up manually.",
    outcome: "The flywheel spins — you don't have to.",
  },
];

const stats = [
  { value: "94%", label: "AI Overviews coverage" },
  { value: "10×", label: "Faster to published" },
  { value: "30+", label: "SEO checks per asset" },
  { value: "5", label: "Content formats" },
];

const integrations = [
  { name: "Ahrefs", role: "Keyword + backlink intelligence" },
  { name: "DataForSEO", role: "SERP + search volume data" },
  { name: "Serper", role: "Live SERP + People Also Ask" },
  { name: "Jina Reader", role: "Competitor page crawling" },
  { name: "Google KP", role: "Keyword demand validation" },
  { name: "AI Engine", role: "Brief synthesis + long-form content" },
  { name: "JSON-LD", role: "Article + FAQ schema, auto-injected" },
];

const navItems = [
  { label: "Features", href: "#features" },
  { label: "Workflow", href: "#workflow" },
  { label: "Demo", href: "#preview" },
  { label: "Blog", href: "/blog" },
  { label: "Pricing", href: "#pricing" },
];

const testimonials = [
  {
    quote: "Rankshoot cut our content production time by 70%. We went from one blog a week to five — and our organic traffic doubled in 90 days.",
    name: "Sarah Chen",
    title: "Head of Content",
    company: "Acme SaaS",
    avatar: "SC",
    stars: 5,
  },
  {
    quote: "The AI Overview coverage is real. 8 of 10 articles we generated show up in Google's AI answers within 30 days of publishing.",
    name: "Marcus Rodriguez",
    title: "SEO Lead",
    company: "GrowthLabs",
    avatar: "MR",
    stars: 5,
  },
  {
    quote: "We replaced 4 separate SEO tools with Rankshoot. The contextual copilot alone saves our team 20+ hours per week of back-and-forth.",
    name: "Priya Sharma",
    title: "Marketing Director",
    company: "TechFlow Inc.",
    avatar: "PS",
    stars: 5,
  },
];

const painPoints = [
  {
    icon: DollarSign,
    cost: "$500+/mo",
    costLabel: "in fragmented tools",
    title: "Paying for 5 tools that don't talk to each other",
    details: [
      { tool: "Ahrefs", price: "$149/mo", note: "just for keyword data" },
      { tool: "Clearscope", price: "$189/mo", note: "just to optimize content" },
      { tool: "ChatGPT Pro", price: "$20/mo", note: "+ hours of prompt writing" },
    ],
    fix: "Rankshoot replaces all three — keyword discovery, AI writing, and optimization — starting at a fraction of the cost.",
  },
  {
    icon: Clock,
    cost: "15+ hrs",
    costLabel: "lost every week",
    title: "Manual research that should take 15 minutes",
    details: [
      { tool: "Keyword research", price: "4–6 hrs", note: "spreadsheet wrangling" },
      { tool: "Competitor analysis", price: "3–4 hrs", note: "manual crawling" },
      { tool: "Brief writing", price: "2–3 hrs", note: "before a word is written" },
    ],
    fix: "Rankshoot automates every step from domain input to publish-ready brief — in under 15 minutes.",
  },
  {
    icon: BarChart3,
    cost: "73%",
    costLabel: "of content earns zero clicks",
    title: "Publishing into the void with no demand signal",
    details: [
      { tool: "No keyword validation", price: "zero traffic", note: "pure guesswork" },
      { tool: "No SEO structure", price: "no ranking", note: "missing schema & links" },
      { tool: "No AI Overview focus", price: "invisible", note: "in 2026 search results" },
    ],
    fix: "Every Rankshoot blog targets verified demand, ships with JSON-LD schema, and is optimised for AI Overviews by default.",
  },
];

const faqs = [
  {
    q: "How is Rankshoot different from Surfer SEO or Clearscope?",
    a: "Surfer and Clearscope are content optimization tools — you still find keywords, write, and manage publishing separately. Rankshoot is end-to-end: keyword discovery → competitor analysis → calendar → AI content generation → audit → publish. One pipeline, all informed by your business brief.",
  },
  {
    q: "How long does setup take?",
    a: "Under 15 minutes. Paste your domain, add 2–3 competitors, describe your audience — Rankshoot builds your brief automatically, crawls your competitive landscape, and surfaces your first high-ROI keyword opportunities. No API configuration required.",
  },
  {
    q: "Can I publish directly from Rankshoot to my CMS?",
    a: "Rankshoot exports in 5 formats: Markdown, HTML, DOCX, plain text, and structured JSON with metadata. One-click CMS integrations are on the roadmap. The structured output makes copy-pasting into any CMS a 2-minute job.",
  },
  {
    q: "Is my content data secure?",
    a: "Yes. All data is stored with enterprise-grade security, isolated per project with row-level access control. Your business brief and generated content are never used to train AI models.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Absolutely. Month-to-month billing, no contracts, cancel from your dashboard in 30 seconds. Cancel within your 14-day trial and you're never charged. We want you to stay because Rankshoot works — not because you forgot to unsubscribe.",
  },
];

/* Integration color marks */
const integrationLogos = [
  {
    name: "Ahrefs",
    logoUrl: "https://logo.clearbit.com/ahrefs.com",
    abbr: "Ah",
    color: "#F97316",
    bg: "rgba(249,115,22,0.10)",
  },
  {
    name: "DataForSEO",
    logoUrl: "https://logo.clearbit.com/dataforseo.com",
    abbr: "DS",
    color: "#3B82F6",
    bg: "rgba(59,130,246,0.10)",
  },
  {
    name: "Serper",
    logoUrl: "https://logo.clearbit.com/serper.dev",
    abbr: "Se",
    color: "#10B981",
    bg: "rgba(16,185,129,0.10)",
  },
  {
    name: "Jina Reader",
    logoUrl: "https://logo.clearbit.com/jina.ai",
    abbr: "Ji",
    color: "#8B5CF6",
    bg: "rgba(139,92,246,0.10)",
  },
  {
    name: "Google KP",
    logoUrl: "https://www.google.com/s2/favicons?domain=google.com&sz=64",
    abbr: "G",
    color: "#EA4335",
    bg: "rgba(234,67,53,0.10)",
  },
];
const marqueItems = [...integrationLogos, ...integrationLogos];

/* ─────────────────────── Page shell ─────────────────────── */

export default function LandingPage() {
  const scrolled = useScrolledPast(60);
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <main className="relative bg-surface-primary text-text-primary overflow-x-hidden">
      <BackgroundFx />
      <Nav scrolled={scrolled} mobileMenu={mobileMenu} setMobileMenu={setMobileMenu} />
      <Hero />
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
      <Footer />
    </main>
  );
}

/* ─────────────────────── BackgroundFx ─────────────────────── */

function BackgroundFx() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.55] dark:opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.08) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at top, black 25%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at top, black 25%, transparent 75%)",
        }}
      />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[640px] w-[1100px] rounded-full bg-brand-violet/25 dark:bg-brand-violet/12 blur-[140px] animate-pulse-glow" />
      <div className="absolute top-[40%] left-[8%] h-[420px] w-[420px] rounded-full bg-brand-aqua/18 dark:bg-brand-aqua/8 blur-[120px] animate-pulse-glow delay-300" />
      <div className="absolute bottom-[-160px] right-[6%] h-[480px] w-[480px] rounded-full bg-brand-violet-soft/18 dark:bg-brand-violet-soft/10 blur-[140px] animate-pulse-glow delay-500" />
    </div>
  );
}

/* ─────────────────────── Nav — floating pill on scroll ─────────────────────── */

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
    <nav className="fixed inset-x-0 top-0 z-50">
      {/* ── Inner container morphs from full-width to floating pill ── */}
      <div
        className={`mx-auto flex items-center backdrop-blur-md justify-between transition-all duration-500 ease-out ${
          scrolled
            ? "mt-3 max-w-[1100px] rounded-full bg-glass border border-border-subtle px-5 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
            : "max-w-[1240px] border-none px-6 py-4"
        }`}
      >
        {/* Logo */}
        <Link href="/" className="shrink-0 group">
          <span
            className="inline-block transition-all duration-300 group-hover:scale-[1.04]"
            style={{ transformOrigin: "left center" }}
          >
            <Logo size="md" priority />
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-0.5 md:flex">
          {navItems.map(item => (
            <a
              key={item.label}
              href={item.href}
              className="group relative px-3.5 py-2 text-[13.5px] font-medium text-text-secondary transition-colors duration-150 hover:text-text-primary rounded-lg hover:bg-surface-hover"
            >
              {item.label}
              <span className="absolute bottom-1.5 left-1/2 h-[2px] w-0 -translate-x-1/2 rounded-full bg-brand-violet transition-all duration-200 group-hover:w-4" />
            </a>
          ))}
        </div>

        {/* Right side CTAs */}
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
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-violet px-4 py-2 text-[13.5px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover hover:shadow-[var(--shadow-glow-md)]"
            >
              Get started <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-violet px-4 py-2 text-[13.5px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover"
            >
              Dashboard <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <UserButton />
          </SignedIn>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileMenu(!mobileMenu)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover md:hidden"
          aria-label="Toggle menu"
        >
          {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile slide-down */}
      <div
        className="overflow-hidden transition-all duration-300 ease-out md:hidden mx-3 mt-1"
        style={{ maxHeight: mobileMenu ? "460px" : "0" }}
      >
        <div className="rounded-2xl bg-glass border border-border-subtle shadow-[var(--shadow-lg)]">
          <div className="flex flex-col gap-1 p-4">
            {navItems.map(item => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMobileMenu(false)}
                className="rounded-xl px-4 py-3 text-[14px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-4">
              <SignedOut>
                <Link href="/sign-in" className="py-2 text-center text-[14px] font-medium text-text-secondary">
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-violet px-4 py-2.5 text-[14px] font-semibold text-white"
                >
                  Get started <ArrowRight className="h-4 w-4" />
                </Link>
              </SignedOut>
              <SignedIn>
                <Link
                  href="/projects"
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-violet px-4 py-2.5 text-[14px] font-semibold text-white"
                >
                  Dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              </SignedIn>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

/* ─────────────────────── Hero ─────────────────────── */

function Hero() {
  return (
    <section className="relative px-4 pt-28 pb-16 sm:px-6 sm:pt-36 sm:pb-24" id="hero">
      <div className="mx-auto max-w-[960px] text-center">
        {/* Headline */}
        <h1 className="animate-fade-in-up mt-2 text-balance text-4xl font-semibold tracking-[-0.035em] leading-[1.04] sm:text-5xl lg:text-[76px]">
          Rank higher. Publish faster.<br />
          <span className="gradient-text">Automate everything.</span>
        </h1>

        <p className="animate-fade-in-up delay-100 mx-auto mt-6 max-w-[620px] text-balance text-[16px] leading-relaxed text-text-secondary sm:text-[18px]">
          Rankshoot discovers your best keywords, writes SEO-optimized content, and tracks your rankings — all in one place. From zero to ranked in days, not months.
        </p>

        {/* CTAs */}
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

        {/* Animated workflow cards */}
        <div className="animate-fade-in-up delay-400 relative mx-auto mt-14 max-w-[900px]">
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-px sm:overflow-hidden sm:rounded-[20px] sm:border sm:border-border-subtle sm:bg-border-subtle sm:shadow-[var(--shadow-md)]">
            {stats.map(stat => (
              <div key={stat.label} className="rounded-[16px] border border-border-subtle bg-surface-elevated p-5 text-center sm:rounded-none sm:border-none">
                <div className="text-3xl font-semibold tracking-tight gradient-text">{stat.value}</div>
                <div className="mt-1 text-[12px] leading-relaxed text-text-tertiary">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Floating workflow preview cards */}
          <div className="pointer-events-none mt-8 hidden lg:block">
            <div className="relative h-[120px]">
              {/* Card 1 */}
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

              {/* Card 2 */}
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

              {/* Card 3 */}
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

/* ─────────────────────── PoweredBy marquee ─────────────────────── */

function IntegrationLogo({
  item,
}: {
  item: typeof integrationLogos[number];
}) {
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
        <span
          className="text-[11px] font-bold"
          style={{ color: item.color }}
        >
          {item.abbr}
        </span>
      )}
    </span>
  );
}

function PoweredBy() {
  return (
    <section className="border-y border-border-subtle/70 bg-surface-secondary/40 py-5 overflow-hidden">
      <div className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
        Powered by the same data sources top-ranking teams rely on
      </div>
      <div className="relative flex overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-surface-secondary/80 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-surface-secondary/80 to-transparent" />
        <div className="animate-marquee gap-10 items-center">
          {marqueItems.map((item, i) => (
            <span
              key={`${item.name}-${i}`}
              className="shrink-0 flex items-center gap-2.5"
            >
              <IntegrationLogo item={item} />
              <span className="text-[13.5px] font-semibold text-text-secondary whitespace-nowrap">
                {item.name}
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── PainSection ─────────────────────── */

function PainSection() {
  const [ref, inView] = useInView();
  return (
    <section className="px-4 py-24 sm:px-6" id="pain">
      <div className="mx-auto max-w-[1240px]">
        <div
          ref={ref}
          className={`text-center transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-status-danger/30 bg-status-danger/8 px-3.5 py-1.5 text-[12.5px] font-medium text-status-danger">
            The real cost of manual SEO
          </div>
          <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight leading-[1.1] sm:text-4xl lg:text-[44px]">
            You're paying $500+/month for tools <br className="hidden sm:block" />
            <span className="text-status-danger">that still don't do the work.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-[560px] text-[15px] leading-relaxed text-text-secondary">
            Builders who make great products often struggle to get found online. Here's what the status quo is actually costing you:
          </p>
        </div>

        <div
          className={`mt-14 grid gap-6 md:grid-cols-3 transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          {painPoints.map((point, i) => (
            <div
              key={point.title}
              className="relative flex flex-col overflow-hidden rounded-[20px] border border-border-subtle bg-surface-elevated shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-md)]"
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              {/* Red accent line */}
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-status-danger/50 to-transparent" />

              <div className="p-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-status-danger/20 bg-status-danger/10 text-status-danger">
                    <point.icon className="h-5 w-5" />
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold tracking-tight text-status-danger">{point.cost}</div>
                    <div className="text-[11px] text-text-tertiary">{point.costLabel}</div>
                  </div>
                </div>

                <h3 className="mt-4 text-[15.5px] font-semibold text-text-primary">{point.title}</h3>

                {/* Line-item breakdown */}
                <div className="mt-4 space-y-2 rounded-xl border border-border-subtle bg-surface-secondary/60 p-3">
                  {point.details.map(d => (
                    <div key={d.tool} className="flex items-center justify-between text-[12px]">
                      <span className="text-text-secondary">{d.tool}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-status-danger">{d.price}</span>
                        <span className="text-text-tertiary hidden sm:block">{d.note}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fix callout */}
              <div className="mt-auto border-t border-brand-violet/15 bg-brand-violet/6 px-7 py-4">
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-violet" />
                  <p className="text-[12.5px] leading-relaxed text-brand-violet">{point.fix}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          className={`mt-12 flex justify-center transition-all duration-700 delay-400 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-full bg-brand-violet px-6 py-3 text-[14px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow-md)]"
          >
            See the better way <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── FeaturesGrid ─────────────────────── */

function FeaturesGrid() {
  const [ref, inView] = useInView();
  return (
    <section id="features" className="px-4 py-28 bg-surface-secondary/20 sm:px-6">
      <div className="mx-auto max-w-[1240px]">
        <div
          ref={ref}
          className={`transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <SectionEyebrow icon={<Layers className="h-3.5 w-3.5" />} label="Platform" />
          <SectionTitle>
            Everything to rank,{" "}
            <span className="gradient-text">nothing to babysit.</span>
          </SectionTitle>
          <SectionSub>
            Every module shares the same brief, live data, and AI context — so each step builds on the last automatically.
          </SectionSub>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[20px] border border-border-subtle bg-border-subtle shadow-[var(--shadow-md)] sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feat, i) => (
            <div
              key={feat.title}
              className={`group relative bg-surface-elevated p-7 transition-all duration-500 hover:bg-surface-hover ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
              style={{ transitionDelay: inView ? `${i * 80}ms` : "0ms" }}
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-violet/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-surface-secondary text-brand-violet shadow-[var(--shadow-xs)] transition-all duration-300 group-hover:border-brand-violet/30 group-hover:bg-brand-violet/10 group-hover:shadow-[var(--shadow-glow-sm)]">
                <feat.icon className="h-4.5 w-4.5" />
              </div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-brand-violet">{feat.sub}</div>
              <h3 className="mt-1.5 text-[15.5px] font-semibold tracking-tight text-text-primary">{feat.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-text-tertiary">{feat.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── WorkflowSection — outcome-focused ─────────────────────── */

function WorkflowSection() {
  const [ref, inView] = useInView();
  return (
    <section id="workflow" className="px-4 py-28 sm:px-6">
      <div className="mx-auto max-w-[1240px]">
        <div
          ref={ref}
          className={`transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <SectionEyebrow icon={<Workflow className="h-3.5 w-3.5" />} label="How it works" />
          <SectionTitle>
            From zero traffic to{" "}
            <span className="gradient-text">compounding rankings.</span>
          </SectionTitle>
          <SectionSub>
            Most product builders are great at what they build — but invisible on Google. Rankshoot changes that in 4 steps, with measurable outcomes at every stage.
          </SectionSub>
        </div>

        <div className="relative mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Connector line (desktop) */}
          <div className="absolute left-[calc(12.5%+2rem)] right-[calc(12.5%+2rem)] top-8 hidden h-px bg-gradient-to-r from-transparent via-brand-violet/25 to-transparent lg:block" />

          {workflowOutcomes.map((step, i) => (
            <div
              key={step.phase}
              className={`relative overflow-hidden rounded-[20px] border border-border-subtle bg-surface-elevated p-6 shadow-[var(--shadow-sm)] transition-all duration-700 hover:-translate-y-1 hover:shadow-[var(--shadow-md)] ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
              style={{ transitionDelay: inView ? `${i * 120}ms` : "0ms" }}
            >
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-brand-violet/60 to-transparent" />
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-brand-violet/25 bg-brand-violet/10 px-2.5 py-0.5 text-[11px] font-bold text-brand-violet">
                  {step.phase}
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-violet/10 text-brand-violet">
                  <step.icon className="h-4 w-4" />
                </div>
              </div>
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-text-primary">{step.title}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-text-tertiary">{step.desc}</p>
              {/* Outcome chip */}
              <div className="mt-4 flex items-center gap-1.5 rounded-lg border border-brand-violet/20 bg-brand-violet/6 px-3 py-1.5">
                <Check className="h-3 w-3 shrink-0 text-brand-violet" />
                <span className="text-[11px] font-medium text-brand-violet">{step.outcome}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── DashboardPreview ─────────────────────── */

function DashboardPreview() {
  const [ref, inView] = useInView(0.05);
  return (
    <section id="preview" className="px-4 py-28 bg-surface-secondary/20 sm:px-6">
      <div className="mx-auto max-w-[1240px]">
        <div
          ref={ref}
          className={`transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <SectionEyebrow icon={<BarChart3 className="h-3.5 w-3.5" />} label="Live preview" />
          <SectionTitle>
            A workspace that thinks{" "}
            <span className="gradient-text">like your SEO team.</span>
          </SectionTitle>
          <SectionSub>
            Every module is aware of the others — keywords inform content, content informs the calendar, audits inform priorities.
          </SectionSub>
        </div>

        <div
          className={`mt-14 overflow-hidden rounded-[20px] border border-border-default bg-surface-secondary shadow-[var(--shadow-xl)] transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          {/* Window chrome */}
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

          <div className="grid min-h-[500px] grid-cols-1 lg:grid-cols-[220px_1fr_280px]">
            {/* Sidebar */}
            <aside className="hidden border-r border-border-subtle bg-surface-secondary p-4 lg:block">
              <div className="mb-6 flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated p-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-violet/15 text-[11px] font-bold text-brand-violet">AC</div>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-text-primary">Acme Recruit</div>
                  <div className="truncate font-mono text-[10.5px] text-text-tertiary">acmerecruit.io</div>
                </div>
              </div>
              <div className="space-y-1">
                {[
                  { icon: BarChart3, label: "Overview" },
                  { icon: Search, label: "Keywords", active: true, count: "248" },
                  { icon: Wand2, label: "Content Studio" },
                  { icon: Target, label: "Competitors" },
                  { icon: Activity, label: "Content Health", count: "12" },
                  { icon: Calendar, label: "Calendar" },
                  { icon: FileText, label: "Blogs", count: "32" },
                ].map(item => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] font-medium ${item.active ? "border border-border-subtle bg-surface-elevated text-brand-violet shadow-[var(--shadow-xs)]" : "text-text-secondary"}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    {item.count && (
                      <span className="rounded border border-border-subtle bg-surface-tertiary px-1.5 py-0.5 text-[10px] text-text-tertiary">{item.count}</span>
                    )}
                  </div>
                ))}
              </div>
            </aside>

            {/* Main */}
            <div className="flex flex-col gap-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[17px] font-semibold tracking-tight">Keyword opportunities</div>
                  <div className="mt-0.5 text-[12px] text-text-tertiary">248 keywords · 34 high-opportunity</div>
                </div>
                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className="rounded-full border border-border-subtle bg-surface-elevated px-2.5 py-1 text-text-tertiary">All funnels</span>
                  <span className="rounded-full border border-brand-violet/30 bg-brand-violet/10 px-2.5 py-1 text-brand-violet">Score &gt; 70</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Keywords", value: "248", change: "+12%", icon: Search },
                  { label: "Gaps found", value: "34", change: "+8", icon: Layers },
                  { label: "Approved", value: "62", change: "+5", icon: Check },
                  { label: "Blogs ready", value: "18", change: "+3", icon: FileText },
                ].map(m => (
                  <div key={m.label} className="rounded-xl border border-border-subtle bg-surface-elevated p-3">
                    <div className="flex items-center justify-between text-text-tertiary">
                      <span className="text-[10px] uppercase tracking-wider">{m.label}</span>
                      <m.icon className="h-3 w-3" />
                    </div>
                    <div className="mt-2 text-[20px] font-semibold tracking-tight text-text-primary">{m.value}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-status-success">{m.change}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated">
                <div className="grid grid-cols-[2fr_0.7fr_0.9fr_0.8fr_0.7fr] gap-3 border-b border-border-subtle px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                  <span>Keyword</span><span>Volume</span><span>Difficulty</span><span>Trend</span><span className="text-right">Score</span>
                </div>
                {mockKeywords.map(k => (
                  <div
                    key={k.keyword}
                    className="grid grid-cols-[2fr_0.7fr_0.9fr_0.8fr_0.7fr] items-center gap-3 border-b border-border-subtle px-4 py-2.5 text-[12px] last:border-b-0 hover:bg-surface-hover"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-text-primary">{k.keyword}</div>
                      <div className="mt-0.5 text-[10px] text-text-tertiary">{k.intent}</div>
                    </div>
                    <span className="font-mono text-text-secondary">{k.volume}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
                        <div
                          className={`h-full rounded-full ${k.difficulty < 40 ? "bg-status-success" : k.difficulty < 60 ? "bg-status-warning" : "bg-status-danger"}`}
                          style={{ width: `${k.difficulty}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-text-tertiary">{k.difficulty}</span>
                    </div>
                    <span className="font-medium text-status-success">{k.trend}</span>
                    <div className="text-right">
                      <span className="inline-flex rounded-full border border-brand-violet/30 bg-brand-violet/10 px-2 py-0.5 text-[11px] font-bold text-brand-violet">{k.score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI rail */}
            <aside className="hidden border-l border-border-subtle bg-surface-secondary p-4 lg:block">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
                <span className="ai-orb" /> Copilot
              </div>
              <div className="mt-4 space-y-3 text-[12.5px]">
                <div className="rounded-xl border border-border-subtle bg-surface-elevated p-3 text-text-secondary">
                  I noticed <span className="text-text-primary">5 BOFU keywords</span> trending +24%. Want me to draft a comparison post for{" "}
                  <span className="text-brand-violet">"AI recruitment platform"</span>?
                </div>
                <div className="space-y-2">
                  {[
                    { icon: Sparkles, label: "Draft comparison post" },
                    { icon: Wand2, label: "Schedule next 30 days" },
                    { icon: LineChart, label: "Show keyword clusters" },
                  ].map(btn => (
                    <button key={btn.label} className="flex w-full items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-left text-[12px] text-text-secondary hover:bg-surface-hover">
                      <btn.icon className="h-3.5 w-3.5 text-brand-violet" />
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── AssistantShowcase — end-to-end pipeline ─────────────────────── */

function PipelineStep({
  icon: Icon,
  label,
  sublabel,
  active,
  done,
  isLast,
}: {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  active: boolean;
  done: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 relative flex-1 min-w-0">
      {/* Circle */}
      <div
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-500 ${
          active
            ? "border-brand-violet bg-brand-violet/20 shadow-[var(--shadow-glow-sm)] scale-110"
            : done
            ? "border-brand-violet/60 bg-brand-violet/10"
            : "border-border-subtle bg-surface-elevated"
        }`}
      >
        {active && (
          <span className="absolute inset-0 rounded-full border-2 border-brand-violet animate-ping-slow" />
        )}
        <Icon className={`h-4 w-4 transition-colors duration-300 ${active || done ? "text-brand-violet" : "text-text-tertiary"}`} />
      </div>
      {/* Connecting line */}
      {!isLast && (
        <div className="absolute left-[calc(50%+20px)] right-[calc(-50%+20px)] top-5 h-px overflow-hidden bg-border-subtle">
          <div
            className="h-full bg-brand-violet transition-all duration-700"
            style={{ width: done ? "100%" : "0%" }}
          />
        </div>
      )}
      {/* Label */}
      <div className="text-center">
        <div className={`text-[11px] font-semibold transition-colors duration-300 ${active || done ? "text-text-primary" : "text-text-tertiary"}`}>
          {label}
        </div>
        <div className="mt-0.5 text-[10px] text-text-tertiary hidden sm:block">{sublabel}</div>
      </div>
    </div>
  );
}

function AutomationPipeline() {
  const [activeStep, setActiveStep] = useState(0);
  const steps = [
    { icon: Globe2, label: "Domain", sublabel: "Your site" },
    { icon: Search, label: "Keywords", sublabel: "200+ found" },
    { icon: Target, label: "Best 10", sublabel: "AI-picked" },
    { icon: Wand2, label: "Content", sublabel: "Written" },
    { icon: TrendingUp, label: "Ranking", sublabel: "↑ Live" },
  ];

  useEffect(() => {
    const t = setInterval(() => {
      setActiveStep(s => (s + 1) % steps.length);
    }, 1600);
    return () => clearInterval(t);
  }, []);

  const outputs = [
    "Scanning your domain and competitors…",
    "Found 248 keywords. 34 score above 80.",
    "Selected top 10 by traffic opportunity.",
    "Generating 2,400-word SEO blog with schema…",
    "Content live. Ranking #3 in 14 days. ✓",
  ];

  return (
    <div className="space-y-6">
      {/* Pipeline visual */}
      <div className="relative flex items-start justify-between gap-1 px-2 pt-4">
        {steps.map((s, i) => (
          <PipelineStep
            key={s.label}
            icon={s.icon}
            label={s.label}
            sublabel={s.sublabel}
            active={i === activeStep}
            done={i < activeStep}
            isLast={i === steps.length - 1}
          />
        ))}
      </div>

      {/* Status output */}
      <div className="rounded-xl border border-border-subtle bg-surface-secondary/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="ai-orb" />
          <span className="text-[12.5px] text-text-secondary transition-all duration-300">{outputs[activeStep]}</span>
        </div>
      </div>
    </div>
  );
}

function AssistantShowcase() {
  const [ref, inView] = useInView();
  return (
    <section id="assistant" className="px-4 py-28 sm:px-6">
      <div className="mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
        {/* Left text */}
        <div
          ref={ref}
          className={`transition-all duration-700 ${inView ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}`}
        >
          <SectionEyebrow icon={<Bot className="h-3.5 w-3.5" />} label="One-click automation" />
          <SectionTitle className="text-balance">
            From your domain to{" "}
            <span className="gradient-text">page-one rankings.</span>{" "}
            Automatically.
          </SectionTitle>
          <SectionSub className="max-w-none">
            You built a great product. But Google doesn't know it exists. Rankshoot automates the entire journey — from discovering what people search for, to writing the content that ranks for it, to publishing it — without you touching a single spreadsheet.
          </SectionSub>

          <ul className="mt-8 space-y-3">
            {[
              { icon: Search, text: "Discovers 200+ keywords your audience actually searches for" },
              { icon: Target, text: "AI picks the top 10 with highest traffic opportunity for your site" },
              { icon: Wand2, text: "Writes SEO-optimized content with JSON-LD schema and internal links" },
              { icon: Activity, text: "Audits every published page and fixes what's losing rankings" },
              { icon: TrendingUp, text: "Your organic traffic grows every week — compounding automatically" },
            ].map(item => (
              <li key={item.text} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-elevated text-brand-violet shadow-[var(--shadow-xs)]">
                  <item.icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[14px] leading-relaxed text-text-secondary">{item.text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <SignedOut>
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-full bg-brand-violet px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow-md)]"
              >
                Start automating <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </SignedOut>
            <SignedIn>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 rounded-full bg-brand-violet px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5"
              >
                Open dashboard <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </SignedIn>
          </div>
        </div>

        {/* Right: pipeline animation */}
        <div
          className={`relative transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}
        >
          <div className="absolute inset-0 -z-10 rounded-[20px] bg-brand-violet/15 blur-3xl" />
          <div className="bg-glass space-y-5 overflow-hidden rounded-[20px] border border-border-subtle p-6 shadow-[var(--shadow-xl)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div className="flex items-center gap-2">
                <span className="ai-orb" />
                <span className="text-[13px] font-semibold">Automation pipeline</span>
              </div>
              <span className="rounded-full border border-status-success/30 bg-status-success/10 px-2 py-0.5 text-[10.5px] font-medium text-status-success">
                Running
              </span>
            </div>

            {/* Animated pipeline */}
            <AutomationPipeline />

            {/* One-click CTA mock */}
            <div className="rounded-xl border border-brand-violet/25 bg-brand-violet/8 p-4">
              <div className="text-[12px] font-medium text-text-secondary mb-3">
                Ready to publish — 1 action needed:
              </div>
              <button className="w-full rounded-full bg-brand-violet py-2.5 text-[13px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:bg-brand-action-hover hover:shadow-[var(--shadow-glow-md)]">
                <span className="flex items-center justify-center gap-2">
                  <Zap className="h-4 w-4" />
                  Publish all 10 articles
                </span>
              </button>
              <div className="mt-2 text-center text-[10.5px] text-text-tertiary">
                Generates · audits · schedules · publishes in sequence
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── TestimonialsSection ─────────────────────── */

function TestimonialsSection() {
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

/* ─────────────────────── IntegrationsRow ─────────────────────── */

function IntegrationsRow() {
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

/* ─────────────────────── FAQSection ─────────────────────── */

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
      <div
        style={{ maxHeight: open ? "400px" : "0", overflow: "hidden", transition: "max-height 0.35s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <p className="pb-5 text-[14.5px] leading-relaxed text-text-secondary">{a}</p>
      </div>
    </div>
  );
}

function FAQSection() {
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
          <SectionSub className="mx-auto text-center">
            Common questions from teams evaluating Rankshoot.
          </SectionSub>
        </div>
        <div
          className={`mt-10 rounded-[20px] border border-border-subtle bg-surface-elevated px-6 py-2 shadow-[var(--shadow-sm)] transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          {faqs.map(faq => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── PricingSection ─────────────────────── */

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
      .then(data => { if (active) setPricingData(data); })
      .catch(err => { console.error("Failed to load pricing:", err); })
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

/* ─────────────────────── FinalCTA ─────────────────────── */

function FinalCTA() {
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

/* ─────────────────────── Footer ─────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-border-subtle px-4 py-16 sm:px-6">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="max-w-[320px]">
          <Logo size="md" />
          <p className="mt-4 text-[13px] leading-relaxed text-text-tertiary">{BRAND.description}</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-brand-violet/20 bg-brand-violet/8 px-3 py-1.5 text-[11.5px] font-medium text-brand-violet">
            <span className="ai-orb" /> AI Overviews optimized
          </div>
        </div>
        {[
          {
            heading: "Product",
            links: [
              { label: "Features", href: "#features" },
              { label: "Workflow", href: "#workflow" },
              { label: "AI Copilot", href: "#assistant" },
              { label: "Pricing", href: "#pricing" },
              { label: "Live demo", href: "#preview" },
            ],
          },
          {
            heading: "Resources",
            links: [
              { label: "Blog", href: "/blog" },
              { label: "Changelog", href: "/changelog" },
              { label: "Documentation", href: "/docs" },
              { label: "API reference", href: "/api-docs" },
              { label: "Status", href: "/status" },
            ],
          },
          {
            heading: "Company",
            links: [
              { label: "About", href: "/about" },
              { label: "Privacy policy", href: "/privacy" },
              { label: "Terms of service", href: "/terms" },
              { label: "Contact", href: "/contact" },
              { label: "FAQ", href: "#faq" },
            ],
          },
        ].map(col => (
          <div key={col.heading}>
            <h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-secondary">{col.heading}</h4>
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
        <span className="flex items-center gap-5">
          <a href="/privacy" className="hover:text-text-primary transition-colors">Privacy</a>
          <a href="/terms" className="hover:text-text-primary transition-colors">Terms</a>
        </span>
      </div>
    </footer>
  );
}

/* ─────────────────────── Shared helpers ─────────────────────── */

function ChatBubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${isUser ? "bg-text-primary text-surface-primary" : "border border-border-subtle bg-surface-elevated text-text-primary"}`}>
        {children}
      </div>
    </div>
  );
}

function SectionEyebrow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary shadow-[var(--shadow-xs)]">
      <span className="text-brand-violet">{icon}</span>
      {label}
    </div>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`mt-4 text-balance text-4xl font-semibold tracking-[-0.028em] leading-[1.08] sm:text-[44px] ${className ?? ""}`}>
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
