"use client";

import { useState, useEffect } from "react";
import { AuthSignedIn as SignedIn, AuthSignedOut as SignedOut, AuthUserButton as UserButton } from "@/components/auth-wrapper";

/* ===== SVG ICONS ===== */
const Icon = {
  search: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  target: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  bar: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>,
  calendar: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>,
  edit: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>,
  download: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>,
  trending: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  sparkle: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"/></svg>,
  zap: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  arrowRight: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>,
  menu: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>,
  close: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  layers: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22.54 12.43-1.96-.89-8.58 3.9a2 2 0 0 1-1.66 0l-8.58-3.9-1.96.89a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.84Z"/></svg>,
  fileText: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><line x1="10" x2="8" y1="9" y2="9"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>,
  settings: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
};

const mockKeywords = [
  { keyword: "AI recruitment tools", volume: "8,100", difficulty: 42, trend: "+24%", score: 92 },
  { keyword: "automated hiring software", volume: "5,400", difficulty: 38, trend: "+18%", score: 87 },
  { keyword: "HR automation platform", volume: "3,200", difficulty: 55, trend: "+12%", score: 78 },
  { keyword: "AI candidate screening", volume: "2,900", difficulty: 31, trend: "+32%", score: 85 },
  { keyword: "recruitment CRM tools", volume: "1,800", difficulty: 67, trend: "+8%", score: 64 },
];

const features = [
  { icon: Icon.search, color: "brand", title: "Smart Keyword Discovery", desc: "Find trending, high-value keywords for your industry and target region. Get search volume, difficulty scores, and trend data — like Ahrefs, but automated." },
  { icon: Icon.target, color: "cyan", title: "Competitor Analysis", desc: "Analyze competitor websites to see what keywords they rank for, what content they publish, and where their gaps lie — so you can outperform them." },
  { icon: Icon.bar, color: "accent", title: "Content Gap Scoring", desc: "AI scores every keyword opportunity by search volume, competition, trend growth, and content gap potential to prioritize what to write first." },
  { icon: Icon.calendar, color: "warm", title: "30-Day Content Calendar", desc: "Auto-generated publishing schedule — one blog per day, each targeting a top keyword. Stay consistent without the planning overhead." },
  { icon: Icon.edit, color: "rose", title: "AI Blog Generator", desc: "Generate full SEO-optimized blog posts with proper headings, meta descriptions, FAQs, citations, and internal link suggestions. Edit with our built-in editor." },
  { icon: Icon.download, color: "blue", title: "Multi-Format Export", desc: "Export your finished blogs as PDF, DOCX, Markdown, or HTML — ready to publish on any platform. Copy-paste or download in one click." },
];

