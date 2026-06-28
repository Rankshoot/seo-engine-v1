/**
 * Server-safe helpers for the public blog: slugs, heading/TOC extraction, FAQ
 * extraction (for JSON-LD), reading-time, and date formatting. Pure string
 * functions — safe to run in server components.
 */

export interface TocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface FaqItem {
  question: string;
  answer: string;
}

/** Strip light inline markdown so heading/anchor text is clean. */
export function stripInlineMarkdown(raw: string): string {
  return raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → text
    .replace(/[*_`~]+/g, '') // emphasis / code marks
    .replace(/\s+/g, ' ')
    .trim();
}

/** Deterministic, GitHub-style slug. Used for both the TOC and heading ids so anchors match. */
export function slugify(raw: string): string {
  return stripInlineMarkdown(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * A stateful slug assigner that de-duplicates in document order (first
 * occurrence → `slug`, next → `slug-1`, …). The single source of truth for
 * heading ids, used by BOTH `extractHeadings` (which builds the TOC) and the
 * markdown renderer (which stamps ids onto the rendered <h2>/<h3>) so anchors
 * always line up. Process headings in the same order with separate instances
 * and you get identical ids.
 */
export function createSlugAssigner(): (raw: string) => string {
  const seen = new Map<string, number>();
  return (raw: string) => {
    const base = slugify(raw) || 'section';
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n > 0 ? `${base}-${n}` : base;
  };
}

/**
 * Extract H2/H3 headings from markdown for a table of contents. Skips fenced
 * code blocks so `## not a heading` inside ``` isn't picked up. De-duplicates
 * ids so anchors stay unique.
 */
export function extractHeadings(markdown: string): TocHeading[] {
  const out: TocHeading[] = [];
  const assign = createSlugAssigner();
  let inFence = false;
  for (const line of (markdown || '').split('\n')) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const level = (m[1].length === 2 ? 2 : 3) as 2 | 3;
    const text = stripInlineMarkdown(m[2]);
    if (!text) continue;
    out.push({ id: assign(text), text, level });
  }
  return out;
}

/**
 * Extract FAQ Q&A pairs from the markdown so we can emit FAQPage JSON-LD.
 * Our generated articles use a "## FAQs" / "## Frequently Asked Questions"
 * section with each question as an H3 followed by its answer paragraph(s).
 */
export function extractFaqs(markdown: string): FaqItem[] {
  const lines = (markdown || '').split('\n');
  const out: FaqItem[] = [];

  // Find the FAQ section start.
  let i = lines.findIndex(l => /^##\s+(faqs?|frequently asked questions)\b/i.test(l.trim()));
  if (i === -1) return out;
  i++;

  let question = '';
  let answer: string[] = [];
  const flush = () => {
    const q = stripInlineMarkdown(question);
    const a = stripInlineMarkdown(answer.join(' '));
    if (q && a) out.push({ question: q, answer: a });
    question = '';
    answer = [];
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    // A new H2 ends the FAQ section.
    if (/^##\s+/.test(line)) break;
    const h3 = /^###\s+(.+?)\s*#*\s*$/.exec(line);
    if (h3) {
      flush();
      question = h3[1];
      continue;
    }
    if (question && line.trim()) answer.push(line.trim());
  }
  flush();
  return out.slice(0, 12);
}

export interface SplitContent {
  /** Markdown with the FAQ section removed (content before + any content after it). */
  body: string;
  /** Parsed FAQ items (may be empty) — rendered as a styled accordion. */
  faqs: FaqItem[];
}

/**
 * Split the FAQ section out of the body so it can render as a styled, SEO-safe
 * accordion while the rest of the article renders normally. Content that comes
 * AFTER the FAQ section (e.g. a "Key Takeaways" conclusion) is preserved in body.
 */
export function splitContentAndFaqs(markdown: string): SplitContent {
  const lines = (markdown || '').split('\n');
  const idx = lines.findIndex(l => /^##\s+(faqs?|frequently asked questions)\b/i.test(l.trim()));
  if (idx === -1) return { body: markdown, faqs: [] };

  let end = lines.length;
  for (let j = idx + 1; j < lines.length; j++) {
    if (/^##\s+/.test(lines[j])) { end = j; break; }
  }
  const before = lines.slice(0, idx).join('\n').trim();
  const after = lines.slice(end).join('\n').trim();
  const body = [before, after].filter(Boolean).join('\n\n');
  return { body, faqs: extractFaqs(markdown) };
}

export function formatBlogDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

export function readingTime(wordCount: number | null): string {
  if (!wordCount || wordCount <= 0) return '';
  return `${Math.max(1, Math.ceil(wordCount / 200))} min read`;
}

/** Score how related two articles are by shared keyword/title tokens (cheap, no embeddings). */
export function relatednessScore(aKeyword: string, aTitle: string, bKeyword: string, bTitle: string): number {
  const tok = (s: string) =>
    new Set(
      (s || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(w => w.length > 3)
    );
  const a = tok(`${aKeyword} ${aTitle}`);
  const b = tok(`${bKeyword} ${bTitle}`);
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared;
}
