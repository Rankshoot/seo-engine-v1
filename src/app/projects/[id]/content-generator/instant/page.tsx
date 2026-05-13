"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import {
  PageTitle,
  Button,
  Field,
  Input,
  Select,
  Card,
  Dialog,
  Spinner,
} from "@/components/common";
import { cn } from "@/lib/cn";
import { useProject, qk } from "@/lib/query";
import { useQueryClient } from "@tanstack/react-query";
import { TARGET_REGIONS } from "@/lib/types";
import { toast } from "react-hot-toast";
import {
  generateInstantWebResearchArticleAction,
  suggestInstantArticleTopicAction,
  type InstantCustomRefPayload,
} from "@/app/actions/instant-article-actions";

/**
 * Instant Article — single-column, project-chrome layout.
 *
 * UX pillars (match every other project page):
 *   • Breadcrumb chip + page title in a top-header block
 *   • Primary + secondary CTAs live in the header (top-right), NOT in a sticky
 *     bottom footer.
 *   • Form is single-column, divided into eyebrow-labelled sections.
 *   • Step 1 (form) → Step 2 (review) → Generating (progress) — the active step
 *     is shown via a thin top indicator, not a sidebar.
 *   • Design-system primitives end-to-end (Field/Input/Select/Button/Card/Dialog).
 */

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
const REF_FILE_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
  return rows.map(r => ({ ...r, file: r.file }));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[],
    );
  }
  return btoa(binary);
}

async function serializeCustomReferences(rows: ReferenceRow[]): Promise<InstantCustomRefPayload[]> {
  const out: InstantCustomRefPayload[] = [];
  for (const r of rows) {
    if (r.kind === "file" && r.file) {
      const buf = await r.file.arrayBuffer();
      if (buf.byteLength > 10 * 1024 * 1024) {
        throw new Error(`"${r.file.name}" is over 10 MB.`);
      }
      out.push({
        kind: "file",
        filename: r.file.name,
        mimeType: r.file.type || "application/octet-stream",
        dataBase64: arrayBufferToBase64(buf),
      });
    } else if (r.kind === "link") {
      const u = r.link.trim();
      if (u.length > 4) out.push({ kind: "link", url: u });
    }
  }
  return out;
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function WandIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 4 3 3m2-8 2 2-8.5 8.5a2.12 2.12 0 0 1-3 3L3 17l-1 4 4-1 3.5-3.5a2.12 2.12 0 0 1 3-3L20 6" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </svg>
  );
}

function ArticleTypeIcon({
  kind,
  className,
}: {
  kind: (typeof ARTICLE_TYPES)[number]["icon"];
  className?: string;
}) {
  const c = className ?? "h-4 w-4";
  switch (kind) {
    case "robot":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="6" y="8" width="12" height="10" rx="2" />
          <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
          <path d="M9 16h6M12 8V5M10 5h4" strokeLinecap="round" />
        </svg>
      );
    case "news":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9h2v9Z" />
        </svg>
      );
    case "blog":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        </svg>
      );
    case "howto":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "list":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
        </svg>
      );
    case "compare":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path
            d="m16 3 4 4-4 4M8 21l-4-4 4-4M3 11h10M21 13H11"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "tech":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
      );
    case "star":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    case "book":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    default:
      return null;
  }
}

