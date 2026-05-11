"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useProject, qk } from "@/lib/query";
import { useQueryClient } from "@tanstack/react-query";
import { TARGET_REGIONS } from "@/lib/types";
import { toast } from "react-hot-toast";
import {
  generateInstantWebResearchArticleAction,
  suggestInstantArticleTopicAction,
} from "@/app/actions/instant-article-actions";

/**
 * Surfaces follow DESIGN.md (flat, border-led) + project chrome (keywords/overview):
 * mono section labels, 16px cards, pill actions, minimal elevation.
 */
const C = {
  page: "bg-surface-primary text-text-primary",
  card: "rounded-[16px] border border-border-subtle bg-surface-elevated",
  label: "mb-2 block font-mono text-[11px] font-normal uppercase tracking-widest text-text-secondary",
  field:
    "w-full rounded-[8px] border border-border-subtle bg-surface-secondary px-3 py-2.5 text-[14px] text-text-primary placeholder:text-text-tertiary outline-none transition-colors appearance-none focus:border-brand-action focus:ring-1 focus:ring-brand-action",
  muted: "text-text-tertiary",
  link: "text-brand-action hover:text-brand-action-hover",
  btnPrimary:
    "rounded-full bg-text-primary px-6 py-2.5 text-[14px] font-medium text-surface-primary transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40",
  btnSecondary:
    "rounded-full border border-border-subtle bg-surface-secondary px-4 py-2.5 text-[14px] font-medium text-text-primary transition-colors hover:bg-surface-hover",
  btnOutlineAccent:
    "rounded-full border border-brand-action bg-transparent px-4 py-2.5 text-[14px] font-medium text-text-primary transition-colors hover:bg-brand-action/10",
} as const;

const REGION_FLAG: Record<string, string> = {
  us: "🇺🇸",
  uk: "🇬🇧",
  in: "🇮🇳",
  au: "🇦🇺",
  ca: "🇨🇦",
  de: "🇩🇪",
  fr: "🇫🇷",
  sg: "🇸🇬",
  ae: "🇦🇪",
  nz: "🇳🇿",
};

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "hi", label: "Hindi" },
] as const;

const WRITING_STYLES = [
  { id: "", label: "Please select a Writing Style" },
  { id: "professional", label: "Professional" },
  { id: "conversational", label: "Conversational" },
  { id: "technical", label: "Technical" },
  { id: "friendly", label: "Friendly & approachable" },
  { id: "journalistic", label: "Journalistic" },
] as const;

const ARTICLE_TYPES = [
  { id: "ai_recommended", label: "AI Recommended", icon: "robot" as const },
  { id: "news", label: "News Articles", icon: "news" as const },
  { id: "blog", label: "Blog Posts", icon: "blog" as const },
  { id: "howto", label: "How-To Guides", icon: "howto" as const },
  { id: "listicle", label: "Listicles", icon: "list" as const },
  { id: "comparison", label: "Comparison Blogs", icon: "compare" as const },
  { id: "technical", label: "Technical Articles", icon: "tech" as const },
  { id: "product_review", label: "Product Reviews", icon: "star" as const },
  { id: "glossary", label: "Glossary Pages", icon: "book" as const },
] as const;

type ArticleTypeId = (typeof ARTICLE_TYPES)[number]["id"];
type ResearchMethod = "web" | "custom";

const MAX_CUSTOM_REFERENCES = 5;
const REF_FILE_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type ReferenceRow = {
  id: string;
  kind: "file" | "link";
  file: File | null;
  link: string;
};

function newRefRow(kind: "file" | "link"): ReferenceRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    kind,
    file: null,
    link: "",
  };
}

function cloneReferenceRows(rows: ReferenceRow[]): ReferenceRow[] {
  return rows.map(r => ({
    ...r,
    file: r.file,
  }));
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

function WandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 4 3 3m2-8 2 2-8.5 8.5a2.12 2.12 0 0 1-3 3L3 17l-1 4 4-1 3.5-3.5a2.12 2.12 0 0 1 3-3L20 6" />
    </svg>
  );
}

