/**
 * Deterministic, publish-readiness polish for generated blog markdown.
 *
 * The LLM output is *usually* clean, but "usually" is not production grade.
 * This module is the last line of defence that turns a 95%-clean draft into a
 * 100%-publishable one without another model call. Every transform here is:
 *   - deterministic (same input → same output),
 *   - conservative (never rewrites prose, only repairs structure/artifacts),
 *   - allocation-light (single pass line pipelines, no markdown AST library).
 *
 * It runs inside `sanitizeBlogContent` (blog-content.ts) so every persistence
 * path — fresh generation, audit repair, background jobs — gets the same
 * guarantees.
 *
 * Guarantees after polishing:
 *   1. Exactly one H1 (extra H1s are demoted to H2; duplicate leading titles
 *      are collapsed).
 *   2. Headings are well-formed (`##Heading` → `## Heading`) and surrounded by
 *      blank lines so every renderer recognises them.
 *   3. Tables are valid GFM: every row is pipe-wrapped, the separator row is
 *      rebuilt when malformed, every body row is padded/trimmed to the header
 *      column count, and a blank line precedes each table.
 *   4. No unbalanced ``` fences (a dangling fence from truncation is closed).
 *   5. No leftover generation artifacts: empty headings, empty list items,
 *      stray JSON braces, horizontal-rule typos like `- - -`.
 */

// ─── Code-fence awareness ────────────────────────────────────────────────────

/**
 * True/false per line: is this line inside a ``` code fence? Fence delimiter
 * lines themselves are marked "inside" so no pass touches them either. Lets
 * every structural transform skip code samples (a bash `#comment` must not
 * become a heading, a lone `{` must not be dropped as a JSON artifact).
 */
function fenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = new Array(lines.length);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const isDelimiter = /^\s{0,3}```/.test(lines[i]);
    if (isDelimiter) {
      mask[i] = true;
      inFence = !inFence;
    } else {
      mask[i] = inFence;
    }
  }
  return mask;
}

// ─── Headings ────────────────────────────────────────────────────────────────

/** `##Heading` → `## Heading` (ATX headings need a space to render). */
function fixHeadingSpacing(lines: string[], fenced: boolean[]): string[] {
  return lines.map((line, i) => (fenced[i] ? line : line.replace(/^(\s{0,3})(#{1,6})(?=[^#\s])/, '$1$2 ')));
}

/**
 * Enforce a single H1. The first H1 is kept; any later H1 is demoted to H2.
 * Multiple H1s hurt both accessibility and how crawlers infer the page topic.
 */
function enforceSingleH1(lines: string[], fenced: boolean[]): string[] {
  let seenH1 = false;
  return lines.map((line, i) => {
    if (!fenced[i] && /^\s{0,3}#\s+\S/.test(line)) {
      if (seenH1) return line.replace(/^(\s{0,3})#\s+/, '$1## ');
      seenH1 = true;
    }
    return line;
  });
}

/**
 * Collapse a duplicated leading title: when the first H1 is immediately
 * followed (ignoring blanks) by the same text as bold/plain paragraph or a
 * second identical heading, drop the duplicate. A classic LLM artifact.
 */
function dropDuplicateLeadingTitle(lines: string[]): string[] {
  const h1Idx = lines.findIndex(l => /^\s{0,3}#\s+\S/.test(l));
  if (h1Idx === -1) return lines;
  const h1Text = lines[h1Idx].replace(/^\s{0,3}#\s+/, '').replace(/[*_#]/g, '').trim().toLowerCase();
  for (let i = h1Idx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const candidate = lines[i].replace(/^\s{0,3}#{1,6}\s+/, '').replace(/[*_]/g, '').trim().toLowerCase();
    if (candidate === h1Text) lines.splice(i, 1);
    break;
  }
  return lines;
}

/** Remove headings with no text (`## ` alone on a line renders as junk). */
function dropEmptyHeadings(lines: string[], fenced: boolean[]): string[] {
  return lines.filter((line, i) => fenced[i] || !/^\s{0,3}#{1,6}\s*$/.test(line));
}

/**
 * Strip trailing attribute lists from headings: `## Sourcing {#sourcing}` →
 * `## Sourcing`. These kramdown / markdown-it heading IDs render literally as
 * "{#sourcing}" in the blog viewer (which has no attribute-list plugin), and the
 * page template already provides anchor navigation — so inline IDs are pure noise.
 */
function stripHeadingAttributeLists(lines: string[], fenced: boolean[]): string[] {
  return lines.map((line, i) => {
    if (fenced[i] || !/^\s{0,3}#{1,6}\s+\S/.test(line)) return line;
    return line.replace(/\s*\{[#.:][^}\n]*\}\s*$/, '').replace(/\s+$/, '');
  });
}

/**
 * Drop leaked prompt-instruction text. The repair/enhance prompt uses internal
 * tokens (META_NEEDS_REPAIR, the ---META--- separator, "preserve the original
 * angle") that a model sometimes echoes into the body or a heading — this is the
 * last-line guard so none of that ever reaches the reader.
 */
const INSTRUCTION_LEAK_RE = /META_NEEDS_REPAIR|TITLE_NEEDS_REPAIR|-{2,}\s*META\b|\bMETA\s*-{2,}|"meta_description"\s*:|preserve the original angle/i;
function dropInstructionLeakLines(lines: string[], fenced: boolean[]): string[] {
  return lines.filter((line, i) => fenced[i] || !INSTRUCTION_LEAK_RE.test(line));
}

/**
 * Remove an inline "Table of contents" section (heading + the anchor-link list
 * under it). The blog page template renders its own ToC from the headings, so an
 * inline one is duplicated chrome — and its `[text](#anchor)` links break once
 * the heading `{#anchor}` IDs above are stripped.
 */
function stripInlineTableOfContents(lines: string[], fenced: boolean[]): string[] {
  const tocHeadingRe = /^\s{0,3}#{1,6}\s+(?:table of contents|contents|in this article|on this page|quick links|jump to)\b/i;
  const isListItem = (l: string) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(l);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!fenced[i] && tocHeadingRe.test(lines[i])) {
      let j = i + 1;
      let sawList = false;
      while (j < lines.length) {
        if (!lines[j].trim()) { j++; continue; }
        if (!fenced[j] && isListItem(lines[j])) { sawList = true; j++; continue; }
        break;
      }
      // Only treat it as a ToC (and drop it) when an actual list follows.
      if (sawList) { i = j - 1; continue; }
    }
    out.push(lines[i]);
  }
  return out;
}

/**
 * Convert em/en-dashes to natural comma phrasing on prose lines — the same
 * "remove the AI footprint" pass the Gemini path already applies, centralised
 * here so the Claude enhance/repair path gets it too. Skips fenced code and
 * table rows (dashes there are structural, not prose).
 */
function humanizeProseDashes(lines: string[], fenced: boolean[]): string[] {
  return lines.map((line, i) => {
    if (fenced[i] || isTableRow(line)) return line;
    return line.replace(/(\S)\s*[—–]\s*/g, '$1, ').replace(/,\s{0,2},/g, ', ');
  });
}

/** Ensure a blank line before and after each heading so all renderers agree. */
function padHeadings(lines: string[], fenced: boolean[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const isHeading = !fenced[i] && /^\s{0,3}#{1,6}\s+\S/.test(lines[i]);
    if (isHeading && out.length > 0 && out[out.length - 1].trim() !== '') out.push('');
    out.push(lines[i]);
    if (isHeading && i + 1 < lines.length && lines[i + 1].trim() !== '') out.push('');
  }
  return out;
}

// ─── Tables ──────────────────────────────────────────────────────────────────

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.length > 1;
}

/** A row that could be (a possibly broken) separator: only pipes/dashes/colons/commas. */
function isSeparatorish(line: string): boolean {
  const compact = line.replace(/\s/g, '');
  return compact.length > 0 && /^[|:\-,]+$/.test(compact) && compact.includes('-');
}

function splitCells(row: string): string[] {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

function joinCells(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

/**
 * Normalize every GFM table in the document:
 *   - wrap rows missing leading/trailing pipes,
 *   - rebuild a malformed separator row from the header's column count,
 *   - insert a missing separator row entirely,
 *   - pad or merge body-row cells to match the header column count,
 *   - guarantee a blank line before the table.
 * Tables the LLM half-finished (a lone header with no rows) are converted to
 * plain text so no raw pipes ever reach the reader.
 */
export function normalizeMarkdownTables(markdown: string): string {
  const lines = markdown.split('\n');
  const fenced = fenceMask(lines);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const looksLikeTableStart =
      !fenced[i] &&
      isTableRow(line) && i + 1 < lines.length && (isTableRow(lines[i + 1]) || isSeparatorish(lines[i + 1]));

    if (!looksLikeTableStart) {
      out.push(line);
      i++;
      continue;
    }

    // Collect the contiguous table block (rows + separator-ish lines).
    const block: string[] = [];
    while (i < lines.length && !fenced[i] && (isTableRow(lines[i]) || isSeparatorish(lines[i]))) {
      block.push(lines[i]);
      i++;
    }

    const header = splitCells(block[0]);
    const cols = header.length;
    if (cols === 0) {
      out.push(...block);
      continue;
    }

    const separator = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
    const body: string[] = [];
    for (let b = 1; b < block.length; b++) {
      if (isSeparatorish(block[b])) continue; // all separator-ish rows are rebuilt as one
      let cells = splitCells(block[b]);
      if (cells.length > cols) {
        // Merge overflow cells into the last column rather than dropping data.
        cells = [...cells.slice(0, cols - 1), cells.slice(cols - 1).join(' ')];
      } else if (cells.length < cols) {
        cells = [...cells, ...Array.from({ length: cols - cells.length }, () => '')];
      }
      body.push(joinCells(cells));
    }

    // A header with no data rows is not a table — emit the header text as prose.
    if (body.length === 0) {
      out.push(header.filter(Boolean).join(' — '));
      continue;
    }

    if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('');
    out.push(joinCells(header), separator, ...body);
    if (i < lines.length && lines[i].trim() !== '') out.push('');
  }

  return out.join('\n');
}

// ─── Fences & artifacts ──────────────────────────────────────────────────────

/**
 * Close a dangling ``` fence (truncation signature). An odd fence count means
 * everything after the last fence renders as one giant code block — closing it
 * is strictly better than leaving the document broken.
 */
function balanceCodeFences(markdown: string): string {
  const fences = markdown.match(/^\s{0,3}```/gm);
  if (fences && fences.length % 2 !== 0) {
    return markdown.replace(/\s*$/, '\n```\n');
  }
  return markdown;
}

/** Remove residual generation junk lines that survive earlier passes. */
function dropArtifactLines(lines: string[], fenced: boolean[]): string[] {
  return lines.filter((line, i) => {
    if (fenced[i]) return true;
    const t = line.trim();
    if (/^[{}[\]],?$/.test(t)) return false;             // stray JSON braces
    if (/^(-\s*){2,}$/.test(t) && t !== '---') return false; // `- - -` HR typos
    if (/^[-*+]\s*$/.test(t)) return false;               // empty list items
    return true;
  });
}

// ─── Link URL sanitization ───────────────────────────────────────────────────

/**
 * Fix markdown links whose URL contains whitespace or stray Unicode glyphs
 * injected by the LLM (e.g. "↗" arrows, citation markers, or a long URL
 * wrapped to the next line).
 *
 * A URL with an embedded space is not valid markdown — the parser stops at
 * the first space and emits the rest as visible raw text. This is exactly
 * what appears in the blog viewer when the LLM writes:
 *   [ILO](https://ilo.org/path ↗, en/index.htm)
 * instead of:
 *   [ILO](https://ilo.org/path/en/index.htm)
 *
 * Only URLs that actually contain whitespace or known bad glyphs are touched;
 * clean links are returned unchanged.
 */
function fixBrokenLinkUrls(markdown: string): string {
  // [^\]] matches anything except ] (including newlines) — captures the full
  // URL even when the LLM wrapped it across a line break.
  return markdown.replace(
    /(!?\[[^\]]*\])\(([^)]*)\)/g,
    (match, prefix, rawUrl) => {
      // Fast path: nothing to fix.
      if (!/[\s↗→↑↗⤢]/.test(rawUrl)) return match;
      const clean = rawUrl
        .replace(/\n\s*/g, '')                      // join line-wrapped URLs
        .replace(/[↗→↑↗⤢]+/g, '')   // strip arrow/citation glyphs
        .replace(/,\s*$/, '')                       // trailing comma (e.g. "url, ")
        .replace(/\s+/g, '')                        // remove any remaining spaces
        .trim();
      return clean ? `${prefix}(${clean})` : match;
    },
  );
}

// ─── Meta description ────────────────────────────────────────────────────────

/**
 * Clamp a meta description to Google's usable window. Strips newlines/quotes,
 * trims at a word boundary ≤ `max` chars, and falls back to the first real
 * paragraph of the body when the model returned nothing usable.
 */
export function normalizeMetaDescription(
  meta: string | null | undefined,
  bodyMarkdown: string,
  max = 160,
): string {
  let m = (meta ?? '').replace(/\s+/g, ' ').replace(/^["'“”]+|["'“”]+$/g, '').trim();
  // Discard a meta that is actually leaked prompt-instruction text (e.g.
  // "…no change required as META_NEEDS_REPAIR is false.") so it never renders as
  // the article subtitle — fall through to regenerating one from the body.
  if (INSTRUCTION_LEAK_RE.test(m)) m = '';
  // Strip the AI-footprint dashes from the description too.
  m = m.replace(/(\S)\s*[—–]\s*/g, '$1, ');
  if (m.length < 40) {
    const para = bodyMarkdown
      .split('\n')
      .map(l => l.trim())
      .find(l => l.length > 60 && !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('!') && !l.startsWith('>'));
    if (para) {
      m = para
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_`#]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
  if (m.length <= max) return m;
  const cut = m.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut.slice(0, max)).replace(/[,;:.\s]+$/, '') + '.';
}

// ─── Public pipeline ─────────────────────────────────────────────────────────

/**
 * Run the full deterministic polish pipeline. Safe to call repeatedly
 * (idempotent) and on already-clean content (no-op).
 */
export function polishBlogMarkdown(markdown: string): string {
  if (!markdown || !markdown.trim()) return markdown ?? '';

  let md = balanceCodeFences(markdown);
  md = fixBrokenLinkUrls(md);

  // Fence-preserving line passes. The mask is recomputed after filtering
  // passes because they change line indices.
  let lines = md.split('\n');
  lines = fixHeadingSpacing(lines, fenceMask(lines));
  lines = stripHeadingAttributeLists(lines, fenceMask(lines));
  lines = dropEmptyHeadings(lines, fenceMask(lines));
  lines = enforceSingleH1(lines, fenceMask(lines));
  lines = dropDuplicateLeadingTitle(lines);
  lines = dropArtifactLines(lines, fenceMask(lines));
  lines = dropInstructionLeakLines(lines, fenceMask(lines));
  lines = stripInlineTableOfContents(lines, fenceMask(lines));
  lines = humanizeProseDashes(lines, fenceMask(lines));
  lines = padHeadings(lines, fenceMask(lines));
  md = lines.join('\n');

  md = normalizeMarkdownTables(md);

  return md.replace(/\n{3,}/g, '\n\n').trim();
}
