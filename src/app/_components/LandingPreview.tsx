"use client";

import { useState, useEffect } from "react";
import {
  BarChart3, Search, Wand2, Target, Activity, Calendar, FileText,
  Sparkles, LineChart, Check, Layers, Globe2, TrendingUp, Zap,
} from "lucide-react";
import { useInView, SectionEyebrow, SectionTitle, SectionSub } from "./landing-ui";
import { mockKeywords } from "./landing-data";
import { BRAND } from "@/constants/brand";

function PipelineStep({
  icon: Icon, label, sublabel, active, done, isLast,
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
      <div
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-500 ${
          active
            ? "border-brand-violet bg-brand-violet/20 shadow-[var(--shadow-glow-sm)] scale-110"
            : done
            ? "border-brand-violet/60 bg-brand-violet/10"
            : "border-border-subtle bg-surface-elevated"
        }`}
      >
        {active && <span className="absolute inset-0 rounded-full border-2 border-brand-violet animate-ping-slow" />}
        <Icon className={`h-4 w-4 transition-colors duration-300 ${active || done ? "text-brand-violet" : "text-text-tertiary"}`} />
      </div>
      {!isLast && (
        <div className="absolute left-[calc(50%+20px)] right-[calc(-50%+20px)] top-5 h-px overflow-hidden bg-border-subtle">
          <div className="h-full bg-brand-violet transition-all duration-700" style={{ width: done ? "100%" : "0%" }} />
        </div>
      )}
      <div className="text-center">
        <div className={`text-[11px] font-semibold transition-colors duration-300 ${active || done ? "text-text-primary" : "text-text-tertiary"}`}>{label}</div>
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
    const t = setInterval(() => setActiveStep(s => (s + 1) % steps.length), 1600);
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
      <div className="rounded-xl border border-border-subtle bg-surface-secondary/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="ai-orb" />
          <span className="text-[12.5px] text-text-secondary transition-all duration-300">{outputs[activeStep]}</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardPreview() {
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
          {/* Window chrome — intentional macOS dot colors */}
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

export function AssistantShowcase() {
  const [ref, inView] = useInView();
  return (
    <section id="assistant" className="px-4 py-28 sm:px-6">
      <div className="mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div
          ref={ref}
          className={`transition-all duration-700 ${inView ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}`}
        >
          <SectionEyebrow icon={<Globe2 className="h-3.5 w-3.5" />} label="One-click automation" />
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
        </div>

        <div
          className={`relative transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}
        >
          <div className="absolute inset-0 -z-10 rounded-[20px] bg-brand-violet/15 blur-3xl" />
          <div className="bg-glass space-y-5 overflow-hidden rounded-[20px] border border-border-subtle p-6 shadow-[var(--shadow-xl)]">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div className="flex items-center gap-2">
                <span className="ai-orb" />
                <span className="text-[13px] font-semibold">Automation pipeline</span>
              </div>
              <span className="rounded-full border border-status-success/30 bg-status-success/10 px-2 py-0.5 text-[10.5px] font-medium text-status-success">Running</span>
            </div>
            <AutomationPipeline />
            <div className="rounded-xl border border-brand-violet/25 bg-brand-violet/8 p-4">
              <div className="text-[12px] font-medium text-text-secondary mb-3">Ready to publish — 1 action needed:</div>
              <button className="w-full rounded-full bg-brand-violet py-2.5 text-[13px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:bg-brand-action-hover hover:shadow-[var(--shadow-glow-md)]">
                <span className="flex items-center justify-center gap-2">
                  <Zap className="h-4 w-4" />
                  Publish all 10 articles
                </span>
              </button>
              <div className="mt-2 text-center text-[10.5px] text-text-tertiary">Generates · audits · schedules · publishes in sequence</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
