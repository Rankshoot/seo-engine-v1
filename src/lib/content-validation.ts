/**
 * Shared, deterministic validation + recovery + sanitization for AI-generated
 * content (blogs, ebooks, whitepapers, LinkedIn posts).
 *
 * WHY THIS EXISTS
 * ---------------
 * The generation models occasionally emit their structured JSON *envelope* as
 * the article body — e.g. a ```json fence, a bare `{ "contentMarkdown": "…" }`
 * object, leaked keys like `"faqQuestions":`, or `placehold.co` placeholder
 * images. When that slips past parsing it gets persisted with status
 * `generated` and rendered as a broken draft (and would be exported / published
 * verbatim).
 *
 * This module is the single source of truth for "is this content shippable?".
 * It is used at three gates:
 *   1. Generation  — reject + auto-retry before persisting.
 *   2. Render      — guard so a broken row never renders raw JSON.
 *   3. Export/Publish — block + defensively sanitize before it leaves the app.
 *
 * Every check is O(n) over the text and allocation-light (no parsing libraries,
 * no clones of the full string per check) so it is safe to run on every
 * generation, render, export and publish without measurable cost.
 */

export type GeneratedContentType = "blog" | "ebook" | "whitepaper" | "linkedin";

export type ContentIssueSeverity = "fatal" | "warn";

export interface ContentIssue {
  /** Stable machine code (safe to log / branch on), e.g. "raw_json_envelope". */
  code: string;
  severity: ContentIssueSeverity;
  /** Human-readable, surfaced in UI + traces. */
  message: string;
}

export interface ContentValidation {
  /** False when any `fatal` issue is present. */
  ok: boolean;
  /** 0–100 health score (100 = clean). Each fatal −40, each warn −10, floored at 0. */
  score: number;
  issues: ContentIssue[];
  /** Convenience: just the fatal codes, for compact logging / retry decisions. */
  fatalCodes: string[];
}

export interface ValidateOptions {
  type: GeneratedContentType;
  metaDescription?: string | null;
  /** When true (export/publish), placeholder images and a missing meta become fatal. */
  strict?: boolean;
}

/** Minimum body word counts per content type (lenient for social posts). */
const MIN_WORDS: Record<GeneratedContentType, number> = {
  blog: 300,
  ebook: 500,
  whitepaper: 500,
  linkedin: 40,
};

/**
 * Envelope keys the model emits in its structured output. If these appear as
 * quoted JSON keys inside the *body*, the envelope has leaked into the content.
 */
const ENVELOPE_KEY_RE =
  /"(?:contentMarkdown|metaDescription|faqQuestions|internalLinksUsed|externalLinksUsed|meta_description|external_links|internal_links|seoNotes|repair_notes|slug)"\s*:/g;

/** Placeholder image hosts/markers that must never reach a published asset. */
const PLACEHOLDER_IMG_RE =
  /(?:placehold\.co|via\.placeholder\.com|placeholder\.com\/|dummyimage\.com|loremflickr\.com)|\bIMAGE_PLACEHOLDER\b/i;

/** A body that begins with a ```json fence, a bare `{`, or the literal `json` line. */
const JSONISH_START_RE = /^\s*(?:```(?:json)?\b|json\b\s*[\r\n]|\{[\s\S]*?"[a-zA-Z_]+"\s*:)/i;

/**
 * Count words in markdown, ignoring code blocks, links, images and markup so the
 * number reflects real prose. Mirrors the generator's own word-count heuristic.
 */
export function countContentWords(markdown: string): number {
  if (!markdown) return 0;
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/[#>*_\-[\]()`~]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Number of distinct envelope keys present (capped scan — we only need ≥2). */
function countEnvelopeKeys(content: string): number {
  ENVELOPE_KEY_RE.lastIndex = 0;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = ENVELOPE_KEY_RE.exec(content)) !== null) {
    seen.add(m[0]);
    if (seen.size >= 3) break;
  }
  return seen.size;
}

/**
 * The exact failure in the bug report: the "article" is actually the raw JSON
 * envelope. Requires BOTH a JSON-ish start AND a leaked envelope key, which
 * keeps false positives at effectively zero for real prose.
 */
export function looksLikeRawJsonEnvelope(content: string): boolean {
  if (!content) return false;
  const head = content.slice(0, 4000);
  return JSONISH_START_RE.test(head) && countEnvelopeKeys(content) >= 1;
}

