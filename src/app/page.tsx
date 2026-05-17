"use client";

import { useState, useEffect } from "react";

const Icons = {
  sparkles: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"/></svg>,
  search: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  target: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  bar: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>,
  zap: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  arrowRight: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>,
  menu: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>,
  close: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  brain: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-5 0v-15A2.5 2.5 0 0 1 9.5 2"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 5 0v-15A2.5 2.5 0 0 0 14.5 2"/></svg>,
  code: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  chart: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>,
  layers: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/></svg>,
  check: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>,
};

const features = [
  { icon: Icons.target, title: "Keyword Intelligence", desc: "AI-powered discovery of high-opportunity keywords with volume and difficulty scoring" },
  { icon: Icons.bar, title: "Competitor Analysis", desc: "Analyze what competitors rank for and identify content gaps instantly" },
  { icon: Icons.code, title: "Content Generation", desc: "Generate SEO-optimized blogs, ebooks, and whitepapers with AI" },
  { icon: Icons.zap, title: "Automation Workflows", desc: "Automate content scheduling and publishing across platforms" },
  { icon: Icons.chart, title: "AI Optimization", desc: "Automatic SEO optimization and performance analytics" },
  { icon: Icons.brain, title: "AI Assistant", desc: "Get intelligent recommendations and insights powered by AI" },
];