const featureColors: Record<string, { bg: string; text?: string }> = {
  brand: { bg: "bg-brand-500/12" },
  cyan: { bg: "bg-cyan-500/12" },
  accent: { bg: "bg-accent-500/12" },
  warm: { bg: "bg-yellow-500/12" },
  rose: { bg: "bg-rose-500/12" },
  blue: { bg: "bg-blue-500/12" },
};

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      {/* ===== NAVBAR ===== */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300
          ${scrolled
            ? "bg-surface-primary/85 backdrop-blur-2xl border-b border-border-subtle py-3"
            : "bg-transparent py-4"
          }`}
        id="navbar"
      >
        <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3 font-bold text-xl tracking-tight" id="logo">
            <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-lg shadow-[0_0_20px_rgba(99,102,241,0.3)]">
              ⚡
            </span>
            SerpCraft
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">How It Works</a>
            <a href="#preview" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">Preview</a>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            <SignedOut>
              <a href="/sign-in" className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors" id="nav-login">
                Log In
              </a>
              <a href="/sign-up" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold shadow-md shadow-brand-500/20 hover:from-brand-400 hover:to-brand-500 hover:-translate-y-0.5 transition-all duration-200" id="nav-get-started">
                Get Started Free {Icon.arrowRight}
              </a>
            </SignedOut>
            <SignedIn>
              <a href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold shadow-md shadow-brand-500/20 hover:from-brand-400 hover:to-brand-500 hover:-translate-y-0.5 transition-all duration-200">
                Dashboard {Icon.arrowRight}
              </a>
              <UserButton />
            </SignedIn>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg text-text-secondary hover:bg-glass transition"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Toggle menu"
          >
            {mobileMenu ? Icon.close : Icon.menu}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenu && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-surface-secondary/95 backdrop-blur-2xl border-b border-border-subtle animate-fade-in">
            <div className="px-6 py-4 flex flex-col gap-3">
              <a href="#features" className="py-2 text-sm font-medium text-text-secondary" onClick={() => setMobileMenu(false)}>Features</a>
              <a href="#how-it-works" className="py-2 text-sm font-medium text-text-secondary" onClick={() => setMobileMenu(false)}>How It Works</a>
              <a href="#preview" className="py-2 text-sm font-medium text-text-secondary" onClick={() => setMobileMenu(false)}>Preview</a>
              <div className="pt-3 border-t border-border-subtle flex flex-col gap-2">
                <SignedOut>
                  <a href="/sign-in" className="py-2 text-sm font-medium text-text-secondary">Log In</a>
                  <a href="/sign-up" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold">
                    Get Started Free
                  </a>
                </SignedOut>
                <SignedIn>
                  <a href="/dashboard" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold">
                    Go to Dashboard
                  </a>
                </SignedIn>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ===== HERO ===== */}
      <section className="relative min-h-screen flex items-center justify-center text-center px-6 pt-32 pb-20 overflow-hidden" id="hero">
        {/* BG Effects */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
              maskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
            }}
          />
          <div className="absolute top-[10%] left-[10%] w-[400px] h-[400px] rounded-full bg-brand-500/12 blur-[80px] animate-pulse-glow" />
          <div className="absolute bottom-[10%] right-[10%] w-[350px] h-[350px] rounded-full bg-accent-500/8 blur-[80px] animate-pulse-glow [animation-delay:4s]" />
          <div className="absolute top-[50%] right-[30%] w-[250px] h-[250px] rounded-full bg-cyan-500/6 blur-[80px] animate-pulse-glow [animation-delay:2s]" />
          <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.08)_0%,transparent_50%),radial-gradient(circle_at_70%_80%,rgba(16,185,129,0.06)_0%,transparent_50%)] animate-spin-slow" />
        </div>

        <div className="relative max-w-[900px] z-10">
          {/* Badge */}
          <div className="animate-fade-in-up inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-500/10 border border-brand-500/20 text-sm font-medium text-brand-300 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
            AI-Powered SEO Automation
          </div>

          {/* Title */}
          <h1 className="animate-fade-in-up delay-100 text-5xl sm:text-6xl lg:text-7xl font-black tracking-[-0.03em] leading-[1.1] mb-6">
            Discover Keywords.{" "}
            <span className="gradient-text">Outrank Competitors.</span>{" "}
            Publish Content.
          </h1>

          {/* Subtitle */}
          <p className="animate-fade-in-up delay-200 text-lg sm:text-xl text-text-secondary leading-relaxed max-w-[600px] mx-auto mb-10">
            The all-in-one AI engine that finds trending keywords, analyzes
            competitor content gaps, generates SEO-optimized blogs, and
            plans your 30-day content calendar — automatically.
          </p>

          {/* CTA */}
          <div className="animate-fade-in-up delay-300 flex items-center justify-center gap-4 flex-wrap">
            <a
              href="/sign-up"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white font-semibold text-base shadow-lg shadow-brand-500/25 hover:from-brand-400 hover:to-brand-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-500/30 transition-all duration-200"
              id="hero-cta"
            >
              {Icon.zap} Start Automating SEO
            </a>
            <a
              href="#preview"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-glass border border-border-default text-text-primary font-semibold text-base backdrop-blur-xl hover:bg-glass-hover hover:border-border-strong hover:-translate-y-0.5 transition-all duration-200"
              id="hero-preview"
            >
              See It In Action
            </a>
          </div>

          {/* Stats */}
          <div className="animate-fade-in-up delay-500 flex items-center justify-center gap-8 sm:gap-12 mt-16 pt-12 border-t border-border-subtle flex-wrap">
            {[
              { value: "10K+", label: "Keywords Discovered" },
              { value: "500+", label: "Blogs Generated" },
              { value: "50+", label: "Industries Served" },
              { value: "98%", label: "SEO Score Avg" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight gradient-text mb-1">{stat.value}</div>
                <div className="text-sm text-text-tertiary font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-24 relative" id="how-it-works">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* Header */}
          <div className="text-center max-w-[700px] mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full text-xs font-semibold uppercase tracking-[0.08em] bg-brand-500/15 text-brand-300 border border-brand-500/20 mb-4">
              {Icon.layers} How It Works
            </div>
            <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.15] mb-4">
              From Industry Input to{" "}
              <span className="gradient-text">Published Content</span>
            </h2>
            <p className="text-lg text-text-secondary leading-relaxed">
              Four automated steps turn your industry knowledge into a
              full content strategy — no SEO expertise required.
            </p>
          </div>

          {/* Steps */}
          <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Connector line (desktop only) */}
            <div className="hidden lg:block absolute top-[60px] left-[12.5%] w-[75%] h-0.5 bg-gradient-to-r from-brand-500 via-cyan-400 via-accent-400 to-yellow-400 opacity-30" />

            {[
              { num: "1", title: "Define Your Niche", desc: "Enter your industry, domain, target region, and optionally competitor websites.", colors: "bg-brand-500/15 text-brand-400 border-brand-500" },
              { num: "2", title: "AI Research", desc: "Our AI discovers trending keywords, analyzes competitor content, and identifies ranking gaps.", colors: "bg-cyan-500/15 text-cyan-400 border-cyan-500" },
              { num: "3", title: "Content Plan", desc: "Get a 30-day content calendar with one blog per day, each targeting a high-opportunity keyword.", colors: "bg-accent-500/15 text-accent-400 border-accent-500" },
              { num: "4", title: "Generate & Export", desc: "AI writes SEO-optimized blogs you can edit and export as PDF, DOCX, Markdown, or HTML.", colors: "bg-yellow-500/15 text-yellow-400 border-yellow-500" },
            ].map((step) => (
              <div key={step.num} className="relative z-10 text-center py-8 px-4 animate-fade-in-up" style={{ animationDelay: `${(parseInt(step.num) - 1) * 200}ms` }}>
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-6 text-xl font-bold relative ${step.colors.split(" ").slice(0, 2).join(" ")}`}>
                  {step.num}
                  <div className={`absolute inset-[-3px] rounded-xl border-2 opacity-30 ${step.colors.split(" ")[2]}`} />
                </div>
                <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-text-tertiary leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="py-24 relative" id="features">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* Header */}
          <div className="text-center max-w-[700px] mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full text-xs font-semibold uppercase tracking-[0.08em] bg-accent-500/15 text-accent-400 border border-accent-500/20 mb-4">
              {Icon.sparkle} Features
            </div>
            <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.15] mb-4">
              Everything You Need to{" "}
              <span className="gradient-text">Dominate SEO</span>
            </h2>
            <p className="text-lg text-text-secondary leading-relaxed">
              A complete toolkit that replaces expensive SEO tools and hours of manual research.
            </p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feat, i) => (
              <div
                key={feat.title}
                className="group relative overflow-hidden p-8 rounded-2xl bg-glass border border-border-subtle hover:border-border-default hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
              >
                {/* Top line glow */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className={`w-12 h-12 rounded-xl ${featureColors[feat.color]?.bg} flex items-center justify-center mb-5`}>
                  {feat.icon}
                </div>
                <h3 className="text-lg font-bold mb-3">{feat.title}</h3>
                <p className="text-sm text-text-tertiary leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PREVIEW ===== */}
      <section className="py-24 relative overflow-hidden" id="preview">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* Header */}
          <div className="text-center max-w-[700px] mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full text-xs font-semibold uppercase tracking-[0.08em] bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 mb-4">
              {Icon.trending} Live Preview
            </div>
            <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.15] mb-4">
              See Your{" "}
              <span className="gradient-text">SEO Dashboard</span>{" "}
              In Action
            </h2>
            <p className="text-lg text-text-secondary leading-relaxed">
              A complete overview of your keyword opportunities, competitor
              insights, and content performance.
            </p>
          </div>

          {/* Browser Mockup */}
          <div className="relative max-w-[1100px] mx-auto rounded-2xl overflow-hidden border border-border-default bg-surface-secondary shadow-2xl shadow-brand-500/5 animate-scale-in">
            {/* Title Bar */}
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-tertiary border-b border-border-subtle">
              <div className="flex gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              </div>
              <span className="flex-1 text-center text-xs text-text-tertiary font-mono">serpcraft.ai/dashboard</span>
              <div className="w-[54px]" />
            </div>

            {/* Content */}
            <div className="p-6 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 min-h-[500px]">
              {/* Sidebar */}
              <div className="hidden lg:block bg-surface-tertiary rounded-xl p-4">
                {[
                  { icon: Icon.bar, label: "Dashboard", active: true },
                  { icon: Icon.search, label: "Keywords", active: false },
                  { icon: Icon.target, label: "Competitors", active: false },
                  { icon: Icon.calendar, label: "Calendar", active: false },
                  { icon: Icon.fileText, label: "Content", active: false },
                  { icon: Icon.settings, label: "Settings", active: false },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm mb-1 transition-colors
                      ${item.active ? "bg-brand-500/10 text-brand-400" : "text-text-tertiary hover:text-text-secondary"}`}
                  >
                    {item.icon} {item.label}
                  </div>
                ))}
              </div>

              {/* Main */}
              <div className="flex flex-col gap-4">
                {/* Metrics */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Keywords Found", value: "248", change: "↑ 12% from last scan", color: "gradient-text" },
                    { label: "Content Gaps", value: "34", change: "↑ opportunities found", color: "text-accent-400" },
                    { label: "Avg Difficulty", value: "41", change: "Moderate — good to target", color: "text-yellow-400" },
                    { label: "Blogs Generated", value: "18", change: "12 published, 6 drafts", color: "text-cyan-400" },
                  ].map((m) => (
                    <div key={m.label} className="bg-surface-tertiary rounded-xl p-4">
                      <div className="text-xs text-text-tertiary mb-2">{m.label}</div>
                      <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
                      <div className="text-xs text-accent-400 mt-1">{m.change}</div>
                    </div>
                  ))}
                </div>

                {/* Table */}
                <div className="bg-surface-tertiary rounded-xl overflow-hidden flex-1">
                  {/* Header */}
                  <div className="grid grid-cols-[2fr_1fr_1fr] lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 text-xs text-text-tertiary font-semibold uppercase tracking-wider border-b border-border-subtle">
                    <span>Keyword</span>
                    <span>Volume</span>
                    <span>Difficulty</span>
                    <span className="hidden lg:block">Trend</span>
                    <span className="hidden lg:block">Score</span>
                  </div>
                  {/* Rows */}
                  {mockKeywords.map((kw, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[2fr_1fr_1fr] lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 text-sm border-b border-border-subtle last:border-b-0 hover:bg-glass transition-colors"
                    >
                      <span className="font-medium">{kw.keyword}</span>
                      <span>{kw.volume}</span>
                      <span>
                        <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden mt-1">
                          <div
                            className={`h-full rounded-full ${
                              kw.difficulty < 40
                                ? "bg-accent-400"
                                : kw.difficulty < 60
                                ? "bg-yellow-400"
                                : "bg-rose-400"
                            }`}
                            style={{ width: `${kw.difficulty}%` }}
                          />
                        </div>
                      </span>
                      <span className="hidden lg:block text-accent-400">{kw.trend}</span>
                      <span className="hidden lg:block">
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-500/15 text-brand-300 border border-brand-500/20">
                          {kw.score}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="py-24 relative" id="cta">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="relative text-center py-16 px-8 rounded-2xl bg-gradient-to-br from-brand-500/8 to-accent-500/4 border border-border-subtle overflow-hidden">
            {/* Top line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-400 to-transparent" />

            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Ready to{" "}
              <span className="gradient-text">Automate Your SEO?</span>
            </h2>
            <p className="text-lg text-text-secondary mb-8 max-w-[500px] mx-auto">
              Stop spending hours on keyword research and content planning.
              Let AI handle the heavy lifting while you focus on growing
              your business.
            </p>
            <a
              href="/sign-up"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white font-semibold text-base shadow-lg shadow-brand-500/25 hover:from-brand-400 hover:to-brand-500 hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200"
              id="cta-button"
            >
              {Icon.zap} Get Started — It&apos;s Free
            </a>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="pt-16 pb-8 border-t border-border-subtle" id="footer">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-8 lg:gap-12 mb-12">
            {/* Brand */}
            <div className="max-w-[300px]">
              <div className="flex items-center gap-3 font-bold text-lg mb-4">
                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-sm shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                  ⚡
                </span>
                SerpCraft
              </div>
              <p className="text-sm text-text-tertiary leading-relaxed">
                AI-powered SEO automation platform. Discover keywords,
                analyze competitors, and generate optimized content — all
                in one place.
              </p>
            </div>

            {/* Links */}
            {[
              { heading: "Product", links: [{ label: "Features", href: "#features" }, { label: "How It Works", href: "#how-it-works" }, { label: "Preview", href: "#preview" }, { label: "Dashboard", href: "/dashboard" }] },
              { heading: "Resources", links: [{ label: "Documentation", href: "#" }, { label: "API Reference", href: "#" }, { label: "Blog", href: "#" }, { label: "Changelog", href: "#" }] },
              { heading: "Company", links: [{ label: "About", href: "#" }, { label: "Privacy Policy", href: "#" }, { label: "Terms of Service", href: "#" }, { label: "Contact", href: "#" }] },
            ].map((col) => (
              <div key={col.heading}>
                <h4 className="text-sm font-semibold uppercase tracking-[0.06em] mb-4">{col.heading}</h4>
                <div className="flex flex-col gap-3">
                  {col.links.map((link) => (
                    <a key={link.label} href={link.href} className="text-sm text-text-tertiary hover:text-text-primary transition-colors">
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-border-subtle text-sm text-text-tertiary">
            <span>© {new Date().getFullYear()} SerpCraft. All rights reserved.</span>
            <span>Built with AI · Powered by Next.js</span>
          </div>
        </div>
      </footer>
    </>
  );
}
