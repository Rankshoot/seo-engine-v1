/**
 * Utilities for detecting and stripping PDF content that leaks into
 * scraped markdown when a page embeds a PDF viewer.
 *
 * Problem: Jina Reader (and Playwright) sometimes extract the full text
 * of embedded PDFs, which causes the "original markdown" fed to the repair
 * LLM to be dominated by PDF text rather than the actual blog content.
 */

/** Returns true when the markdown looks like it contains bulk PDF text. */
export function hasPdfContent(markdown: string): boolean {
  // Base64 PDF data URI
  if (/data:application\/pdf;base64,/i.test(markdown)) return true;
  // Raw PDF binary marker
  if (/%PDF-\d+\.\d+/.test(markdown)) return true;
  // Extremely long (>30 k chars) with very few markdown structural elements
  if (markdown.length > 30_000) {
    const markdownElements = (markdown.match(/^#{1,6}\s|\[.+\]\(.+\)|^\s*[-*+]\s|^\s*>\s/gm) ?? []).length;
    const density = markdownElements / (markdown.length / 1000); // per kchar
    if (density < 0.5) return true; // almost no markdown structure in a very long doc
  }
  // Q&A / interview-question PDF dump patterns — these appear even in shorter scraped content
  // when a PDF viewer extracts interview questions into the page body
  const pdfQaPatterns = [
    /(?:Strong Answer:|Weak Answer:|Recruiter Cue:|Sample Answer:)/i,
    /Q\d+[.:)\s]+[A-Z].{20,}/,        // Q1. What is... Q2. How...
    /(?:Question \d+|Ans\.|Answer:)[:\s]+/i,
    /Page \d+ of \d+/i,
  ];
  const patternMatches = pdfQaPatterns.filter(re => re.test(markdown)).length;
  if (patternMatches >= 2) return true;
  return false;
}

/**
 * Strips PDF artefacts from scraped markdown and returns a cleaned version
 * that focuses on the actual blog / article content.
 *
 * Strategy:
 * 1. Strip base64 / binary PDF data entirely.
 * 2. Split content into paragraph blocks and remove blocks that look like
 *    raw PDF text dumps (very long, no markdown structure, PDF-pattern text).
 * 3. Cap the result to a sensible blog size (~15 k chars) to prevent a single
 *    very-large page from flooding the repair prompt.
 */
export function stripPdfArtifacts(markdown: string): { cleaned: string; strippedPdf: boolean } {
  let out = markdown;
  let strippedPdf = false;

  // ── 1. Remove base64 PDF blobs ───────────────────────────────────────────
  if (/data:application\/pdf;base64,/i.test(out)) {
    out = out.replace(/data:application\/pdf;base64,[A-Za-z0-9+/=\r\n]+/gi, "[embedded PDF removed]");
    strippedPdf = true;
  }

  // ── 2. Remove raw PDF binary markers ────────────────────────────────────
  if (/%PDF-\d+\.\d+/.test(out)) {
    out = out.replace(/%PDF-[\s\S]{0,5000}/g, "[PDF binary removed]");
    strippedPdf = true;
  }

  // ── 3. Remove blocks that look like PDF text dumps ───────────────────────
  // Paragraphs in blog markdown are separated by double newlines.
  const paragraphs = out.split(/\n{2,}/);
  const kept: string[] = [];
  let pdfSectionCount = 0;

  // Pre-scan: count how many blocks match Q&A / interview-question patterns.
  // If the document has many such blocks (indicating bulk PDF extraction),
  // flag ALL matching blocks for removal even if individually short.
  const QA_BLOCK_RE = /(?:Strong Answer:|Weak Answer:|Recruiter Cue:|Sample Answer:|Page \d+ of \d+|Q\d+[.:)\s]+[A-Z].{10,}|(?:Question \d+)[:\s]+|Ans\.[\s]+)/i;
  const qaBlockCount = paragraphs.filter(p => QA_BLOCK_RE.test(p.trim())).length;
  const bulkQaDump = qaBlockCount >= 3; // ≥3 Q&A-pattern blocks = likely PDF dump

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const hasMarkdownStructure =
      /^#{1,6}\s/.test(trimmed) ||       // heading
      /^\s*[-*+]\s/.test(trimmed) ||     // unordered list
      /^\s*\d+\.\s/.test(trimmed) ||     // ordered list
      /\[.{1,80}\]\(https?:\/\//i.test(trimmed) || // markdown link
      /^>\s/.test(trimmed);              // blockquote

    const isPdfBlock =
      trimmed.length > 2_500 && !hasMarkdownStructure;

    // Catch PDF-specific text patterns:
    // - Always strip if individually long (>200 chars) with a Q&A pattern
    // - Also strip even short Q&A blocks when the whole doc is a bulk dump
    const hasPdfTextPattern =
      QA_BLOCK_RE.test(trimmed) && (trimmed.length > 200 || bulkQaDump);

    if (isPdfBlock || hasPdfTextPattern) {
      pdfSectionCount++;
      strippedPdf = true;
      if (pdfSectionCount === 1) {
        // Insert a single note so the LLM knows a PDF existed — don't reproduce its content
        kept.push(
          `> **[Embedded document content removed]** — This page contained an embedded PDF with ${Math.round(trimmed.length / 5)} words of content that has been excluded to focus on the web article.`
        );
      }
      // Drop all subsequent PDF blocks entirely
    } else {
      kept.push(para);
    }
  }

  const joined = kept.join("\n\n");

  // ── 4. Hard cap at 20 k chars (blog content doesn't need more) ──────────
  const capped = joined.length > 20_000 ? joined.slice(0, 20_000) + "\n\n[content truncated]" : joined;

  return { cleaned: capped, strippedPdf };
}

/** Returns only the PDF links found in a markdown string. */
export function extractPdfLinks(markdown: string): string[] {
  const linkRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+\.pdf[^)]*)\)/gi;
  const links: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(markdown)) !== null) {
    links.push(m[2]);
  }
  return links;
}

/** Detects if a URL points to a PDF file. */
export function isPdfUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (path.endsWith(".pdf")) return true;
    if (u.searchParams.get("filetype") === "pdf") return true;
    if (u.searchParams.get("type") === "pdf") return true;
    return false;
  } catch {
    return /\.pdf(\?|#|$)/i.test(url);
  }
}