function ArticleTypeIcon({ kind, className }: { kind: (typeof ARTICLE_TYPES)[number]["icon"]; className?: string }) {
  const cn = className ?? "h-4 w-4";
  switch (kind) {
    case "robot":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="6" y="8" width="12" height="10" rx="2" />
          <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
          <path d="M9 16h6M12 8V5M10 5h4" strokeLinecap="round" />
        </svg>
      );
    case "news":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9h2v9Z" />
        </svg>
      );
    case "blog":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        </svg>
      );
    case "howto":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "list":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
        </svg>
      );
    case "compare":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="m16 3 4 4-4 4M8 21l-4-4 4-4M3 11h10M21 13H11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "tech":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
      );
    case "star":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    case "book":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    default:
      return null;
  }
}

function StepRow({
  stepNum,
  active,
  done,
  title,
}: {
  stepNum: number;
  active: boolean;
  done?: boolean;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-mono font-semibold tabular-nums ${
          active
            ? "bg-text-primary text-surface-primary"
            : done
              ? "border border-brand-action/50 bg-brand-action/10 text-brand-action"
              : "border border-border-subtle bg-surface-secondary text-text-tertiary"
        }`}
      >
        {done && !active ? "✓" : stepNum}
      </span>
      <span className={`text-[14px] leading-snug ${active ? "font-medium text-text-primary" : "font-normal text-text-tertiary"}`}>{title}</span>
    </div>
  );
}

function AddReferencesModal({
  open,
  onClose,
  initialRows,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initialRows: ReferenceRow[];
  onSave: (rows: ReferenceRow[]) => void;
}) {
  const [draft, setDraft] = useState<ReferenceRow[]>(() => [newRefRow("file"), newRefRow("link")]);

  useEffect(() => {
    if (!open) return;
    setDraft(
      initialRows.length > 0 ? cloneReferenceRows(initialRows) : [newRefRow("file"), newRefRow("link")]
    );
  }, [open, initialRows]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function updateRow(id: string, patch: Partial<ReferenceRow>) {
    setDraft(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setDraft(prev => (prev.length <= 1 ? prev : prev.filter(r => r.id !== id)));
  }

  function addRow() {
    setDraft(prev => {
      if (prev.length >= MAX_CUSTOM_REFERENCES) return prev;
      return [...prev, newRefRow("link")];
    });
  }

  function handleSave() {
    const cleaned = draft
      .map(r => {
        if (r.kind === "file") return r.file ? r : null;
        return r.link.trim() ? { ...r, link: r.link.trim() } : null;
      })
      .filter(Boolean) as ReferenceRow[];

    if (cleaned.length === 0) {
      toast.error("Add at least one file or link, or close without saving.");
      return;
    }
    if (cleaned.length > MAX_CUSTOM_REFERENCES) {
      toast.error(`You can add up to ${MAX_CUSTOM_REFERENCES} references.`);
      return;
    }
    onSave(cleaned);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div
        className="relative flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-[16px] border border-border-subtle bg-surface-primary shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-references-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle px-6 py-5">
          <h2 id="add-references-title" className="font-display text-[20px] font-semibold tracking-tight text-text-primary">
            Add References
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p className="text-[14px] leading-relaxed text-text-secondary">
            Include up to {MAX_CUSTOM_REFERENCES} files/links as references to aid in guiding the content creation process.
          </p>
          <p className="mt-5 text-[14px] font-semibold text-text-primary">Enter your own link/ file</p>

          <div className="mt-4 space-y-4">
            {draft.map(row => (
              <div key={row.id} className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
                <div className="relative w-full shrink-0 sm:w-[140px]">
                  <select
                    value={row.kind === "file" ? "file" : "link"}
                    onChange={e => {
                      const k = e.target.value === "file" ? "file" : "link";
                      updateRow(row.id, { kind: k, file: k === "link" ? null : row.file, link: k === "file" ? "" : row.link });
                    }}
                    className={`${C.field} w-full pr-9 text-[13px]`}
                    aria-label="Reference type"
                  >
                    <option value="file">Upload file</option>
                    <option value="link">Add link</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
                </div>

                <div className="min-w-0 flex-1">
                  {row.kind === "file" ? (
                    <label className="flex min-h-[46px] cursor-pointer flex-col justify-center rounded-[8px] border border-border-subtle bg-surface-secondary px-3 py-2.5">
                      <input
                        type="file"
                        accept={REF_FILE_ACCEPT}
                        className="sr-only"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (!f) return;
                          if (f.size > 10 * 1024 * 1024) {
                            toast.error("File must be 10 MB or smaller.");
                            return;
                          }
                          updateRow(row.id, { file: f });
                        }}
                      />
                      <span className={`text-[14px] font-medium ${C.link}`}>Upload a document</span>
                      <span className={`text-[12px] ${C.muted}`}>PDF, DOC, DOCX file up to 10 MB</span>
                      {row.file ? (
                        <span className="mt-1 truncate text-[12px] font-medium text-text-secondary" title={row.file.name}>
                          {row.file.name}
                        </span>
                      ) : null}
                    </label>
                  ) : (
                    <input
                      type="url"
                      value={row.link}
                      onChange={e => updateRow(row.id, { link: e.target.value })}
                      placeholder="Enter reference link here…"
                      className={C.field}
                      autoComplete="off"
                    />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  disabled={draft.length <= 1}
                  className="flex h-[46px] w-10 shrink-0 items-center justify-center rounded-[8px] border border-transparent text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30 dark:text-red-400"
                  aria-label="Remove reference row"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            disabled={draft.length >= MAX_CUSTOM_REFERENCES}
            className={`mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold ${C.link} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add another reference
          </button>
        </div>

        <div className="flex shrink-0 justify-end border-t border-border-subtle bg-surface-primary px-6 py-4">
          <button type="button" onClick={handleSave} className={C.btnPrimary}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ResearchCardArt({ variant }: { variant: "web" | "custom" }) {
  const grid =
    "pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,var(--border-subtle)_1px,transparent_1px),linear-gradient(to_bottom,var(--border-subtle)_1px,transparent_1px)] [background-size:14px_14px] dark:opacity-[0.22]";
  const badge =
    "rounded-[8px] border border-border-subtle bg-surface-primary px-2 py-1 text-[11px] font-mono font-medium uppercase tracking-wide text-text-secondary";
  if (variant === "web") {
    return (
      <div className="relative mb-4 h-[100px] overflow-hidden rounded-[8px] border border-border-subtle bg-surface-secondary">
        <div className={grid} />
        <div className="relative flex h-full items-center justify-center gap-3 sm:gap-4">
          <span className={badge}>Reddit</span>
          <span className={badge}>Medium</span>
          <span className={badge}>Wiki</span>
        </div>
      </div>
    );
  }
  return (
    <div className="relative mb-4 h-[100px] overflow-hidden rounded-[8px] border border-border-subtle bg-surface-secondary">
      <div className={grid} />
      <div className="relative flex h-full items-center justify-center gap-3 sm:gap-4">
        <span className={badge}>PDF</span>
        <span className={badge}>DOCX</span>
        <span className={badge}>Links</span>
      </div>
    </div>
  );
}

export default function InstantArticlePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const base = `/projects/${projectId}`;
  const genBase = `${base}/content-generator`;

  const { data: projectRes } = useProject(projectId);
  const project = projectRes?.success ? projectRes.data : undefined;

  const [step, setStep] = useState<1 | 2>(1);
  /** Full-screen progress + Gemini/Serper run (AI Web Research only). */
  const [phase, setPhase] = useState<"idle" | "generating">("idle");
  const [progressPct, setProgressPct] = useState(0);
  const [topic, setTopic] = useState("");
  const [region, setRegion] = useState("us");
  const [language, setLanguage] = useState("en");
  const [writingStyle, setWritingStyle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [articleType, setArticleType] = useState<ArticleTypeId>("ai_recommended");
  const [research, setResearch] = useState<ResearchMethod>("web");
  const [customReferenceRows, setCustomReferenceRows] = useState<ReferenceRow[]>([]);
  const [addReferencesOpen, setAddReferencesOpen] = useState(false);
  const [askAiLoading, setAskAiLoading] = useState(false);

  useEffect(() => {
    const tr = project?.target_region?.trim().toLowerCase();
    if (tr && TARGET_REGIONS.some(r => r.code === tr)) setRegion(tr);
  }, [project?.target_region]);

  const regionLabel = useMemo(() => TARGET_REGIONS.find(r => r.code === region)?.name ?? region, [region]);
  const writerTitle = project?.company?.trim() || "Your project";
  const breadcrumbCurrent = writerTitle;

  const heroTitle = useMemo(() => {
    if (phase === "generating") return "Crafting your article";
    if (step === 2) return "Review & generate";
    return "Instant article";
  }, [phase, step]);

  const heroLead = useMemo(() => {
    if (phase === "generating")
      return "Estimated time remaining: about 5 minutes. Keep this tab open while we run web research and drafting.";
    if (step === 2)
      return "Confirm your choices below. Generation uses live web research and your cached project brief.";
    return "Configure topic, audience, and research — then produce a traffic-ready draft in one run.";
  }, [phase, step]);

  async function askAi() {
    if (!projectId) {
      toast.error("Missing project.");
      return;
    }
    setAskAiLoading(true);
    try {
      const res = await suggestInstantArticleTopicAction(projectId, { region, language });
      if (res.suggestTrace?.length) {
        console.log("[Instant article] Ask AI trace:", res.suggestTrace);
      }
      if (res.success) {
        setTopic(res.topic);
        setKeywords(res.keywords);
        toast.success("Topic and keywords filled from AI.");
      } else {
        toast.error(res.error || "Ask AI failed");
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Ask AI failed");
    } finally {
      setAskAiLoading(false);
    }
  }

  function goGenerate() {
    if (!topic.trim()) {
      toast.error("Enter a topic or use Ask AI.");
      return;
    }
    if (!writingStyle) {
      toast.error("Select a writing style.");
      return;
    }
    setStep(2);
  }

  useEffect(() => {
    if (phase !== "generating") {
      setProgressPct(0);
      return;
    }
    setProgressPct(4);
    const tick = setInterval(() => {
      setProgressPct(p => {
        if (p >= 90) return 90;
        return p + 2 + Math.random() * 6;
      });
    }, 700);
    return () => clearInterval(tick);
  }, [phase]);

  const runWebResearchGeneration = useCallback(async () => {
    if (!projectId) {
      toast.error("Missing project.");
      return;
    }
    if (research !== "web") {
      toast.error("This flow is for AI Web Research. Switch research method or use the calendar.");
      return;
    }
    if (!topic.trim() || !writingStyle) {
      toast.error("Complete topic and writing style first.");
      return;
    }
    setPhase("generating");
    try {
      const res = await generateInstantWebResearchArticleAction(projectId, {
        topic: topic.trim(),
        region,
        language,
        writingStyle,
        writingStyleLabel: WRITING_STYLES.find(s => s.id === writingStyle)?.label ?? writingStyle,
        keywords,
        articleType,
        articleTypeLabel: ARTICLE_TYPES.find(t => t.id === articleType)?.label ?? articleType,
      });
      if (res.instantArticleTrace?.length) {
        console.log("[Instant article] trace:", res.instantArticleTrace);
      }
      if (res.success) {
        setProgressPct(100);
        toast.success("Article ready — opening editor");
        void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
        router.push(`${base}/blogs/${res.data.id}`);
      } else {
        toast.error(res.error || "Generation failed");
        setPhase("idle");
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Generation failed");
      setPhase("idle");
    }
  }, [
    projectId,
    research,
    topic,
    writingStyle,
    keywords,
    articleType,
    region,
    language,
    router,
    base,
    queryClient,
  ]);

  return (
    <div className={`${C.page} relative min-h-[calc(100dvh-5rem)] space-y-10 pb-16 pl-4 pr-4`}>
      <div className="pt-4 pb-8 border-b border-border-subtle">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-[14px] text-text-tertiary">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 font-mono text-[12px] uppercase tracking-widest text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-brand-action" />
            Content generation
          </span>
          <ProjectNavLink
            href={genBase}
            className="font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            AI Article Writer
          </ProjectNavLink>
          <span className="opacity-30" aria-hidden>
            /
          </span>
          <span className="font-mono text-text-primary">{breadcrumbCurrent}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-3xl">
            <h1 className="font-display text-[40px] font-normal leading-none tracking-[-0.8px] text-text-primary sm:text-[48px] sm:tracking-[-0.96px]">
              {heroTitle}
            </h1>
            <p className="mt-3 text-[16px] leading-relaxed text-text-tertiary">{heroLead}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(248px,280px)_1fr] lg:items-start">
        <aside className="space-y-5 lg:sticky lg:top-6">
          <div className={`${C.card} p-5`}>
            <h2 className="font-display text-[18px] font-normal tracking-tight text-text-primary">AI Article Writer</h2>
            <p className={`mt-2 text-[13px] leading-relaxed ${C.muted}`}>
              Factually accurate, SEO-optimized articles and blogs of up to 5000 words.
            </p>
          </div>

          <div className={`${C.card} p-5`}>
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-text-secondary">Progress</span>
              <ProjectNavLink href={genBase} className={`text-[12px] font-medium ${C.link}`}>
                Change
              </ProjectNavLink>
            </div>
            <p className="mb-4 text-[15px] font-medium text-text-primary">Instant Article</p>
            <div className="space-y-4">
              <StepRow
                stepNum={1}
                active={step === 1 && phase === "idle"}
                done={step === 2 || phase === "generating"}
                title="Enter Article Details"
              />
              <StepRow
                stepNum={2}
                active={(step === 2 && phase === "idle") || phase === "generating"}
                done={false}
                title={phase === "generating" ? "Generating…" : "Generate Article"}
              />
            </div>
            {phase === "generating" || step === 2 ? (
              <div className="mt-4 border-t border-border-subtle pt-4">
                <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-text-secondary">Your topic</p>
                <p className={`mt-1 text-[13px] leading-snug text-text-primary`}>{topic.trim() || "—"}</p>
                {phase === "generating" ? (
                  <button type="button" disabled className={`${C.btnPrimary} mt-4 w-full opacity-60`}>
                    Generating…
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={runWebResearchGeneration}
                    disabled={research !== "web"}
                    className={`${C.btnPrimary} mt-4 w-full`}
                  >
                    Generate Article
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </aside>

        <div className="flex min-h-[min(70vh,calc(100dvh-12rem))] min-w-0 flex-1 flex-col">
          {phase === "generating" ? (
            <div className={`${C.card} flex flex-1 flex-col justify-center p-6 sm:p-8`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-text-secondary">Article progress</span>
                  <span className="tabular-nums text-text-tertiary">{Math.round(Math.min(progressPct, 100))}% complete</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full border border-border-subtle bg-surface-secondary">
                  <div
                    className="h-full rounded-full bg-brand-action transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.min(progressPct, 100)}%` }}
                  />
                </div>
                <p className={`text-[14px] leading-relaxed ${C.muted}`}>
                  Harnessing AI to create high quality, SEO-optimized content tailored to your needs.
                </p>
              </div>
            </div>
          ) : step === 1 ? (
              <div className="flex-1 space-y-10">
                <div>
                  <label className={C.label} htmlFor="instant-topic">
                    Topic
                  </label>
                  <input
                    id="instant-topic"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="Enter your topic or title…"
                    className={C.field}
                    aria-label="Article topic or title"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className={C.label}>Target Audience Location</label>
                    <div className="relative">
                      <select value={region} onChange={e => setRegion(e.target.value)} className={`${C.field} pr-9`}>
                        {TARGET_REGIONS.map(r => (
                          <option key={r.code} value={r.code}>
                            {(REGION_FLAG[r.code] ?? "🌐") + " " + r.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
                    </div>
                  </div>
                  <div>
                    <label className={C.label}>Article Language</label>
                    <div className="relative">
                      <select value={language} onChange={e => setLanguage(e.target.value)} className={`${C.field} pr-9`}>
                        {LANGUAGES.map(l => (
                          <option key={l.code} value={l.code}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
                    </div>
                  </div>
                  <div>
                    <label className={C.label}>Writing Style</label>
                    <div className="relative">
                      <select
                        value={writingStyle}
                        onChange={e => setWritingStyle(e.target.value)}
                        className={`${C.field} pr-9 ${!writingStyle ? "border-brand-action ring-1 ring-brand-action/35" : ""}`}
                      >
                        {WRITING_STYLES.map(s => (
                          <option key={s.id || "placeholder"} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className={C.label}>Keywords (Optional)</label>
                  <input
                    value={keywords}
                    onChange={e => setKeywords(e.target.value)}
                    placeholder="seo, organic traffic, content strategy"
                    className={C.field}
                  />
                </div>

                <div>
                  <label className={C.label}>Article Type</label>
                  <div className="flex flex-wrap gap-2">
                    {ARTICLE_TYPES.map(t => {
                      const selected = articleType === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setArticleType(t.id)}
                          className={`inline-flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[13px] font-medium transition-colors ${
                            selected
                              ? "border-text-primary bg-text-primary text-surface-primary"
                              : "border-border-subtle bg-surface-secondary text-text-secondary hover:border-border-strong"
                          }`}
                        >
                          <ArticleTypeIcon
                            kind={t.icon}
                            className={selected ? "h-4 w-4 text-surface-primary" : "h-4 w-4 text-text-tertiary"}
                          />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className={C.label}>Research Method</label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setResearch("web")}
                      className={`flex flex-col rounded-[16px] border p-5 text-left transition-colors ${
                        research === "web"
                          ? "border-brand-action ring-2 ring-brand-action/25 bg-surface-elevated"
                          : "border-border-subtle bg-surface-elevated hover:border-border-strong"
                      }`}
                    >
                      <ResearchCardArt variant="web" />
                      <span className="font-display text-[18px] font-normal tracking-tight text-text-primary">
                        AI Web Research (Recommended)
                      </span>
                      <p className={`mt-1 text-[12px] ${C.muted}`}>Reddit · Medium · Wikipedia-style sources</p>
                      <ul className="mt-4 space-y-2 text-[13px] text-text-secondary">
                        <li className="flex gap-2">
                          <span className="text-brand-action">•</span>
                          Analyzes many relevant articles
                        </li>
                        <li className="flex gap-2">
                          <span className="text-brand-action">•</span>
                          Includes competitor-aware context
                        </li>
                        <li className="flex gap-2">
                          <span className="text-brand-action">•</span>
                          Up-to-date information
                        </li>
                        <li className="flex gap-2">
                          <span className="text-brand-action">•</span>
                          Best for new or broad topics
                        </li>
                      </ul>
                      <span
                        className={`mt-4 inline-flex w-fit rounded-full px-4 py-2 text-[12px] font-medium ${
                          research === "web"
                            ? "bg-text-primary text-surface-primary"
                            : "border border-border-subtle bg-surface-secondary text-text-tertiary"
                        }`}
                      >
                        {research === "web" ? "✓ Selected" : "Select Method"}
                      </span>
                    </button>

                    <div
                      onClick={() => setResearch("custom")}
                      className={`flex cursor-pointer flex-col rounded-[16px] border p-5 text-left transition-colors ${
                        research === "custom"
                          ? "border-brand-action ring-2 ring-brand-action/25 bg-surface-elevated"
                          : "border-border-subtle bg-surface-elevated hover:border-border-strong"
                      }`}
                    >
                      <ResearchCardArt variant="custom" />
                      <span className="font-display text-[18px] font-normal tracking-tight text-text-primary">Custom Sources</span>
                      <p className={`mt-1 text-[12px] ${C.muted}`}>PDF · DOCX · Your links</p>
                      <ul className="mt-4 space-y-2 text-[13px] text-text-secondary">
                        <li className="flex gap-2">
                          <span className="text-brand-action">•</span>
                          Upload your own files or links
                        </li>
                        <li className="flex gap-2">
                          <span className="text-brand-action">•</span>
                          Use your existing content
                        </li>
                        <li className="flex gap-2">
                          <span className="text-brand-action">•</span>
                          Stronger brand consistency
                        </li>
                        <li className="flex gap-2">
                          <span className="text-brand-action">•</span>
                          Best for proprietary topics
                        </li>
                      </ul>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setAddReferencesOpen(true);
                        }}
                        className={`mt-4 inline-flex w-fit rounded-full px-4 py-2 text-left text-[12px] font-medium transition-colors ${
                          research === "custom"
                            ? "bg-text-primary text-surface-primary"
                            : "border border-border-subtle bg-surface-secondary text-text-tertiary hover:border-border-strong hover:text-text-secondary"
                        }`}
                      >
                        {research === "custom" ? "✓ Selected" : "Select Method"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1">
                <div className={`${C.card} p-6 sm:p-8`}>
                  <p className={`mb-6 font-mono text-[11px] font-normal uppercase tracking-widest text-text-secondary`}>
                    Summary
                  </p>
                  <dl className="grid gap-5 text-[14px] sm:grid-cols-2">
                    <div>
                      <dt className="font-mono text-[10px] font-normal uppercase tracking-widest text-text-tertiary">Topic</dt>
                      <dd className="mt-1 font-medium text-text-primary">{topic.trim()}</dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] font-normal uppercase tracking-widest text-text-tertiary">Region</dt>
                      <dd className="mt-1 font-medium text-text-primary">{regionLabel}</dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] font-normal uppercase tracking-widest text-text-tertiary">Language</dt>
                      <dd className="mt-1 font-medium text-text-primary">
                        {LANGUAGES.find(l => l.code === language)?.label ?? language}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] font-normal uppercase tracking-widest text-text-tertiary">Writing style</dt>
                      <dd className="mt-1 font-medium text-text-primary">
                        {WRITING_STYLES.find(s => s.id === writingStyle)?.label ?? writingStyle}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] font-normal uppercase tracking-widest text-text-tertiary">Article type</dt>
                      <dd className="mt-1 font-medium text-text-primary">
                        {ARTICLE_TYPES.find(t => t.id === articleType)?.label ?? articleType}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] font-normal uppercase tracking-widest text-text-tertiary">Research</dt>
                      <dd className="mt-1 font-medium text-text-primary">
                        {research === "web" ? "AI Web Research" : "Custom Sources"}
                      </dd>
                    </div>
                    {keywords.trim() ? (
                      <div className="sm:col-span-2">
                        <dt className="font-mono text-[10px] font-normal uppercase tracking-widest text-text-tertiary">Keywords</dt>
                        <dd className="mt-1 font-medium text-text-primary">{keywords.trim()}</dd>
                      </div>
                    ) : null}
                  </dl>

                  <p className={`mt-6 text-[14px] leading-relaxed ${C.muted}`}>
                    {research === "web"
                      ? "When you are ready, choose Generate Article (sidebar or footer). We will gather live SERP context, call Gemini with your project brief, then open the blog viewer with your draft."
                      : "Instant generation with custom uploads is not available yet. Switch to AI Web Research above, or queue posts from the calendar."}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <ProjectNavLink href={`${base}/calendar}`} className={`${C.btnPrimary} inline-flex items-center justify-center no-underline`}>
                      Open calendar
                    </ProjectNavLink>
                    <ProjectNavLink
                      href={`${base}/keywords`}
                      className={`${C.btnSecondary} inline-flex items-center justify-center no-underline`}
                    >
                      Keywords workspace
                    </ProjectNavLink>
                  </div>
                </div>
              </div>
            )}

            <footer className="sticky bottom-0 z-30 mt-10 border-t border-border-subtle bg-surface-primary/90 py-4 pt-5 backdrop-blur-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {phase === "generating" ? (
                  <span className="text-[13px] text-text-tertiary">Please keep this tab open…</span>
                ) : step === 2 ? (
                  <button type="button" onClick={() => setStep(1)} className={C.btnSecondary}>
                    Back
                  </button>
                ) : (
                  <ProjectNavLink href={genBase} className={`${C.btnSecondary} no-underline`}>
                    Back
                  </ProjectNavLink>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                  {phase === "generating" ? null : step === 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void askAi()}
                        disabled={askAiLoading}
                        className={`${C.btnOutlineAccent} inline-flex items-center gap-2`}
                      >
                        <WandIcon className="h-4 w-4 text-brand-action" />
                        {askAiLoading ? "Thinking…" : "Ask AI"}
                      </button>
                      <button type="button" onClick={goGenerate} className={C.btnPrimary}>
                        Generate Article
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void askAi()}
                        disabled={askAiLoading}
                        className={`${C.btnOutlineAccent} inline-flex items-center gap-2`}
                      >
                        <WandIcon className="h-4 w-4 text-brand-action" />
                        {askAiLoading ? "Thinking…" : "Ask AI"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (research !== "web") {
                            toast.error("Instant generation with custom sources is not available yet. Switch to AI Web Research or use the calendar.");
                            return;
                          }
                          void runWebResearchGeneration();
                        }}
                        className={C.btnPrimary}
                      >
                        Generate Article
                      </button>
                    </>
                  )}
                </div>
              </div>
            </footer>
        </div>
      </div>

      <AddReferencesModal
        open={addReferencesOpen}
        onClose={() => setAddReferencesOpen(false)}
        initialRows={customReferenceRows}
        onSave={rows => {
          setCustomReferenceRows(cloneReferenceRows(rows));
          setResearch("custom");
          setAddReferencesOpen(false);
          toast.success(`Saved ${rows.length} reference${rows.length === 1 ? "" : "s"}.`);
        }}
      />
    </div>
  );
}
