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
  ChevronDown, Play, Shield, BookOpen,
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
    sub: "Find what ranks before you write",
    title: "Keyword Intelligence",
    desc: "Real DataForSEO + Ahrefs traffic data with intent classification, TOFU/MOFU/BOFU funnel mapping, and semantic filtering against your business brief.",
  },
  {
    icon: Target,
    sub: "Steal rankings from the inside",
    title: "Competitor Gap Analysis",
    desc: "Crawl competitors with Jina + Serper, surface ranking gaps, weak pages, and content opportunities you can ship before they catch up.",
  },
  {
    icon: Workflow,
    sub: "Never stare at a blank week again",
    title: "AI Editorial Calendar",
    desc: "AI-suggested publishing schedule with drag-and-drop controls, automatic generation queues, and smart cadence recommendations based on your capacity.",
  },
  {
    icon: Wand2,
    sub: "Publish what Google rewards",
    title: "AI Content Studio",
    desc: "Blogs, ebooks, whitepapers, LinkedIn posts — each with Article + FAQ JSON-LD, internal links from your brief, and inline citations for E-E-A-T.",
  },
  {
    icon: Activity,
    sub: "Fix before you lose the traffic",
    title: "Content Health Audit",
    desc: "Auto-audit live URLs, surface broken pages, score keyword demand decay, and rank fix priorities by traffic impact — built for AI Overviews in 2026.",
  },
  {
    icon: Bot,
    sub: "Strategy help, everywhere you need it",
    title: "Contextual AI Copilot",
    desc: "Embedded on every page — it knows your brief, keyword set, competitors, and calendar — so it gives specific advice, not generic prompts.",
  },
];

const workflowSteps = [
  {
    num: "01",
    icon: Globe2,
    title: "Brief your business in minutes",
    desc: "Drop your domain, audience, and competitors. Rankshoot auto-scrapes and synthesizes your full competitive landscape.",
  },
  {
    num: "02",
    icon: Search,
    title: "Discover real demand",
    desc: "Live DataForSEO + Ahrefs research, classified by funnel stage and filtered against your brief — only high-ROI keywords make the cut.",
  },
  {
    num: "03",
    icon: Calendar,
    title: "Approve and schedule",
    desc: "Pick the winners, drop them into the AI-generated calendar. One click fills 30 days of publishing slots.",
  },
  {
    num: "04",
    icon: Zap,
    title: "Ship ranked content",
    desc: "Generate, audit, repair, and publish GEO + SEO optimised content in 5 formats — no editing required.",
  },
];

const stats = [
  { value: "94%", label: "AI Overviews coverage on generated content" },
  { value: "10×", label: "Faster keyword-to-published cycle" },
  { value: "30+", label: "Built-in SEO + GEO checks per asset" },
  { value: "5", label: "Premium content formats out of the box" },
];

const integrations = [
  { name: "Ahrefs", role: "Primary keyword + backlink data" },
  { name: "DataForSEO", role: "SERP + keyword intelligence" },
  { name: "Serper", role: "Live SERP + People Also Ask" },
  { name: "Jina Reader", role: "Frictionless competitor crawling" },
  { name: "Gemini 2.0", role: "Brief synthesis + content generation" },
  { name: "Supabase", role: "Secure project + content storage" },
  { name: "Clerk Auth", role: "Enterprise-grade authentication" },
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
    icon: Clock,
    stat: "15+ hrs/week",
    title: "Lost to manual keyword research",
    desc: "Your team is stuck in spreadsheets instead of shipping ranked content. Every hour of research is an hour not spent on strategy.",
  },
  {
    icon: TrendingUp,
    stat: "3× behind",
    title: "Your competitors automate. You don't.",
    desc: "While you're writing briefs manually, competitors are publishing AI-optimised content daily and compounding their organic lead.",
  },
  {
    icon: BarChart3,
    stat: "73% of content",
    title: "Never earns a single organic click",
    desc: "Most content fails because it skips real demand data. Rankshoot uses live keyword intelligence so every word targets verified traffic.",
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
    a: "Yes. All data lives in Supabase (SOC2-compliant infrastructure), isolated per project with row-level security. Your brief and generated content are never used to train AI models. We use Clerk for enterprise-grade authentication.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Absolutely. Month-to-month billing, no contracts, cancel from your dashboard in 30 seconds. Cancel within your 14-day trial and you're never charged. We want you to stay because Rankshoot works — not because you forgot to unsubscribe.",
  },
];

