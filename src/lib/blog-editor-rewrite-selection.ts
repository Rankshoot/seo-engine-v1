/**
 * Shared helpers for the blog editor "AI rewriter" selection flow (client + server).
 * Markdown excerpts use [anchor](url); unsafe schemes are rejected.
 */

import { urlMatchesProjectSite } from "@/lib/blog-content";

export type BlogEditorRewriteAction =
  | "replace_text"
  | "update_link"
  | "update_text_and_link"
  | "needs_url";

export type BlogEditorRewriteLinkUpdate = {
  oldHref: string;
  newHref: string;
  oldAnchorText: string;
  newAnchorText: string;
};

/** Payload captured from the contentEditable selection (sent to /rewrite-selection). */
export type BlogRewriteSelectionSnapshot = {
  /** Markdown excerpt (Turndown), includes `[text](url)` for links. */
  markdown: string;
  plainText: string;
  /** Raw HTML of cloneContents() — optional context for the model. */
  htmlFragment?: string;
  links: BlogRewriteSelectionLink[];
};

export type BlogRewriteSelectionLink = {
  /** Stable id for multi-link updates (`link-1`, `link-2`, …). */
  id?: string;
  anchorText: string;
  href: string;
  type?: "internal" | "external";
};

export type MultiLinkRewriteIntent = {
  mode: "replace_links" | "add_links" | "text_only";
  forceType: "internal" | "external" | null;
  /** Subset of link ids to update; null = all links in selection when replacing. */
  targetLinkIds: string[] | null;
};

export type BlogEditorRewriteStructuredResponse = {
  action: BlogEditorRewriteAction;
  /** Primary rewritten excerpt as GitHub-flavored Markdown (no # headings). */
  rewrittenMarkdown: string;
  linkUpdates: BlogEditorRewriteLinkUpdate[];
};

const UNSAFE_SCHEME = /^(javascript|data|vbscript|file|about|mailto):/i;

export function isDisallowedRewriteUrl(href: string): boolean {
  const t = href.trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  if (UNSAFE_SCHEME.test(lower)) return true;
  return false;
}

