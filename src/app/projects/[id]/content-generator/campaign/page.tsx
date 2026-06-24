"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { Button, PageShell } from "@/components/common";
import { cn } from "@/lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContentPlanCard {
  type: "blog" | "ebook" | "whitepaper" | "linkedin";
  label: string;
  description: string;
  duration: string;
  audience: string;
  icon: React.ReactNode;
  iconBg: string;
  accentColor: string;
  href: (base: string, topic: string, keyword: string) => string;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function BlogIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5" aria-hidden>
      <rect x="2" y="3" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7h9M5.5 10h6M5.5 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EbookIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5" aria-hidden>
      <rect x="3" y="2" width="8" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="12" y="2" width="5" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 6h3M5.5 9h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function WhitepaperIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5" aria-hidden>
      <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 6h8M6 9h5M6 12h8M6 15h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5" aria-hidden>
      <rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6.5" cy="7" r="1.2" fill="currentColor" />
      <path d="M5.5 9.5v5M8 9.5v5M8 11.5c0-1.1.9-2 2-2s2 .9 2 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Content plan cards ────────────────────────────────────────────────────────

const PLAN_CARDS: ContentPlanCard[] = [
  {
    type: "blog",
    label: "Blog Post",
    description: "SEO-optimised long-form article with live research, topical outline, and hero image.",
    duration: "~1 min",
    audience: "Organic search / readers",
    icon: <BlogIcon />,
    iconBg: "bg-violet-500/10 text-violet-400",
    accentColor: "border-violet-500/30 hover:border-violet-500/60",
    href: (base, topic, keyword) =>
      `${base}/blogs?topic=${encodeURIComponent(topic)}&keyword=${encodeURIComponent(keyword)}`,
  },
  {
    type: "ebook",
    label: "eBook",
    description: "Multi-chapter lead-magnet with structured chapters, tables, and gated-content formatting.",
    duration: "~3 min",
    audience: "Lead generation / gating",
    icon: <EbookIcon />,
    iconBg: "bg-indigo-500/10 text-indigo-400",
    accentColor: "border-indigo-500/30 hover:border-indigo-500/60",
    href: (base, topic, keyword) =>
      `${base}/ebooks?topic=${encodeURIComponent(topic)}&keyword=${encodeURIComponent(keyword)}`,
  },
  {
    type: "whitepaper",
    label: "Whitepaper",
    description: "Research-grade document with executive summary, data sections, and formal citations.",
    duration: "~4 min",
    audience: "B2B / decision makers",
    icon: <WhitepaperIcon />,
    iconBg: "bg-blue-500/10 text-blue-400",
    accentColor: "border-blue-500/30 hover:border-blue-500/60",
    href: (base, topic, keyword) =>
      `${base}/whitepapers?topic=${encodeURIComponent(topic)}&keyword=${encodeURIComponent(keyword)}`,
  },
  {
    type: "linkedin",
    label: "LinkedIn Post",
    description: "Thought-leadership post distilled from the topic — hook, insight, CTA, hashtags.",
    duration: "~30 sec",
    audience: "Professional network",
    icon: <LinkedInIcon />,
    iconBg: "bg-cyan-500/10 text-cyan-400",
    accentColor: "border-cyan-500/30 hover:border-cyan-500/60",
    href: (base, topic, keyword) =>
      `${base}/linkedin?topic=${encodeURIComponent(topic)}&keyword=${encodeURIComponent(keyword)}`,
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CampaignModePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const base = `/projects/${projectId}/content-generator`;

  const [topic, setTopic] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<Set<ContentPlanCard["type"]>>(
    new Set(["blog", "ebook", "whitepaper", "linkedin"]),
  );
  const [launched, setLaunched] = useState(false);

  const toggleCard = useCallback((type: ContentPlanCard["type"]) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const handleLaunch = useCallback(() => {
    if (!topic.trim()) return;
    const cards = PLAN_CARDS.filter(c => selected.has(c.type));
    if (cards.length === 0) return;
    setLaunched(true);
    // Open first selected in current tab, rest in new tabs
    const [first, ...rest] = cards;
    for (const card of rest) {
      window.open(card.href(base, topic.trim(), keyword.trim()), "_blank", "noopener");
    }
    router.push(first.href(base, topic.trim(), keyword.trim()));
  }, [topic, keyword, selected, base, router]);

  const isReady = topic.trim().length > 0 && selected.size > 0;

  return (
    <PageShell
      title="Campaign Mode"
      subtitle="One topic → all content types. Enter your topic once and launch every format with a single click."
      backHref={base}
      backLabel="Content Studio"
    >
      <div className="max-w-2xl space-y-8">
        {/* ── Topic input ── */}
        <section className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-text-primary" htmlFor="campaign-topic">
              Topic / title
            </label>
            <p className="text-[12px] text-text-tertiary">
              The central idea for this content campaign. Be specific — "AI in B2B sales automation" beats "AI".
            </p>
            <input
              id="campaign-topic"
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. How AI is transforming B2B sales automation in 2025"
              className={cn(
                "w-full h-11 px-4 rounded-[10px] border bg-surface-elevated text-[14px] text-text-primary",
                "placeholder:text-text-tertiary focus:outline-none transition-all",
                topic.trim()
                  ? "border-brand-violet/50 focus:border-brand-violet"
                  : "border-border-subtle focus:border-border-default",
              )}
              onKeyDown={e => e.key === "Enter" && isReady && handleLaunch()}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-text-primary" htmlFor="campaign-keyword">
              Primary keyword{" "}
              <span className="text-text-tertiary font-normal">(optional)</span>
            </label>
            <input
              id="campaign-keyword"
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="e.g. ai b2b sales automation"
              className="w-full h-10 px-4 rounded-[10px] border border-border-subtle bg-surface-elevated text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-default transition-all"
            />
          </div>
        </section>

        {/* ── Content type selector ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-text-primary">
              Content types to generate
            </span>
            <span className="text-[11px] text-text-tertiary">
              {selected.size} of {PLAN_CARDS.length} selected
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PLAN_CARDS.map((card, i) => {
              const isSelected = selected.has(card.type);
              return (
                <motion.button
                  key={card.type}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: i * 0.05 }}
                  onClick={() => toggleCard(card.type)}
                  className={cn(
                    "relative text-left rounded-[12px] border p-4 transition-all",
                    isSelected
                      ? `bg-surface-elevated ${card.accentColor}`
                      : "bg-surface-secondary border-border-subtle opacity-50 hover:opacity-70",
                  )}
                >
                  {/* Selected checkmark */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand-violet"
                      >
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none" aria-hidden>
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </motion.span>
                    )}
                  </AnimatePresence>

                  <div className="flex items-start gap-3">
                    <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]", card.iconBg)}>
                      {card.icon}
                    </span>
                    <div className="min-w-0 flex-1 pr-6">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-semibold text-text-primary">{card.label}</span>
                        <span className="text-[10px] text-text-tertiary tabular-nums">{card.duration}</span>
                      </div>
                      <p className="text-[11.5px] text-text-secondary leading-relaxed">{card.description}</p>
                      <p className="mt-1.5 text-[10px] text-text-tertiary uppercase tracking-wide font-medium">
                        {card.audience}
                      </p>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* ── Launch CTA ── */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            variant="primary"
            size="lg"
            disabled={!isReady || launched}
            onClick={handleLaunch}
            className="sm:w-auto w-full"
          >
            {launched ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
                Opening studios…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.82m5.84-2.56a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.818m2.564-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
                </svg>
                Launch {selected.size} studio{selected.size !== 1 ? "s" : ""}
              </>
            )}
          </Button>

          <p className="text-[11.5px] text-text-tertiary leading-relaxed">
            {selected.size > 1
              ? `Opens ${selected.size} content studios — first one in this tab, rest in new tabs.`
              : "Opens the selected content studio with your topic pre-filled."}
          </p>
        </section>

        {/* ── How it works ── */}
        <section className="rounded-[12px] border border-border-subtle bg-surface-secondary/40 p-5 space-y-3">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-text-tertiary">How it works</p>
          <ol className="space-y-2">
            {[
              "Enter your topic and optional primary keyword above.",
              "Toggle which content types you want — all 4 is the full campaign.",
              "Click Launch — each studio opens pre-filled with your topic.",
              "Generate in any order. All results save to Content History.",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-[12.5px] text-text-secondary leading-relaxed">
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-surface-elevated border border-border-subtle text-[10px] font-bold text-text-tertiary tabular-nums">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </PageShell>
  );
}