const marqueItems = [
  "Ahrefs", "DataForSEO", "Serper.dev", "Jina Reader", "Gemini 2.0 Flash",
  "Supabase", "Next.js 16", "AI Overviews ready", "GEO + SEO", "JSON-LD schema",
  "Ahrefs", "DataForSEO", "Serper.dev", "Jina Reader", "Gemini 2.0 Flash",
  "Supabase", "Next.js 16", "AI Overviews ready", "GEO + SEO", "JSON-LD schema",
];

/* ─────────────────────── Page shell ─────────────────────── */

export default function LandingPage() {
  const scrolled = useScrolledPast(40);
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <main className="relative bg-surface-primary text-text-primary overflow-x-hidden">
      <BackgroundFx />
      <Nav scrolled={scrolled} mobileMenu={mobileMenu} setMobileMenu={setMobileMenu} />
      <Hero />
      <LogoMarquee />
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
      {/* Hero halo */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[640px] w-[1100px] rounded-full bg-brand-violet/25 dark:bg-brand-violet/12 blur-[140px] animate-pulse-glow" />
      {/* Left accent */}
      <div className="absolute top-[40%] left-[8%] h-[420px] w-[420px] rounded-full bg-brand-aqua/18 dark:bg-brand-aqua/8 blur-[120px] animate-pulse-glow delay-300" />
      {/* Right accent */}
      <div className="absolute bottom-[-160px] right-[6%] h-[480px] w-[480px] rounded-full bg-brand-violet-soft/18 dark:bg-brand-violet-soft/10 blur-[140px] animate-pulse-glow delay-500" />
    </div>
  );
}