// ─── Add references modal ──────────────────────────────────────────────────

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
      initialRows.length > 0
        ? cloneReferenceRows(initialRows)
        : [newRefRow("file"), newRefRow("link")],
    );
  }, [open, initialRows]);

  function updateRow(id: string, patch: Partial<ReferenceRow>) {
    setDraft(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setDraft(prev => (prev.length <= 1 ? prev : prev.filter(r => r.id !== id)));
  }

  function addRow() {
    setDraft(prev => (prev.length >= MAX_CUSTOM_REFERENCES ? prev : [...prev, newRefRow("link")]));
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
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Add references"
      description={`Include up to ${MAX_CUSTOM_REFERENCES} files or links to guide the writer.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save references
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {draft.map(row => (
          <div key={row.id} className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
            <div className="w-full shrink-0 sm:w-[140px]">
              <Select
                value={row.kind}
                onChange={e => {
                  const k = e.target.value === "file" ? "file" : "link";
                  updateRow(row.id, {
                    kind: k,
                    file: k === "link" ? null : row.file,
                    link: k === "file" ? "" : row.link,
                  });
                }}
                aria-label="Reference type"
              >
                <option value="file">Upload file</option>
                <option value="link">Add link</option>
              </Select>
            </div>

            <div className="min-w-0 flex-1">
              {row.kind === "file" ? (
                <label className="flex min-h-9 cursor-pointer flex-col justify-center rounded-md border border-border-subtle bg-surface-secondary px-3 py-2 transition-colors hover:bg-surface-hover">
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
                  <span className="text-[13px] font-medium text-brand-action">
                    {row.file ? "Replace document" : "Upload a document"}
                  </span>
                  <span className="text-[11px] text-text-tertiary">
                    PDF, DOC, DOCX · up to 10 MB
                  </span>
                  {row.file ? (
                    <span
                      className="mt-1 truncate text-[12px] font-medium text-text-secondary"
                      title={row.file.name}
                    >
                      {row.file.name}
                    </span>
                  ) : null}
                </label>
              ) : (
                <Input
                  type="url"
                  value={row.link}
                  onChange={e => updateRow(row.id, { link: e.target.value })}
                  placeholder="https://example.com/article"
                  autoComplete="off"
                />
              )}
            </div>

            <button
              type="button"
              onClick={() => removeRow(row.id)}
              disabled={draft.length <= 1}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-rose-500/10 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Remove reference"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          disabled={draft.length >= MAX_CUSTOM_REFERENCES}
          className="inline-flex items-center gap-1.5 pt-1 text-[13px] font-semibold text-brand-action transition-colors hover:text-brand-action-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add another reference
        </button>
      </div>
    </Dialog>
  );
}

// ─── Section helpers ───────────────────────────────────────────────────────

function SectionHeading({ index, label }: { index: string; label: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="font-mono text-[11px] font-medium tabular-nums text-text-tertiary">
        {index}
      </span>
      <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-text-secondary">
        {label}
      </span>
      <span className="h-px flex-1 bg-border-subtle" aria-hidden />
    </div>
  );
}

function StepPill({
  index,
  label,
  active,
  done,
}: {
  index: string;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 transition-colors duration-(--duration-base)",
        active ? "text-text-primary" : done ? "text-text-secondary" : "text-text-tertiary",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-semibold tabular-nums",
          active
            ? "border-brand-action bg-brand-action text-white"
            : done
              ? "border-brand-action/50 bg-brand-action/15 text-brand-action"
              : "border-border-subtle bg-surface-secondary text-text-tertiary",
        )}
      >
        {done && !active ? "✓" : index}
      </span>
      <span className="text-[13px] font-medium">{label}</span>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

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

  const regionLabel = useMemo(
    () => TARGET_REGIONS.find(r => r.code === region)?.name ?? region,
    [region],
  );

  const heroTitle = useMemo(() => {
    if (phase === "generating") return "Crafting your article";
    if (step === 2) return "Review & generate";
    return "Instant article";
  }, [phase, step]);

  const heroLead = useMemo(() => {
    if (phase === "generating") {
      return research === "custom"
        ? "Estimated time: up to about 5 minutes. Keep this tab open while we ingest your references, add SERP context, and draft."
        : "Estimated time remaining: about 5 minutes. Keep this tab open while we run web research and drafting.";
    }
    if (step === 2) {
      return research === "custom"
        ? "Confirm your choices below. Saved files and links are merged into the writer prompt with live SERP context plus your cached project brief."
        : "Confirm your choices below. Generation uses live web research and your cached project brief.";
    }
    return "Configure topic, audience, and research — then produce a traffic-ready draft in one run.";
  }, [phase, step, research]);

  async function askAi() {
    if (!projectId) {
      toast.error("Missing project.");
      return;
    }
    setAskAiLoading(true);
    try {
      const res = await suggestInstantArticleTopicAction(projectId, {
        region,
        language,
        avoidKeywordsCsv: keywords.trim() || undefined,
      });
      if (res.suggestTrace?.length) {
        console.log("[Instant article] Ask AI trace:", res.suggestTrace);
      }
      if (res.success) {
        setTopic(res.topic);
        setKeywords(res.keywords);
        toast.success("Topic and keyword filled from your project domain.");
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

  function goToReview() {
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
      setProgressPct(p => (p >= 90 ? 90 : p + 2 + Math.random() * 6));
    }, 700);
    return () => clearInterval(tick);
  }, [phase]);

  const runWebResearchGeneration = useCallback(async () => {
    if (!projectId) {
      toast.error("Missing project.");
      return;
    }
    if (!topic.trim() || !writingStyle) {
      toast.error("Complete topic and writing style first.");
      return;
    }

    let customReferences: InstantCustomRefPayload[] | undefined;
    if (research === "custom") {
      try {
        customReferences = await serializeCustomReferences(customReferenceRows);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not read a reference file.");
        return;
      }
      if (!customReferences.length) {
        toast.error(
          "Add at least one file or https link in Custom Sources, or switch to AI Web Research.",
        );
        return;
      }
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
        articleTypeLabel:
          ARTICLE_TYPES.find(t => t.id === articleType)?.label ?? articleType,
        researchMethod: research,
        customReferences,
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
    customReferenceRows,
  ]);

  const writingStyleMissing = !writingStyle;
  const customRefsCount = customReferenceRows.length;

  // CTAs that live in the page header (top-right). Mirrors every other project page.
  const headerActions = (() => {
    if (phase === "generating") return null;
    if (step === 1) {
      return (
        <>
          <Button
            variant="outline"
            shape="pill"
            size="lg"
            onClick={() => void askAi()}
            disabled={askAiLoading}
            iconLeft={askAiLoading ? <Spinner size={14} /> : <WandIcon className="text-brand-action" />}
          >
            {askAiLoading ? "Thinking…" : "Ask AI"}
          </Button>
          <Button
            variant="primary"
            shape="pill"
            size="lg"
            onClick={goToReview}
            iconRight={<ArrowRightIcon />}
          >
            Review & continue
          </Button>
        </>
      );
    }
    return (
      <>
        <Button
          variant="secondary"
          shape="pill"
          size="lg"
          onClick={() => setStep(1)}
          iconLeft={<ArrowLeftIcon />}
        >
          Back to details
        </Button>
        <Button
          variant="primary"
          shape="pill"
          size="lg"
          onClick={() => void runWebResearchGeneration()}
        >
          Generate article
        </Button>
      </>
    );
  })();

  return (
    <div className="relative space-y-10 pb-16 pl-4 pr-4">
      {/* ── HEADER (match project chrome) ───────────────────────────────── */}
      <div className="border-b border-border-subtle pb-8 pt-4">
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
          <span className="font-mono text-text-primary">Instant article</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-3xl">
            <PageTitle>{heroTitle}</PageTitle>
            <p className="mt-3 text-[16px] leading-relaxed text-text-tertiary">{heroLead}</p>
          </div>
          {headerActions ? (
            <div className="flex flex-wrap items-center gap-3">{headerActions}</div>
          ) : null}
        </div>
      </div>

      {/* ── MAIN ─────────────────────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-4xl">
        {/* Step indicator (horizontal, slim) */}
        {phase !== "generating" && (
          <div className="mb-10 flex items-center gap-6">
            <StepPill index="01" label="Enter details" active={step === 1} done={step === 2} />
            <span
              className={cn(
                "h-px w-12 transition-colors duration-(--duration-base)",
                step === 2 ? "bg-brand-action/40" : "bg-border-subtle",
              )}
              aria-hidden
            />
            <StepPill index="02" label="Review & generate" active={step === 2} done={false} />
          </div>
        )}

        {phase === "generating" ? (
          <GeneratingView research={research} progressPct={progressPct} />
        ) : step === 1 ? (
          <FormStep
            topic={topic}
            setTopic={setTopic}
            region={region}
            setRegion={setRegion}
            language={language}
            setLanguage={setLanguage}
            writingStyle={writingStyle}
            setWritingStyle={setWritingStyle}
            writingStyleMissing={writingStyleMissing}
            keywords={keywords}
            setKeywords={setKeywords}
            articleType={articleType}
            setArticleType={setArticleType}
            research={research}
            setResearch={setResearch}
            customRefsCount={customRefsCount}
            onOpenReferences={() => setAddReferencesOpen(true)}
          />
        ) : (
          <ReviewStep
            topic={topic}
            regionLabel={regionLabel}
            language={language}
            writingStyle={writingStyle}
            articleType={articleType}
            research={research}
            keywords={keywords}
            customRefsCount={customRefsCount}
            base={base}
          />
        )}
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

// ─── Step 1: form ──────────────────────────────────────────────────────────

function FormStep({
  topic,
  setTopic,
  region,
  setRegion,
  language,
  setLanguage,
  writingStyle,
  setWritingStyle,
  writingStyleMissing,
  keywords,
  setKeywords,
  articleType,
  setArticleType,
  research,
  setResearch,
  customRefsCount,
  onOpenReferences,
}: {
  topic: string;
  setTopic: (v: string) => void;
  region: string;
  setRegion: (v: string) => void;
  language: string;
  setLanguage: (v: string) => void;
  writingStyle: string;
  setWritingStyle: (v: string) => void;
  writingStyleMissing: boolean;
  keywords: string;
  setKeywords: (v: string) => void;
  articleType: ArticleTypeId;
  setArticleType: (v: ArticleTypeId) => void;
  research: ResearchMethod;
  setResearch: (v: ResearchMethod) => void;
  customRefsCount: number;
  onOpenReferences: () => void;
}) {
  return (
    <div className="space-y-12">
      {/* Topic + audience */}
      <section>
        <SectionHeading index="01" label="Topic & audience" />
        <div className="space-y-5">
          <Field label="Topic" required htmlFor="instant-topic">
            <Input
              id="instant-topic"
              inputSize="lg"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Enter your topic or title…"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Audience region" required htmlFor="instant-region">
              <Select
                id="instant-region"
                inputSize="lg"
                value={region}
                onChange={e => setRegion(e.target.value)}
              >
                {TARGET_REGIONS.map(r => (
                  <option key={r.code} value={r.code}>
                    {(REGION_FLAG[r.code] ?? "🌐") + " " + r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Article language" required htmlFor="instant-language">
              <Select
                id="instant-language"
                inputSize="lg"
                value={language}
                onChange={e => setLanguage(e.target.value)}
              >
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Writing style" required htmlFor="instant-style">
              <Select
                id="instant-style"
                inputSize="lg"
                value={writingStyle}
                invalid={writingStyleMissing}
                onChange={e => setWritingStyle(e.target.value)}
              >
                {WRITING_STYLES.map(s => (
                  <option key={s.id || "placeholder"} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Keywords"
            description="Optional — comma-separated phrases the writer should weave in."
            htmlFor="instant-keywords"
          >
            <Input
              id="instant-keywords"
              inputSize="lg"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="seo, organic traffic, content strategy"
            />
          </Field>
        </div>
      </section>

      {/* Article type */}
      <section>
        <SectionHeading index="02" label="Article type" />
        <div className="flex flex-wrap gap-2">
          {ARTICLE_TYPES.map(t => {
            const selected = articleType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setArticleType(t.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[13px] font-medium transition-colors duration-(--duration-fast) ease-out",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-action/40",
                  selected
                    ? "border-text-primary bg-text-primary text-surface-primary"
                    : "border-border-subtle bg-surface-elevated text-text-secondary hover:border-border-strong hover:text-text-primary",
                )}
              >
                <ArticleTypeIcon
                  kind={t.icon}
                  className={cn("h-3.5 w-3.5", selected ? "text-surface-primary" : "text-text-tertiary")}
                />
                {t.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Research method */}
      <section>
        <SectionHeading index="03" label="Research method" />
        <div className="grid gap-4 md:grid-cols-2">
          <ResearchMethodCard
            selected={research === "web"}
            onSelect={() => setResearch("web")}
            title="AI Web Research"
            subtitle="Reddit · Medium · Wikipedia-style sources"
            recommended
            bullets={[
              "Analyzes many relevant articles",
              "Includes competitor-aware context",
              "Up-to-date information",
              "Best for new or broad topics",
            ]}
            artBadges={["Reddit", "Medium", "Wiki"]}
          />
          <ResearchMethodCard
            selected={research === "custom"}
            onSelect={() => setResearch("custom")}
            title="Custom Sources"
            subtitle="PDF · DOCX · Your links"
            bullets={[
              "Upload your own files or links",
              "Use your existing content",
              "Stronger brand consistency",
              "Best for proprietary topics",
            ]}
            artBadges={["PDF", "DOCX", "Links"]}
            footer={
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onOpenReferences();
                }}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-action transition-colors hover:text-brand-action-hover"
              >
                {customRefsCount > 0
                  ? `Edit ${customRefsCount} reference${customRefsCount === 1 ? "" : "s"}`
                  : "Add references"}
                <ArrowRightIcon className="h-3 w-3" />
              </button>
            }
          />
        </div>
      </section>
    </div>
  );
}

function ResearchMethodCard({
  selected,
  onSelect,
  title,
  subtitle,
  bullets,
  recommended,
  artBadges,
  footer,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  bullets: string[];
  recommended?: boolean;
  artBadges: string[];
  footer?: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group flex cursor-pointer flex-col rounded-card border bg-surface-elevated p-5 text-left transition-all duration-(--duration-base) ease-out",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-action/40",
        selected
          ? "border-brand-action ring-2 ring-brand-action/25"
          : "border-border-subtle hover:border-border-strong hover:shadow-(--shadow-sm)",
      )}
    >
      {/* art row */}
      <div className="relative mb-4 h-[88px] overflow-hidden rounded-md border border-border-subtle bg-surface-secondary">
        <div className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[linear-gradient(to_right,var(--border-subtle)_1px,transparent_1px),linear-gradient(to_bottom,var(--border-subtle)_1px,transparent_1px)] bg-size-[14px_14px] dark:opacity-[0.22]" />
        <div className="relative flex h-full items-center justify-center gap-3">
          {artBadges.map(b => (
            <span
              key={b}
              className="rounded-md border border-border-subtle bg-surface-primary px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-wide text-text-secondary"
            >
              {b}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-[18px] font-normal tracking-tight text-text-primary">
          {title}
        </h3>
        {recommended ? (
          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
            Recommended
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[12px] text-text-tertiary">{subtitle}</p>

      <ul className="mt-4 flex-1 space-y-2 text-[13px] text-text-secondary">
        {bullets.map(b => (
          <li key={b} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-action" aria-hidden />
            {b}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors",
            selected
              ? "bg-text-primary text-surface-primary"
              : "border border-border-subtle bg-surface-secondary text-text-tertiary group-hover:text-text-secondary",
          )}
        >
          {selected ? "✓ Selected" : "Select method"}
        </span>
        {footer}
      </div>
    </div>
  );
}

// ─── Step 2: review ────────────────────────────────────────────────────────

function ReviewStep({
  topic,
  regionLabel,
  language,
  writingStyle,
  articleType,
  research,
  keywords,
  customRefsCount,
  base,
}: {
  topic: string;
  regionLabel: string;
  language: string;
  writingStyle: string;
  articleType: ArticleTypeId;
  research: ResearchMethod;
  keywords: string;
  customRefsCount: number;
  base: string;
}) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Topic", value: topic.trim() },
    { label: "Region", value: regionLabel },
    {
      label: "Language",
      value: LANGUAGES.find(l => l.code === language)?.label ?? language,
    },
    {
      label: "Writing style",
      value: WRITING_STYLES.find(s => s.id === writingStyle)?.label ?? writingStyle,
    },
    {
      label: "Article type",
      value: ARTICLE_TYPES.find(t => t.id === articleType)?.label ?? articleType,
    },
    {
      label: "Research",
      value:
        research === "web"
          ? "AI Web Research"
          : `Custom Sources · ${customRefsCount} reference${customRefsCount === 1 ? "" : "s"}`,
    },
  ];
  if (keywords.trim()) rows.push({ label: "Keywords", value: keywords.trim() });

  return (
    <div className="space-y-8">
      <Card padding="lg" elevation="raised">
        <SectionHeading index="01" label="Summary" />
        <dl className="grid gap-5 sm:grid-cols-2">
          {rows.map(r => (
            <div key={r.label}>
              <dt className="font-mono text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
                {r.label}
              </dt>
              <dd className="mt-1 wrap-break-word text-[14px] font-medium text-text-primary">{r.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card padding="md" elevation="flat">
        <SectionHeading index="02" label="What happens next" />
        <p className="text-[14px] leading-relaxed text-text-secondary">
          {research === "web"
            ? "We will gather live SERP context, call Gemini with your project brief, then open the blog viewer with your draft."
            : "We will read your saved files and public links, add live SERP context for angles and external links, then draft in Gemini with your references prioritized in the prompt."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <ProjectNavLink
            href={`${base}/calendar`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border-subtle bg-surface-elevated px-3.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            Open calendar
          </ProjectNavLink>
          <ProjectNavLink
            href={`${base}/keywords`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border-subtle bg-surface-elevated px-3.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            Keywords workspace
          </ProjectNavLink>
        </div>
      </Card>
    </div>
  );
}

// ─── Generating view ───────────────────────────────────────────────────────

function GeneratingView({
  research,
  progressPct,
}: {
  research: ResearchMethod;
  progressPct: number;
}) {
  const pct = Math.round(Math.min(progressPct, 100));
  return (
    <Card padding="lg" elevation="raised" className="space-y-5">
      <div className="flex items-center gap-3">
        <Spinner size={18} className="text-brand-action" />
        <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-text-secondary">
          {research === "web" ? "AI Web Research" : "Custom Sources"} · drafting
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium text-text-secondary">Article progress</span>
          <span className="tabular-nums text-text-tertiary">{pct}% complete</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full border border-border-subtle bg-surface-secondary">
          <div
            className="h-full rounded-full bg-brand-action transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <p className="text-[14px] leading-relaxed text-text-tertiary">
        Harnessing AI to create high quality, SEO-optimized content tailored to your needs. Keep this
        tab open while we finish drafting.
      </p>
    </Card>
  );
}