/** Normalize a URL token from user text; returns null if unusable or unsafe. */
export function normalizeUrlFromUserPrompt(token: string): string | null {
  let t = token.trim();
  if (!t) return null;
  t = t.replace(/[),.;]+$/g, "");
  if (/^www\./i.test(t)) t = `https://${t}`;
  if (!/^https?:\/\//i.test(t)) return null;
  if (isDisallowedRewriteUrl(t)) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Extract http(s) and www… URLs from free text; order preserved, duplicates removed.
 */
export function extractSafeUrlsFromText(text: string): string[] {
  const re = /(https?:\/\/[^\s\])"'<>]+)|(www\.[^\s\])"'<>]+)/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = (m[1] || m[2] || "").trim();
    const norm = normalizeUrlFromUserPrompt(raw);
    if (!norm) continue;
    const key = hrefKeyForRewrite(norm);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out;
}

export function hrefKeyForRewrite(href: string): string {
  try {
    const u = new URL(href);
    u.hash = "";
    return u.href.toLowerCase();
  } catch {
    return href.trim().toLowerCase();
  }
}

export function hrefEquals(a: string, b: string): boolean {
  return hrefKeyForRewrite(a) === hrefKeyForRewrite(b);
}

/** Inline markdown links in an excerpt (GFM); best-effort, non-nested brackets. */
export function extractInlineMarkdownLinks(markdown: string): BlogRewriteSelectionLink[] {
  const re = /\[([^\]]+)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const links: BlogRewriteSelectionLink[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const anchorText = m[1].trim();
    const href = m[2].trim();
    if (!href || isDisallowedRewriteUrl(href)) continue;
    links.push({ anchorText, href });
  }
  return links;
}

/** Assign ids + internal/external type for API payloads. */
export function enrichSelectionLinks(
  links: readonly BlogRewriteSelectionLink[],
  projectDomain: string
): BlogRewriteSelectionLink[] {
  return links.map((l, i) => ({
    ...l,
    id: l.id ?? `link-${i + 1}`,
    type: l.type ?? classifySelectionLinkType(l.href, projectDomain),
  }));
}

export function instructionWantsAddLinks(instruction: string): boolean {
  const i = instruction.toLowerCase();
  return (
    /\badd\s+(more\s+)?(links?|sources?|citations?|references?)\b/.test(i) ||
    /\binclude\s+(more\s+)?(links?|sources?)\b/.test(i) ||
    /\binsert\s+(additional\s+)?(links?|sources?)\b/.test(i)
  );
}

/** Which links the user is referring to (Cases A–E). */
export function resolveTargetLinkIds(
  instruction: string,
  links: readonly BlogRewriteSelectionLink[]
): string[] | null {
  const enriched = links.every(l => l.id) ? links : links.map((l, i) => ({ ...l, id: l.id ?? `link-${i + 1}` }));
  const i = instruction.toLowerCase();

  if (/\b(both|all|each|every)\s+(the\s+)?(links?|urls?|href)/.test(i) || /\bchange\s+both\b/.test(i)) {
    return enriched.map(l => l.id!);
  }

  const matched: string[] = [];
  for (const l of enriched) {
    const anchor = l.anchorText.trim().toLowerCase();
    if (!anchor || anchor.length < 3) continue;
    if (i.includes(anchor)) {
      matched.push(l.id!);
      continue;
    }
    const words = anchor.split(/\s+/).filter(w => w.length > 3);
    if (words.length >= 2 && words.filter(w => i.includes(w)).length >= Math.min(2, words.length)) {
      matched.push(l.id!);
    }
  }

  if (matched.length === 1) return matched;
  if (matched.length > 1) return matched;
  return null;
}

export function parseMultiLinkRewriteIntent(
  instruction: string,
  links: readonly BlogRewriteSelectionLink[]
): MultiLinkRewriteIntent {
  if (instructionWantsAddLinks(instruction)) {
    return {
      mode: "add_links",
      forceType: instructionLinkResolverMode(instruction),
      targetLinkIds: null,
    };
  }

  if (!instructionWantsNewLinkWithoutExactUrl(instruction)) {
    return { mode: "text_only", forceType: instructionLinkResolverMode(instruction), targetLinkIds: null };
  }

  const targetLinkIds = resolveTargetLinkIds(instruction, links);
  return {
    mode: "replace_links",
    forceType: instructionLinkResolverMode(instruction),
    targetLinkIds: targetLinkIds ?? (links.length > 0 ? links.map((l, idx) => l.id ?? `link-${idx + 1}`) : null),
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace `](oldHref)` with `](newHref)` everywhere in markdown (preserves anchor text). */
export function replaceMarkdownLinkTargetHref(markdown: string, oldHref: string, newHref: string): string {
  if (!oldHref || !newHref || oldHref === newHref) return markdown;
  const re = new RegExp(`\\]\\(${escapeRegExp(oldHref)}\\)`, "g");
  return markdown.replace(re, `](${newHref})`);
}

export function applyLinkUpdatesToMarkdown(
  markdown: string,
  updates: readonly BlogEditorRewriteLinkUpdate[]
): string {
  let out = markdown;
  for (const u of updates) {
    if (!u.oldHref || !u.newHref) continue;
    if (u.oldAnchorText !== u.newAnchorText && u.oldAnchorText && u.newAnchorText) {
      const exact = new RegExp(
        `\\[${escapeRegExp(u.oldAnchorText)}\\]\\(${escapeRegExp(u.oldHref)}\\)`,
        "g"
      );
      if (exact.test(out)) {
        out = out.replace(exact, `[${u.newAnchorText}](${u.newHref})`);
        continue;
      }
    }
    out = replaceMarkdownLinkTargetHref(out, u.oldHref, u.newHref);
  }
  return out;
}

/**
 * When the selection has exactly one markdown link and the instruction contains exactly
 * one http(s) URL different from that link, treat it as the authoritative new href.
 */
export function resolveForcedSingleLinkHrefUpdate(
  selectionMarkdown: string,
  links: readonly BlogRewriteSelectionLink[] | undefined,
  instruction: string
): { oldHref: string; newHref: string } | null {
  const resolved = links?.length ? [...links] : extractInlineMarkdownLinks(selectionMarkdown);
  if (resolved.length !== 1) return null;
  const oldHref = resolved[0].href;
  const candidates = extractSafeUrlsFromText(instruction).filter(u => !hrefEquals(u, oldHref));
  if (candidates.length !== 1) return null;
  return { oldHref, newHref: candidates[0] };
}

function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function asNonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function parseLinkUpdates(raw: unknown): BlogEditorRewriteLinkUpdate[] {
  if (!Array.isArray(raw)) return [];
  const out: BlogEditorRewriteLinkUpdate[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const oldHref = asNonEmptyString(o.oldHref) ?? "";
    const newHref = asNonEmptyString(o.newHref) ?? "";
    const oldAnchorText = asNonEmptyString(o.oldAnchorText) ?? "";
    const newAnchorText = asNonEmptyString(o.newAnchorText) ?? oldAnchorText;
    if (!oldHref || !newHref || isDisallowedRewriteUrl(newHref)) continue;
    out.push({ oldHref, newHref, oldAnchorText, newAnchorText });
  }
  return out;
}

export type AIRewriteReplacementRow = BlogEditorRewriteLinkUpdate & {
  linkId?: string;
  reason?: string;
  type?: "internal" | "external";
  status?: number;
};

export type AIRewriteParsedResponse = {
  action: BlogEditorRewriteAction;
  rewrittenMarkdown: string;
  rewrittenHtml?: string;
  linkUpdates: BlogEditorRewriteLinkUpdate[];
  replacements: AIRewriteReplacementRow[];
  displayText: string;
};

export type PendingLinkReplacement = {
  oldHref: string;
  newHref: string;
  oldAnchorText: string;
  newAnchorText: string;
  reason?: string;
  status?: number;
};

function parseJsonObject(text: string): Record<string, unknown> | null {
  let cleaned = stripJsonFences(text).trim();
  cleaned = cleaned.replace(/^"+|"+$/g, "").trim();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const v: unknown = JSON.parse(cleaned);
      if (typeof v === "string") {
        cleaned = stripJsonFences(v).trim();
        continue;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return v as Record<string, unknown>;
      }
    } catch {
      /* try substring extract */
    }

    const start = cleaned.indexOf("{");
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const slice = cleaned.slice(start, i + 1);
          try {
            const v = JSON.parse(slice) as unknown;
            if (v && typeof v === "object" && !Array.isArray(v)) {
              return v as Record<string, unknown>;
            }
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
  return null;
}

function parseReplacementsArray(raw: unknown): AIRewriteReplacementRow[] {
  if (!Array.isArray(raw)) return [];
  const out: AIRewriteReplacementRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const oldHref = asNonEmptyString(o.oldHref) ?? "";
    const newHref = asNonEmptyString(o.newHref) ?? "";
    const oldAnchorText = asNonEmptyString(o.oldAnchorText) ?? "";
    const newAnchorText = asNonEmptyString(o.newAnchorText) ?? oldAnchorText;
    if (!oldHref || !newHref || isDisallowedRewriteUrl(newHref)) continue;
    out.push({
      linkId: asNonEmptyString(o.linkId),
      oldHref,
      newHref,
      oldAnchorText,
      newAnchorText,
      reason: asNonEmptyString(o.reason),
      type: o.type === "internal" || o.type === "external" ? o.type : undefined,
      status: typeof o.status === "number" ? o.status : undefined,
    });
  }
  return out;
}

/** True when text looks like structured AI JSON (not human prose). */
export function looksLikeRewriteJson(text: string): boolean {
  const t = stripJsonFences(text).trim();
  if (!t.startsWith("{")) return false;
  return /"(?:rewrittenMarkdown|rewrittenHtml|linkUpdates|replacements|action)"\s*:/.test(t);
}

/**
 * Parse AI rewriter JSON (client + server). Never use raw JSON as display text.
 */
export function parseAIRewriteResponse(text: string): AIRewriteParsedResponse | null {
  const obj = parseJsonObject(text);
  if (!obj) return null;

  const action = normalizeAction(obj.action);
  const rewrittenMarkdown =
    asNonEmptyString(obj.rewrittenMarkdown) ??
    asNonEmptyString(obj.rewrittenHtml) ??
    asNonEmptyString(obj.rewritten);
  const rewrittenHtml = asNonEmptyString(obj.rewrittenHtml);

  const fromUpdates = parseLinkUpdates(obj.linkUpdates);
  const fromReplacements = parseReplacementsArray(obj.replacements);
  const linkUpdates = [...fromUpdates];
  for (const r of fromReplacements) {
    if (linkUpdates.some(u => hrefEquals(u.oldHref, r.oldHref) && hrefEquals(u.newHref, r.newHref))) {
      continue;
    }
    linkUpdates.push({
      oldHref: r.oldHref,
      newHref: r.newHref,
      oldAnchorText: r.oldAnchorText,
      newAnchorText: r.newAnchorText,
    });
  }

  if (action === "needs_url") {
    return {
      action,
      rewrittenMarkdown: rewrittenMarkdown ?? "",
      rewrittenHtml,
      linkUpdates,
      replacements: fromReplacements,
      displayText: rewrittenMarkdown ?? "",
    };
  }

  if (!rewrittenMarkdown) return null;

  let displayText = rewrittenMarkdown;
  if (linkUpdates.length) {
    displayText = applyLinkUpdatesToMarkdown(displayText, linkUpdates);
  }

  return {
    action,
    rewrittenMarkdown,
    rewrittenHtml,
    linkUpdates,
    replacements: fromReplacements,
    displayText,
  };
}

/** Safe display text from API `rewritten` field — never returns raw JSON. */
export function extractDisplayTextFromRewriteResponse(text: string): string {
  const parsed = parseAIRewriteResponse(text);
  if (parsed?.displayText.trim()) return parsed.displayText.trim();
  if (looksLikeRewriteJson(text)) return "";
  const plain = stripJsonFences(text).trim();
  return plain;
}

/** Apply user-selected per-link href swaps onto markdown. */
export function applyPendingReplacementsToMarkdown(
  markdown: string,
  links: readonly BlogRewriteSelectionLink[],
  pending: Readonly<Record<string, PendingLinkReplacement>>
): string {
  const updates: BlogEditorRewriteLinkUpdate[] = [];
  for (const link of links) {
    const id = link.id ?? "";
    const p = id ? pending[id] : undefined;
    if (!p?.newHref) continue;
    updates.push({
      oldHref: p.oldHref || link.href,
      newHref: p.newHref,
      oldAnchorText: p.oldAnchorText || link.anchorText,
      newAnchorText: p.newAnchorText || link.anchorText,
    });
  }
  if (!updates.length) return markdown;
  return applyLinkUpdatesToMarkdown(markdown, updates);
}

const REWRITE_ACTIONS: readonly BlogEditorRewriteAction[] = [
  "replace_text",
  "update_link",
  "update_text_and_link",
  "needs_url",
];

function normalizeAction(raw: unknown): BlogEditorRewriteAction {
  const s = typeof raw === "string" ? raw.trim() : "";
  return (REWRITE_ACTIONS as readonly string[]).includes(s) ? (s as BlogEditorRewriteAction) : "replace_text";
}

/**
 * Parse Gemini JSON for the rewriter. Returns null if the payload is not valid JSON object.
 */
export function parseBlogEditorRewriteStructuredResponse(text: string): BlogEditorRewriteStructuredResponse | null {
  const parsed = parseAIRewriteResponse(text);
  if (!parsed) return null;
  return {
    action: parsed.action,
    rewrittenMarkdown: parsed.rewrittenMarkdown,
    linkUpdates: parsed.linkUpdates,
  };
}

/** True when the user is asking to swap the link target but did not paste an http(s) URL. */
export function instructionWantsNewLinkWithoutExactUrl(instruction: string): boolean {
  if (extractSafeUrlsFromText(instruction).length > 0) return false;
  const i = instruction.toLowerCase();
  if (/(paste|provide|send)\s+(me\s+)?(the\s+)?(full\s+)?(http|url)/i.test(i)) return false;
  return (
    /(another|different|new|other|better|relevant)\s+(link|url|href|page|source)/i.test(i) ||
    /(credible|authoritative|trusted)\s+(source|link|reference|url)/i.test(i) ||
    /find\s+(another|a)\s+(credible|relevant|better)/i.test(i) ||
    /(change|replace|update|switch)\s+(the\s+)?(link|url|href)/i.test(i) ||
    /(link|url|href).{0,60}(change|replace|update|switch)/i.test(i) ||
    /\bchange\s+both\b/i.test(i) ||
    /\b(both|all)\s+(links?|urls?)\b/i.test(i)
  );
}

/** User explicitly wants an internal company page vs an external credible source. */
export function classifySelectionLinkType(
  href: string,
  projectDomain: string
): "internal" | "external" {
  return urlMatchesProjectSite(href, projectDomain) ? "internal" : "external";
}

export function instructionLinkResolverMode(instruction: string): "internal" | "external" | null {
  const i = instruction.toLowerCase();
  if (
    /\b(use|with|to)\s+(an?\s+)?internal\b/.test(i) ||
    /\binternal\s+(link|page|url|blog)\b/.test(i) ||
    /\bfrom\s+(our|the)\s+(site|blog|website)\b/.test(i) ||
    /\bon[- ]site\s+(link|page)\b/.test(i)
  ) {
    return "internal";
  }
  if (
    /\bexternal\s+(source|link|reference|url)\b/.test(i) ||
    /\bcredible\s+(source|link|reference|url)\b/.test(i) ||
    /\bthird[- ]party\s+(source|link)\b/.test(i) ||
    /\bauthoritative\s+(source|link|reference)\b/.test(i) ||
    /\btrusted\s+(source|link|reference)\b/.test(i) ||
    /\banother\s+credible\b/.test(i) ||
    /\bfind\s+(another|a)\s+credible\b/.test(i)
  ) {
    return "external";
  }
  return null;
}