/* ─────────────────────── Nav ─────────────────────── */

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
          ? "bg-glass border-b border-border-subtle py-2 shadow-[var(--shadow-sm)]"
          : "border-b border-transparent py-4"
      }`}
    >
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6">
        {/* Logo — scale on hover */}
        <Link href="/" className="shrink-0 group">
          <span
            className="inline-block transition-all duration-300 group-hover:scale-[1.04]"
            style={{ transformOrigin: "left center" }}
          >
            <Logo size="md" />
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
              {/* Animated underline pill */}
              <span className="absolute bottom-1.5 left-1/2 h-[2px] w-0 -translate-x-1/2 rounded-full bg-brand-violet transition-all duration-200 group-hover:w-4" />
            </a>
          ))}
        </div>

        {/* CTA area */}
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
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-violet px-4.5 py-2 text-[13.5px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover hover:shadow-[var(--shadow-glow-md)]"
            >
              Get started <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-violet px-4.5 py-2 text-[13.5px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover"
            >
              Dashboard <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <UserButton />
          </SignedIn>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setMobileMenu(!mobileMenu)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover md:hidden"
          aria-label="Toggle menu"
        >
          {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu with slide animation */}
      <div
        className="absolute inset-x-0 top-full overflow-hidden transition-all duration-300 ease-out md:hidden"
        style={{ maxHeight: mobileMenu ? "420px" : "0" }}
      >
        <div className="bg-glass border-b border-border-subtle">
          <div className="flex flex-col gap-1 p-4">
            {navItems.map(item => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMobileMenu(false)}
                className="rounded-lg px-4 py-3 text-[14px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
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

function CyclingWord() {
  const words = ["ranked content", "organic traffic", "SEO dominance", "compound growth"];
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIdx(i => (i + 1) % words.length);
        setFading(false);
      }, 360);
    }, 2800);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      className="gradient-text"
      style={{
        display: "inline-block",
        transition: "opacity 0.36s ease, transform 0.36s ease",
        opacity: fading ? 0 : 1,
        transform: fading ? "translateY(-10px)" : "translateY(0)",
      }}
    >
      {words[idx]}
    </span>
  );
}

function Hero() {
  return (
    <section className="relative px-6 pt-36 pb-20 sm:pt-44 sm:pb-28" id="hero">
      <div className="mx-auto max-w-[960px] text-center">
        {/* Badge */}
        <div className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-brand-violet/30 bg-brand-violet/8 px-3.5 py-1.5 text-[12.5px] font-medium text-brand-violet">
          <span className="ai-orb" />
          New · AI Overviews optimization built-in
        </div>

        {/* Headline */}
        <h1 className="animate-fade-in-up delay-100 mt-6 text-balance text-5xl font-semibold tracking-[-0.035em] leading-[1.04] sm:text-6xl lg:text-[78px]">
          Stop losing rankings to<br />
          competitors who{" "}
          <span className="gradient-text">automate.</span>
        </h1>

        {/* Sub */}
        <p className="animate-fade-in-up delay-200 mx-auto mt-7 max-w-[640px] text-balance text-[17px] leading-relaxed text-text-secondary sm:text-[18px]">
          Rankshoot's AI pipeline discovers winning keywords, generates SEO-optimized content, audits performance, and publishes — all in one workspace. From brief to ranked in days, not weeks.
        </p>

        {/* CTAs */}
        <div className="animate-fade-in-up delay-300 mt-10 flex flex-wrap items-center justify-center gap-3">
          <SignedOut>
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-full bg-brand-violet px-7 py-3.5 text-[15px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover hover:shadow-[var(--shadow-glow-md)]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/projects"
              className="group inline-flex items-center gap-2 rounded-full bg-brand-violet px-7 py-3.5 text-[15px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover hover:shadow-[var(--shadow-glow-md)]"
            >
              Open dashboard
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </SignedIn>
          <a
            href="#preview"
            className="bg-glass inline-flex items-center gap-2 rounded-full border border-border-default px-6 py-3.5 text-[15px] font-semibold text-text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-hover"
          >
            <Play className="h-4 w-4 fill-brand-violet text-brand-violet" /> Watch 2-min demo
          </a>
        </div>

        {/* Microcopy */}
        <p className="animate-fade-in-up delay-400 mt-5 text-[12.5px] text-text-tertiary">
          No credit card required · 14-day full-feature trial · Cancel anytime
        </p>

        {/* Stats grid */}
        <div className="animate-fade-in-up delay-500 mx-auto mt-16 grid max-w-[1100px] grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-border-subtle bg-border-subtle shadow-[var(--shadow-md)] sm:grid-cols-4">
          {stats.map(stat => (
            <div key={stat.label} className="bg-surface-elevated p-6 text-center">
              <div className="text-3xl font-semibold tracking-tight gradient-text">{stat.value}</div>
              <div className="mt-1.5 text-[12.5px] leading-relaxed text-text-tertiary">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── LogoMarquee ─────────────────────── */

function LogoMarquee() {
  return (
    <section className="border-y border-border-subtle/70 bg-surface-secondary/40 py-4 overflow-hidden">
      <div className="relative flex">
        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-20 z-10 bg-gradient-to-r from-surface-secondary/80 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-20 z-10 bg-gradient-to-l from-surface-secondary/80 to-transparent" />
        <div className="animate-marquee gap-12 items-center">
          {marqueItems.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="shrink-0 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-text-tertiary"
            >
              <Check className="h-3 w-3 text-brand-violet" />
              {name}
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
    <section className="px-6 py-28" id="pain">
      <div className="mx-auto max-w-[1240px]">
        {/* Header */}
        <div
          ref={ref}
          className={`text-center transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-status-danger/30 bg-status-danger/8 px-3.5 py-1.5 text-[12.5px] font-medium text-status-danger">
            ⚠️ The cost of staying manual
          </div>
          <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight leading-[1.1] sm:text-4xl lg:text-[44px]">
            Every week without automation<br />
            <span className="text-status-danger">is a week your competitors win.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-[560px] text-[15px] leading-relaxed text-text-secondary">
            Manual SEO workflows are silently killing your growth. Here's what it's costing you right now:
          </p>
        </div>

        {/* Pain cards */}
        <div
          className={`mt-14 grid gap-6 md:grid-cols-3 transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          {painPoints.map((point, i) => (
            <div
              key={point.title}
              className="relative overflow-hidden rounded-[20px] border border-border-subtle bg-surface-elevated p-7 shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-md)]"
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-status-danger/50 to-transparent" />
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-status-danger/20 bg-status-danger/10 text-status-danger">
                <point.icon className="h-5 w-5" />
              </div>
              <div className="text-2xl font-bold tracking-tight text-status-danger">{point.stat}</div>
              <h3 className="mt-1.5 text-[16px] font-semibold text-text-primary">{point.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-text-tertiary">{point.desc}</p>
            </div>
          ))}
        </div>

        {/* Bridge CTA */}
        <div
          className={`mt-12 flex justify-center transition-all duration-700 delay-400 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-full bg-brand-violet px-6 py-3 text-[14px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow-md)]"
          >
            See how Rankshoot solves this <ArrowRight className="h-4 w-4" />
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
    <section id="features" className="px-6 py-28 bg-surface-secondary/20">
      <div className="mx-auto max-w-[1240px]">
        <div
          ref={ref}
          className={`transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <SectionEyebrow icon={<Layers className="h-3.5 w-3.5" />} label="Platform" />
          <SectionTitle>
            Everything you need to rank,{" "}
            <span className="gradient-text">in one workspace.</span>
          </SectionTitle>
          <SectionSub>
            Built for marketing teams who want compounding organic traffic — not another dashboard to babysit. Every module shares your brief, live data, and AI context.
          </SectionSub>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[20px] border border-border-subtle bg-border-subtle shadow-[var(--shadow-md)] md:grid-cols-2 lg:grid-cols-3">
          {features.map((feat, i) => (
            <div
              key={feat.title}
              className={`group relative bg-surface-elevated p-7 transition-all duration-500 hover:bg-surface-hover ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
              style={{ transitionDelay: inView ? `${i * 80}ms` : "0ms" }}
            >
              {/* Hover accent line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-violet/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              {/* Icon */}
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-secondary text-brand-violet shadow-[var(--shadow-xs)] transition-all duration-300 group-hover:border-brand-violet/30 group-hover:bg-brand-violet/10 group-hover:shadow-[var(--shadow-glow-sm)]">
                <feat.icon className="h-5 w-5" />
              </div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-brand-violet">{feat.sub}</div>
              <h3 className="mt-1.5 text-[16px] font-semibold tracking-tight text-text-primary">{feat.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-text-tertiary">{feat.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── WorkflowSection ─────────────────────── */

function WorkflowSection() {
  const [ref, inView] = useInView();
  return (
    <section id="workflow" className="px-6 py-28">
      <div className="mx-auto max-w-[1240px]">
        <div
          ref={ref}
          className={`transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <SectionEyebrow icon={<Workflow className="h-3.5 w-3.5" />} label="Workflow" />
          <SectionTitle>
            From brief to{" "}
            <span className="gradient-text">published</span>, in days.
          </SectionTitle>
          <SectionSub>
            Four steps, zero guesswork. Rankshoot guides your team through each stage — never lost, every action contextual to what you just did.
          </SectionSub>
        </div>

        <div className="relative mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Connector line desktop */}
          <div className="absolute left-[calc(12.5%+2rem)] right-[calc(12.5%+2rem)] top-7 hidden h-px bg-gradient-to-r from-transparent via-brand-violet/25 to-transparent lg:block" />
          {workflowSteps.map((step, i) => (
            <div
              key={step.num}
              className={`relative overflow-hidden rounded-[20px] border border-border-subtle bg-surface-elevated p-6 shadow-[var(--shadow-sm)] transition-all duration-700 hover:-translate-y-1 hover:shadow-[var(--shadow-md)] ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
              style={{ transitionDelay: inView ? `${i * 120}ms` : "0ms" }}
            >
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-brand-violet/60 to-transparent" />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-text-tertiary">{step.num}</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-violet/10 text-brand-violet">
                  <step.icon className="h-4 w-4" />
                </div>
              </div>
              <h3 className="mt-4 text-[15.5px] font-semibold tracking-tight text-text-primary">{step.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-text-tertiary">{step.desc}</p>
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
    <section id="preview" className="px-6 py-28 bg-surface-secondary/20">
      <div className="mx-auto max-w-[1240px]">
        <div
          ref={ref}
          className={`transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <SectionEyebrow icon={<BarChart3 className="h-3.5 w-3.5" />} label="Live preview" />
          <SectionTitle>
            A workspace that feels like{" "}
            <span className="gradient-text">a single thought.</span>
          </SectionTitle>
          <SectionSub>
            Premium dark + light themes, contextual side rails, keyboard-driven everywhere. This is not another SEO tool — it&apos;s an operating system.
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
                  { icon: Wand2, label: "Content Studio" },
                  { icon: Target, label: "Competitors" },
                  { icon: Activity, label: "Content Health", count: "12" },
                  { icon: Calendar, label: "Calendar" },
                  { icon: FileText, label: "Blogs", count: "32" },
                ].map(item => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] font-medium ${
                      item.active
                        ? "border border-border-subtle bg-surface-elevated text-brand-violet shadow-[var(--shadow-xs)]"
                        : "text-text-secondary hover:bg-surface-hover"
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

            {/* Main panel */}
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
                  <span>Keyword</span><span>Volume</span><span>Difficulty</span><span>Trend</span><span className="text-right">Score</span>
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

            {/* AI assistant rail */}
            <aside className="hidden border-l border-border-subtle bg-surface-secondary p-4 lg:block">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
                <span className="ai-orb" /> Assistant
              </div>
              <div className="mt-4 space-y-3 text-[12.5px]">
                <div className="rounded-xl border border-border-subtle bg-surface-elevated p-3 text-text-secondary">
                  I noticed <span className="text-text-primary">5 BOFU keywords</span> trending up 24%. Want me to draft a comparison post for{" "}
                  <span className="text-brand-violet">&quot;AI recruitment platform&quot;</span>?
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

/* ─────────────────────── AssistantShowcase ─────────────────────── */

function AssistantShowcase() {
  const [ref, inView] = useInView();
  return (
    <section id="assistant" className="px-6 py-28">
      <div className="mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div
          ref={ref}
          className={`transition-all duration-700 ${inView ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}`}
        >
          <SectionEyebrow icon={<Bot className="h-3.5 w-3.5" />} label="AI assistant" />
          <SectionTitle className="text-balance">
            A copilot that{" "}
            <span className="gradient-text">knows your business.</span>
          </SectionTitle>
          <SectionSub className="max-w-none">
            The Rankshoot assistant lives on every page and changes behaviour with context — on Keywords it suggests clusters, on Competitors it surfaces gaps, on Content Health it ranks fixes by traffic impact. No prompt engineering needed.
          </SectionSub>
          <ul className="mt-8 space-y-3">
            {[
              { icon: Search, text: "Explains AI score, ranking chance, and clustering on the keywords page" },
              { icon: Target, text: "Surfaces competitor gaps and weak pages with one click" },
              { icon: Wand2, text: "Improves E-E-A-T, semantic coverage, and CTAs inside the content studio" },
              { icon: Calendar, text: "Recommends cadence and fills empty days on the calendar" },
              { icon: Activity, text: "Prioritises Content Health fixes by SEO + traffic impact" },
            ].map(item => (
              <li key={item.text} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-elevated text-brand-violet shadow-[var(--shadow-xs)]">
                  <item.icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[14px] leading-relaxed text-text-secondary">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div
          className={`relative transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}
        >
          <div className="absolute inset-0 -z-10 rounded-[20px] bg-brand-violet/15 blur-3xl" />
          <div className="bg-glass space-y-3 overflow-hidden rounded-[20px] border border-border-subtle p-5 shadow-[var(--shadow-xl)]">
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
                <li><span className="text-brand-violet">●</span> <b>AI recruitment platform</b> · BOFU · score 92 · +24% trend</li>
                <li><span className="text-brand-violet">●</span> <b>automated hiring software</b> · BOFU · score 87</li>
                <li><span className="text-brand-violet">●</span> <b>AI candidate screening</b> · TOFU · score 85 · +32%</li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-full border border-brand-violet/30 bg-brand-violet/10 px-2.5 py-1 text-[11px] font-medium text-brand-violet">Approve all</button>
                <button className="rounded-full border border-border-subtle bg-surface-elevated px-2.5 py-1 text-[11px] font-medium text-text-secondary">Schedule for Q3</button>
                <button className="rounded-full border border-border-subtle bg-surface-elevated px-2.5 py-1 text-[11px] font-medium text-text-secondary">Cluster them</button>
              </div>
            </ChatBubble>
            <div className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-elevated px-3 py-2.5">
              <Sparkles className="h-3.5 w-3.5 text-brand-violet" />
              <span className="text-[12.5px] text-text-tertiary">Ask anything about your project…</span>
              <span className="ml-auto rounded border border-border-subtle bg-surface-secondary px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">⌘K</span>
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
    <section className="px-6 py-28 bg-surface-secondary/20">
      <div className="mx-auto max-w-[1240px]">
        <div
          ref={ref}
          className={`text-center transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <SectionEyebrow icon={<Star className="h-3.5 w-3.5" />} label="Social proof" />
          <SectionTitle className="mx-auto max-w-[600px] text-center">
            Teams that ship more content{" "}
            <span className="gradient-text">trust Rankshoot.</span>
          </SectionTitle>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <div
              key={t.name}
              className={`relative overflow-hidden rounded-[20px] border border-border-subtle bg-surface-elevated p-7 shadow-[var(--shadow-sm)] transition-all duration-700 hover:-translate-y-1 hover:shadow-[var(--shadow-md)] ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: inView ? `${i * 110}ms` : "0ms" }}
            >
              {/* Accent gradient top */}
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-brand-violet/40 to-transparent" />
              {/* Stars */}
              <div className="mb-4 flex gap-1">
                {Array(t.stars).fill(0).map((_, s) => (
                  <Star key={s} className="h-3.5 w-3.5 fill-brand-violet text-brand-violet" />
                ))}
              </div>
              {/* Quote icon */}
              <Quote className="mb-3 h-6 w-6 text-brand-violet/25" />
              <p className="text-[14.5px] leading-relaxed text-text-secondary">&ldquo;{t.quote}&rdquo;</p>
              {/* Author */}
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
    <section className="border-y border-border-subtle px-6 py-24">
      <div className="mx-auto max-w-[1240px]">
        <div
          ref={ref}
          className={`transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <SectionEyebrow icon={<Globe2 className="h-3.5 w-3.5" />} label="Integrations" />
          <SectionTitle>
            Live data from the tools{" "}
            <span className="gradient-text">enterprise SEO teams trust.</span>
          </SectionTitle>
          <SectionSub>
            Rankshoot routes requests to the right provider automatically — Ahrefs first when configured, DataForSEO as a clean fallback — and caches aggressively so spend stays predictable.
          </SectionSub>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-[20px] border border-border-subtle bg-border-subtle shadow-[var(--shadow-md)] md:grid-cols-2 lg:grid-cols-4">
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
        <span className="text-[15.5px] font-semibold text-text-primary">{q}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-300"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      <div
        style={{
          maxHeight: open ? "400px" : "0",
          overflow: "hidden",
          transition: "max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <p className="pb-5 text-[14.5px] leading-relaxed text-text-secondary">{a}</p>
      </div>
    </div>
  );
}

function FAQSection() {
  const [ref, inView] = useInView();
  return (
    <section className="px-6 py-28" id="faq">
      <div className="mx-auto max-w-[820px]">
        <div
          ref={ref}
          className={`text-center transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <SectionEyebrow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="FAQ" />
          <SectionTitle className="text-center">
            Everything you need to know
          </SectionTitle>
          <SectionSub className="mx-auto text-center">
            Common questions from teams evaluating Rankshoot — answered honestly.
          </SectionSub>
        </div>
        <div
          className={`mt-10 rounded-[20px] border border-border-subtle bg-surface-elevated p-2 px-6 shadow-[var(--shadow-sm)] transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
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
    <section id="pricing" className="px-6 py-28 relative bg-surface-secondary/20">
      <div className="max-w-[1240px] mx-auto space-y-16 relative z-10">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <SectionEyebrow icon={<Zap className="h-3.5 w-3.5" />} label="Pricing" />
          <SectionTitle>
            Simple, transparent{" "}
            <span className="gradient-text">pricing.</span>
          </SectionTitle>
          <SectionSub className="mx-auto text-center">
            Select the plan that fits your growth stage. All plans include the full AI pipeline — keywords, calendar, content studio, and audit.
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
    <section className="px-6 py-32">
      <div
        ref={ref}
        className={`relative mx-auto max-w-[960px] overflow-hidden rounded-[28px] border border-border-subtle bg-surface-secondary p-10 text-center shadow-[var(--shadow-xl)] transition-all duration-700 sm:p-16 ${inView ? "opacity-100 scale-100" : "opacity-0 scale-[0.97]"}`}
      >
        {/* Glow */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand-violet/28 dark:bg-brand-violet/15 blur-[120px]" />
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-violet/30 bg-brand-violet/10 px-3.5 py-1.5 text-[12.5px] font-medium text-brand-violet">
          <span className="ai-orb" /> Ready when you are
        </div>
        <h2 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">
          Ship ranked content.<br />
          <span className="gradient-text">Stop losing to automation.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-[540px] text-[15px] leading-relaxed text-text-secondary">
          Plug in your domain and competitors. Rankshoot briefs, researches, plans, generates, and audits — so your team spends the day on strategy, not spreadsheets.
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
          No credit card required · 14-day full trial · Cancel anytime · Setup under 15 minutes
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────── Footer ─────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-border-subtle px-6 py-16">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="max-w-[320px]">
          <Logo size="md" />
          <p className="mt-4 text-[13px] leading-relaxed text-text-tertiary">{BRAND.description}</p>
          <div className="mt-5 flex items-center gap-2 rounded-full border border-brand-violet/20 bg-brand-violet/8 px-3 py-1.5 w-fit text-[11.5px] font-medium text-brand-violet">
            <span className="ai-orb" /> AI Overviews optimized
          </div>
        </div>
        {[
          {
            heading: "Product",
            links: [
              { label: "Features", href: "#features" },
              { label: "Workflow", href: "#workflow" },
              { label: "AI Assistant", href: "#assistant" },
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
            <h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-secondary">
              {col.heading}
            </h4>
            <ul className="mt-4 space-y-2.5">
              {col.links.map(link => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-[13px] text-text-tertiary transition-colors hover:text-text-primary"
                  >
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
          <span>Next.js · Supabase · Gemini · Ahrefs</span>
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