const testimonials = [
  { name: "Sarah Chen", role: "Marketing Director", company: "TechFlow", quote: "RANKIT transformed our SEO strategy. We're ranking for keywords we never thought possible." },
  { name: "Marcus Johnson", role: "Content Lead", company: "Growth Labs", quote: "The automation saved us 20 hours per week. Our content quality actually improved." },
  { name: "Elena Rodriguez", role: "Founder", company: "ContentHub", quote: "This is the future of SEO. The AI understands context better than any tool I've used." },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="bg-surface-primary text-text-primary min-h-screen">
      {/* ===== NAVBAR ===== */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-surface-primary/80 backdrop-blur-xl border-b border-border-subtle" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-white text-lg font-black">R</span>
            <span>RANKIT</span>
          </a>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm text-text-secondary hover:text-text-primary transition-colors">How It Works</a>
            <a href="#testimonials" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Testimonials</a>
            <a href="#pricing" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Pricing</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <a href="/sign-in" className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">Sign In</a>
            <a href="/sign-up" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-all">
              Get Started {Icons.arrowRight}
            </a>
          </div>

          <button className="md:hidden" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu">
            {mobileMenu ? Icons.close : Icons.menu}
          </button>
        </div>

        {mobileMenu && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-surface-secondary/95 backdrop-blur-xl border-b border-border-subtle">
            <div className="px-6 py-4 flex flex-col gap-3">
              <a href="#features" className="text-sm text-text-secondary hover:text-text-primary" onClick={() => setMobileMenu(false)}>Features</a>
              <a href="#how-it-works" className="text-sm text-text-secondary hover:text-text-primary" onClick={() => setMobileMenu(false)}>How It Works</a>
              <a href="#testimonials" className="text-sm text-text-secondary hover:text-text-primary" onClick={() => setMobileMenu(false)}>Testimonials</a>
              <div className="pt-3 border-t border-border-subtle flex flex-col gap-2">
                <a href="/sign-up" className="w-full px-6 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold text-center">Get Started</a>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ===== HERO ===== */}
      <section className="relative min-h-screen flex items-center justify-center text-center px-6 pt-32 overflow-hidden" id="hero">
        {/* Background effects */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-[10%] left-[5%] w-[500px] h-[500px] rounded-full bg-violet-600/15 blur-[100px] animate-pulse-glow" />
          <div className="absolute bottom-[10%] right-[5%] w-[500px] h-[500px] rounded-full bg-blue-600/15 blur-[100px] animate-pulse-glow [animation-delay:3s]" />
          <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-500/10 blur-[120px] animate-spin-slow opacity-50" />
          
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }} />
        </div>

        <div className="relative max-w-4xl z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-sm font-medium text-violet-300 mb-8 animate-fade-in-up">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            The AI SEO Operating System
          </div>

          {/* Title */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.1] mb-6 animate-fade-in-up delay-100">
            Automate Your <span className="gradient-text">Entire SEO</span> Workflow
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-text-secondary leading-relaxed max-w-[650px] mx-auto mb-10 animate-fade-in-up delay-200">
            Discover high-opportunity keywords, analyze competitors, generate SEO-optimized content, and publish automatically. Enterprise-grade AI that thinks like your best SEO.
          </p>

          {/* CTA Buttons */}
          <div className="animate-fade-in-up delay-300 flex items-center justify-center gap-4 flex-wrap">
            <a href="/sign-up" className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white font-semibold transition-all hover:shadow-lg hover:shadow-violet-500/30">
              {Icons.zap} Start Free Trial
            </a>
            <a href="#how-it-works" className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20 transition-all backdrop-blur">
              See Demo
            </a>
          </div>

          {/* Stats */}
          <div className="animate-fade-in-up delay-500 flex items-center justify-center gap-8 sm:gap-16 mt-16 pt-12 border-t border-white/10 flex-wrap">
            {[
              { value: "500K+", label: "Keywords Analyzed" },
              { value: "50K+", label: "Blogs Generated" },
              { value: "1000+", label: "Happy Teams" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">{stat.value}</div>
                <div className="text-sm text-text-tertiary font-medium mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-24 relative" id="how-it-works">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest bg-violet-500/15 text-violet-300 border border-violet-500/20 mb-4">
              {Icons.layers} The Workflow
            </div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight mb-4">
              From Input to <span className="gradient-text">Published Content</span>
            </h2>
            <p className="text-lg text-text-secondary leading-relaxed">
              Our AI orchestrates your entire SEO strategy in four intelligent steps
            </p>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { num: "01", icon: Icons.target, title: "Research", desc: "AI discovers trending keywords and high-opportunity niches" },
              { num: "02", icon: Icons.bar, title: "Analyze", desc: "Deep competitor analysis reveals content gaps" },
              { num: "03", icon: Icons.code, title: "Generate", desc: "SEO-optimized content created by AI" },
              { num: "04", icon: Icons.zap, title: "Publish", desc: "Automated scheduling and publishing workflows" },
            ].map((step, idx) => (
              <div key={step.num} className="relative group animate-fade-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
                <div className="p-8 rounded-xl glass group-hover:glass-hover transition-all duration-300">
                  <div className="text-3xl font-black text-violet-400 mb-4">{step.num}</div>
                  <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center text-violet-400 mb-4">
                    {step.icon}
                  </div>
                  <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                  <p className="text-sm text-text-tertiary">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="py-24 relative" id="features">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 right-[20%] w-[400px] h-[400px] rounded-full bg-blue-600/10 blur-[100px]" />
        </div>

        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest bg-blue-500/15 text-blue-300 border border-blue-500/20 mb-4">
              {Icons.sparkles} Capabilities
            </div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight mb-4">
              Everything You Need for <span className="gradient-text">SEO Domination</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <div key={feature.title} className="p-6 rounded-xl glass hover:glass-hover transition-all duration-300 animate-fade-in-up" style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center text-violet-300 mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                <p className="text-sm text-text-tertiary">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="py-24 relative" id="testimonials">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight mb-4">
              Loved by <span className="gradient-text">Growth Teams</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, idx) => (
              <div key={testimonial.name} className="p-8 rounded-xl glass hover:glass-hover transition-all duration-300 animate-fade-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-text-secondary mb-4 italic">{`"${testimonial.quote}"`}</p>
                <div>
                  <div className="font-semibold text-sm">{testimonial.name}</div>
                  <div className="text-xs text-text-tertiary">{testimonial.role} at {testimonial.company}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING PREVIEW ===== */}
      <section className="py-24 relative" id="pricing">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute bottom-0 left-[10%] w-[400px] h-[400px] rounded-full bg-violet-600/10 blur-[100px]" />
        </div>

        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest bg-violet-500/15 text-violet-300 border border-violet-500/20 mb-4">
              Simple Pricing
            </div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight">
              Plans for <span className="gradient-text">Every Stage</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { name: "Starter", price: "$99", features: ["10K keywords/month", "5 content calendars", "Email support"] },
              { name: "Professional", price: "$299", popular: true, features: ["Unlimited keywords", "Unlimited content", "Priority support", "API access", "Custom integrations"] },
              { name: "Enterprise", price: "Custom", features: ["Everything in Pro", "Dedicated account manager", "SLA guarantee", "White-label options"] },
            ].map((plan, idx) => (
              <div key={plan.name} className={`relative rounded-xl overflow-hidden animate-fade-in-up transition-all duration-300 ${plan.popular ? "lg:scale-105" : ""}`} style={{ animationDelay: `${idx * 100}ms` }}>
                {plan.popular && (
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-600/20 via-blue-600/20 to-violet-600/20 -z-10" />
                )}
                <div className={`p-8 rounded-xl glass hover:glass-hover ${plan.popular ? "border-violet-500/40" : ""}`}>
                  {plan.popular && <div className="text-xs font-bold text-violet-300 uppercase tracking-widest mb-4">Most Popular</div>}
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <div className="text-4xl font-black mb-6">{plan.price}<span className="text-lg text-text-tertiary font-normal">/mo</span></div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-text-secondary">
                        <span className="text-violet-400">{Icons.check}</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button className={`w-full py-3 rounded-lg font-semibold transition-all ${plan.popular ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:shadow-lg hover:shadow-violet-500/30" : "bg-white/10 text-white hover:bg-white/20"}`}>
                    Get Started
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-24 relative">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-gradient-to-r from-violet-600/15 via-blue-600/15 to-violet-600/15 blur-[120px] animate-pulse-glow" />
        </div>

        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight mb-6">
            Ready to Transform Your <span className="gradient-text">SEO Strategy?</span>
          </h2>
          <p className="text-lg text-text-secondary mb-10 max-w-2xl mx-auto leading-relaxed">
            Join thousands of growth teams automating their SEO workflow with RANKIT. Start your free trial today.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <a href="/sign-up" className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white font-semibold transition-all hover:shadow-lg hover:shadow-violet-500/30">
              {Icons.zap} Start Your Free Trial
            </a>
            <a href="#" className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20 transition-all">
              Schedule a Demo
            </a>
          </div>
          <p className="text-sm text-text-tertiary mt-8">No credit card required. 14-day free trial.</p>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="py-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h4 className="font-bold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-text-tertiary">
                <li><a href="#" className="hover:text-text-secondary transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-text-secondary transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-text-secondary transition-colors">API</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-text-tertiary">
                <li><a href="#" className="hover:text-text-secondary transition-colors">About</a></li>
                <li><a href="#" className="hover:text-text-secondary transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-text-secondary transition-colors">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-text-tertiary">
                <li><a href="#" className="hover:text-text-secondary transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-text-secondary transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-text-secondary transition-colors">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Connect</h4>
              <ul className="space-y-2 text-sm text-text-tertiary">
                <li><a href="#" className="hover:text-text-secondary transition-colors">Twitter</a></li>
                <li><a href="#" className="hover:text-text-secondary transition-colors">Discord</a></li>
                <li><a href="#" className="hover:text-text-secondary transition-colors">GitHub</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between text-sm text-text-tertiary">
            <div className="flex items-center gap-2 mb-4 sm:mb-0">
              <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-white text-xs font-black">R</span>
              <span className="font-bold">RANKIT</span>
            </div>
            <p>&copy; 2024 RANKIT. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
