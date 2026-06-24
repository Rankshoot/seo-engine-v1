"use client";

import { ArrowRight, Check, Layers, Workflow } from "lucide-react";
import { useInView, SectionEyebrow, SectionTitle, SectionSub } from "./landing-ui";
import { painPoints, features, workflowOutcomes } from "./landing-data";

export function PainSection() {
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

export function FeaturesGrid() {
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

export function WorkflowSection() {
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
          <div className="absolute left-[calc(12.5%+2rem)] right-[calc(12.5%+2rem)] top-8 hidden h-px bg-gradient-to-r from-transparent via-brand-violet/25 to-transparent lg:block" />
          {workflowOutcomes.map((step, i) => (
            <div
              key={step.phase}
              className={`relative overflow-hidden rounded-[20px] border border-border-subtle bg-surface-elevated p-6 shadow-[var(--shadow-sm)] transition-all duration-700 hover:-translate-y-1 hover:shadow-[var(--shadow-md)] ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
              style={{ transitionDelay: inView ? `${i * 120}ms` : "0ms" }}
            >
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-brand-violet/60 to-transparent" />
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-brand-violet/25 bg-brand-violet/10 px-2.5 py-0.5 text-[11px] font-bold text-brand-violet">{step.phase}</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-violet/10 text-brand-violet">
                  <step.icon className="h-4 w-4" />
                </div>
              </div>
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-text-primary">{step.title}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-text-tertiary">{step.desc}</p>
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