/** True when ``` code fences are unbalanced (a classic truncation signature). */
function hasUnbalancedFences(content: string): boolean {
  const fences = content.match(/```/g);
  return !!fences && fences.length % 2 !== 0;
}

/**
 * Best-effort recovery of the real markdown when the body is a leaked JSON
 * envelope. Cheap (no regeneration): strip fences, parse, or pull the
 * `contentMarkdown` string out by hand (handling escaped quotes/newlines).
 * Returns null if nothing usable can be recovered.
 */
export function recoverContentFromEnvelope(raw: string): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(/^\s*json\s*[\r\n]+/i, "")
    .trim();

  // 1. Strict parse of the first {...} block.
  const objMatch = text.match(/\{[\s\S]*\}/);
  for (const candidate of [text, objMatch?.[0]]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as { contentMarkdown?: unknown };
      if (typeof parsed.contentMarkdown === "string" && parsed.contentMarkdown.trim()) {
        return parsed.contentMarkdown.trim();
      }
    } catch {
      /* fall through to manual extraction */
    }
  }

  // 2. Manual extraction of the contentMarkdown string value, tolerating
  //    truncation. Capture from the key to the next top-level key or EOS.
  const cm = /"contentMarkdown"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  let value = cm?.[1];
  if (!value) {
    const open = /"contentMarkdown"\s*:\s*"([\s\S]*)$/.exec(text);
    if (open) {
      value = open[1].replace(
        /",?\s*"(?:faqQuestions|internalLinksUsed|externalLinksUsed|metaDescription)"[\s\S]*$/,
        "",
      );
    }
  }
  if (value) {
    const decoded = value
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim();
    if (decoded) return decoded;
  }
  return null;
}

/**
 * Defensive sanitization for export / publish. Strips any leaked JSON envelope
 * lines, placeholder images, and unresolved image-placeholder markers so a
 * never-quite-perfect draft can still leave the app cleanly. Pure string work.
 */
export function sanitizeForExport(content: string): string {
  if (!content) return "";
  let out = content;

  // Drop an orphaned ---META--- block and everything after it.
  const metaIdx = out.indexOf("---META---");
  if (metaIdx !== -1) out = out.slice(0, metaIdx);

  out = out
    // Leaked "key": value lines.
    .replace(
      /^\s*"(?:contentMarkdown|metaDescription|faqQuestions|internalLinksUsed|externalLinksUsed|meta_description|external_links|internal_links|slug|title|seoNotes|repair_notes)"\s*:\s*(?:\[[\s\S]*?\]|"[^"]*"|[^,\n]*)\s*,?\s*$/gm,
      "",
    )
    // Placeholder images: ![alt](placehold.co/…) and bare IMAGE_PLACEHOLDER imgs.
    .replace(/!\[[^\]]*\]\(\s*(?:https?:\/\/)?(?:placehold\.co|via\.placeholder\.com|dummyimage\.com)[^)]*\)\s*/gi, "")
    .replace(/!\[[^\]]*\]\(\s*IMAGE_PLACEHOLDER\s*\)\s*/gi, "")
    // Stray JSON braces / bracket-only lines.
    .replace(/^\s*[{}[\]],?\s*$/gm, "")
    // A leading ```json / trailing ``` wrapper.
    .replace(/^\s*```(?:json|markdown|md)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    // Collapse the blank lines left behind.
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return out;
}

/**
 * The core gate. Returns a structured verdict; callers decide what to do
 * (retry on generation, fallback on render, block on export/publish).
 */
export function validateGeneratedContent(
  content: string,
  opts: ValidateOptions,
): ContentValidation {
  const issues: ContentIssue[] = [];
  const body = (content ?? "").trim();
  const { type, strict } = opts;

  const push = (code: string, severity: ContentIssueSeverity, message: string) =>
    issues.push({ code, severity, message });

  // 1. Empty.
  if (!body) {
    push("empty", "fatal", "Generated content is empty.");
    return finalize(issues);
  }

  // 2. Raw JSON envelope leaked into the body (the headline bug).
  if (looksLikeRawJsonEnvelope(body)) {
    push("raw_json_envelope", "fatal", "The body is the raw JSON envelope, not the article markdown.");
  }

  // 3. Body starts with a code fence / `json` label (renders as a code block).
  if (/^\s*```/.test(body) || /^\s*json\s*[\r\n]/i.test(body)) {
    push("starts_with_code_fence", "fatal", "Content starts with a code fence / `json` label instead of prose.");
  }

  // 4. ≥2 distinct envelope keys anywhere = structured output bled into prose.
  if (countEnvelopeKeys(body) >= 2) {
    push("leaked_envelope_keys", "fatal", "Multiple structured-output keys leaked into the article body.");
  }

  // 5. Truncation signature.
  if (hasUnbalancedFences(body)) {
    push("unbalanced_code_fences", "warn", "Unbalanced code fences — content may be truncated.");
  }

  // 6. Length.
  const words = countContentWords(body);
  const min = MIN_WORDS[type];
  if (words < Math.ceil(min / 2)) {
    push("too_short", "fatal", `Only ${words} words (minimum ${min} for ${type}).`);
  } else if (words < min) {
    push("short", "warn", `Only ${words} words (target ≥ ${min} for ${type}).`);
  }

  // 7. Structure: long-form should open with an H1.
  if (type !== "linkedin" && !/^\s*#\s+\S/m.test(body)) {
    push("missing_h1", "warn", "No H1 heading found.");
  }

  // 8. Placeholder images — warn on generation, fatal on export/publish.
  if (PLACEHOLDER_IMG_RE.test(body)) {
    push(
      "placeholder_images",
      strict ? "fatal" : "warn",
      "Contains placeholder images that should be replaced or removed before publishing.",
    );
  }

  // 9. Meta description — only enforced strictly (export/publish).
  if (strict && type !== "linkedin") {
    const meta = (opts.metaDescription ?? "").trim();
    if (!meta) push("missing_meta", "warn", "Missing meta description.");
  }

  return finalize(issues);
}

/** Stricter alias for the export/publish gate. */
export function validateForPublish(
  content: string,
  opts: Omit<ValidateOptions, "strict">,
): ContentValidation {
  return validateGeneratedContent(content, { ...opts, strict: true });
}

function finalize(issues: ContentIssue[]): ContentValidation {
  const fatalCodes = issues.filter((i) => i.severity === "fatal").map((i) => i.code);
  const warnCount = issues.length - fatalCodes.length;
  const score = Math.max(0, 100 - fatalCodes.length * 40 - warnCount * 10);
  return { ok: fatalCodes.length === 0, score, issues, fatalCodes };
}

/** Compact one-line summary for logs / SSE error messages. */
export function summarizeValidation(v: ContentValidation): string {
  if (v.ok && v.issues.length === 0) return "ok";
  return v.issues.map((i) => `${i.severity}:${i.code}`).join(", ");
}

export interface RenderPreparation {
  /** False → the caller must show a fallback; do NOT render `content`. */
  ok: boolean;
  /** Safe markdown to render (possibly recovered from a leaked envelope + sanitized). */
  content: string;
  /** True when `content` was salvaged from a leaked JSON envelope. */
  recovered: boolean;
  validation: ContentValidation;
}

/**
 * Render-time guard. Given stored content, returns markdown that is safe to
 * render — transparently recovering from a leaked JSON envelope when possible —
 * or `ok: false` so the caller renders a graceful fallback instead of raw JSON.
 *
 * This repairs already-persisted broken rows at view time without a DB write.
 */
export function prepareForRender(content: string, opts: ValidateOptions): RenderPreparation {
  const base = (content ?? "").trim();
  const v = validateGeneratedContent(base, opts);
  if (v.ok) return { ok: true, content: base, recovered: false, validation: v };

  // 1. Cheap recovery from a leaked JSON envelope.
  if (looksLikeRawJsonEnvelope(base)) {
    const recovered = recoverContentFromEnvelope(base);
    if (recovered) {
      const cleaned = sanitizeForExport(recovered);
      const rv = validateGeneratedContent(cleaned, opts);
      if (rv.ok) return { ok: true, content: cleaned, recovered: true, validation: rv };
    }
  }

  // 2. Last resort: aggressive sanitize; use it only if it becomes valid.
  const cleaned = sanitizeForExport(base);
  if (cleaned && cleaned !== base) {
    const cv = validateGeneratedContent(cleaned, opts);
    if (cv.ok) return { ok: true, content: cleaned, recovered: true, validation: cv };
  }

  return { ok: false, content: "", recovered: false, validation: v };
}
