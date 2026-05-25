/**
 * Type-aware link replacement for the blog AI rewriter.
 * Internal → same-site verified pages only.
 * External → credible third-party sources (Serper + project citation pool).
 */

import type { BusinessBrief, InternalLinkCandidate } from "@/lib/business-brief";
import { isCredibleDomain, urlMatchesProjectSite } from "@/lib/blog-content";
import {
  hrefKeyForRewrite,
  instructionLinkResolverMode,
  isDisallowedRewriteUrl,
} from "@/lib/blog-editor-rewrite-selection";
import { normalizeDomain } from "@/lib/jina";
import { supabaseAdmin } from "@/lib/supabase";
import { validateUrl } from "@/lib/validate-url";

export type LinkReplacementType = "internal" | "external";

export type AvailableLinkRecord = {
  url: string;
  title: string;
  source: string;
};

/** @deprecated Use {@link ReplacementLinkCandidate} */
export type ResolvedLinkOption = {
  url: string;
  title: string;
  reason: string;
  relevanceScore: number;
  status: number;
};

export type ReplacementLinkCandidate = {
  url: string;
  title: string;
  domain: string;
  reason: string;
  relevanceScore: number;
  credibilityScore: number;
  status: number;
};

export type ResolveReplacementLinkResult = {
  linkType: LinkReplacementType;
  candidates: ReplacementLinkCandidate[];
  selectedUrl?: string;
  errorMessage?: string;
};

export type ResolveReplacementLinkInput = {
  selectedHref: string;
  selectedAnchorText: string;
  surroundingText: string;
  projectDomain: string;
  projectId: string;
  prompt: string;
  topic?: string;
  region?: string;
  language?: string;
  /** Overrides auto-detection from selected href + prompt. */
  linkTypeOverride?: LinkReplacementType | null;
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const resolveCache = new Map<string, { at: number; value: ResolveReplacementLinkResult }>();

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "are", "was", "will", "has", "have",
  "you", "our", "their", "into", "about", "more", "link", "page", "site", "blog", "blogs", "http",
  "https", "www",
]);

const SERP_SKIP_HOSTS = new Set([
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "pinterest.com",
  "tiktok.com",
  "amazon.com",
  "reddit.com",
  "quora.com",
  "wikipedia.org",
]);

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function classifyLinkReplacementType(
  href: string,
  projectDomain: string
): LinkReplacementType {
  return urlMatchesProjectSite(href, projectDomain) ? "internal" : "external";
}

function resolveLinkType(input: ResolveReplacementLinkInput): LinkReplacementType {
  const forced = input.linkTypeOverride ?? instructionLinkResolverMode(input.prompt);
  if (forced) return forced;
  return classifyLinkReplacementType(input.selectedHref, input.projectDomain);
}

function cacheKey(input: ResolveReplacementLinkInput, linkType: LinkReplacementType): string {
  return [
    input.projectId,
    linkType,
    hrefKeyForRewrite(input.selectedHref),
    input.prompt.slice(0, 200).toLowerCase(),
    input.selectedAnchorText.slice(0, 80).toLowerCase(),
  ].join("|");
}

function tokenize(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter(w => w.length > 2 && !STOP.has(w))
    ),
  ];
}

function relevanceScore(tokens: string[], url: string, title: string): number {
  let s = 0;
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const titleL = title.toLowerCase();
  for (const tok of tokens) {
    if (path.includes(tok)) s += 2;
    if (titleL.includes(tok)) s += 3;
  }
  return s;
}

function credibilityScoreForUrl(url: string): number {
  if (isCredibleDomain(url)) return 10;
  const h = hostFromUrl(url);
  if (/\.(gov|edu)(\.|$)/i.test(h)) return 9;
  if (/(report|research|study|statistics|survey|insights|trends|whitepaper)/i.test(url)) return 4;
  if (/(blog|forum|community)/i.test(h)) return 1;
  return 2;
}

async function serperOrganicSearch(
  q: string,
  region: string,
  language: string
): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) return [];
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": key },
      body: JSON.stringify({ q, gl: region || "us", hl: language || "en", num: 12 }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { organic?: Array<{ title?: string; link?: string; snippet?: string }> };
    return (json.organic ?? [])
      .map(r => ({
        title: (r.title ?? "").trim(),
        link: (r.link ?? "").trim(),
        snippet: (r.snippet ?? "").trim(),
      }))
      .filter(r => r.link.startsWith("http"));
  } catch {
    return [];
  }
}

/**
 * Collect same-site URLs for a project (brief, audits, blog internal_links).
 */
export async function gatherAvailableLinksForRewrite(params: {
  projectId: string;
  domain: string;
}): Promise<AvailableLinkRecord[]> {
  const projectHost = hostFromUrl(normalizeDomain(params.domain));
  const out: AvailableLinkRecord[] = [];
  const seen = new Set<string>();

  const push = (url: string, title: string, source: string) => {
    if (!url || typeof url !== "string") return;
    const t = url.trim();
    if (!/^https?:\/\//i.test(t) || isDisallowedRewriteUrl(t)) return;
    if (projectHost) {
      const h = hostFromUrl(t);
      if (h !== projectHost && !h.endsWith(`.${projectHost}`)) return;
    }
    const key = hrefKeyForRewrite(t);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url: t, title: (title || "").trim() || t, source });
  };

  const { data: briefRow } = await supabaseAdmin
    .from("project_briefs")
    .select("brief, scraped_urls")
    .eq("project_id", params.projectId)
    .maybeSingle();

  if (briefRow?.brief && typeof briefRow.brief === "object") {
    const brief = briefRow.brief as Partial<BusinessBrief>;
    for (const c of brief.internal_link_candidates ?? []) {
      const row = c as InternalLinkCandidate;
      if (row?.url) push(row.url, row.title ?? "", "brief.internal_link_candidates");
    }
    for (const u of brief.blog_urls ?? []) {
      if (typeof u === "string") push(u, "", "brief.blog_urls");
    }
    for (const u of brief.source_urls ?? []) {
      if (typeof u === "string") push(u, "", "brief.source_urls");
    }
  }

  for (const u of (briefRow?.scraped_urls as string[] | null) ?? []) {
    if (typeof u === "string") push(u, "", "brief.scraped_urls");
  }

  const { data: audits } = await supabaseAdmin
    .from("blog_audits")
    .select("url, title, page_status")
    .eq("project_id", params.projectId)
    .neq("page_status", "broken")
    .limit(600);

  for (const row of audits ?? []) {
    if (row.url) push(row.url, row.title ?? "", "blog_audits");
  }

  const { data: blogs } = await supabaseAdmin
    .from("blogs")
    .select("id, title, internal_links")
    .eq("project_id", params.projectId)
    .limit(250);

  for (const b of blogs ?? []) {
    for (const u of b.internal_links ?? []) {
      if (typeof u === "string") push(u, b.title ?? "", `blogs.internal_links:${b.id}`);
    }
  }

  return out;
}

/** Credible external URLs cited across project blogs (deduped). */
async function gatherProjectExternalCitationPool(projectId: string, projectDomain: string): Promise<
  AvailableLinkRecord[]
> {
  const out: AvailableLinkRecord[] = [];
  const seen = new Set<string>();
  const { data: blogs } = await supabaseAdmin
    .from("blogs")
    .select("external_links")
    .eq("project_id", projectId)
    .limit(300);

  for (const b of blogs ?? []) {
    for (const u of b.external_links ?? []) {
      if (typeof u !== "string" || !u.startsWith("http")) continue;
      if (urlMatchesProjectSite(u, projectDomain)) continue;
      if (!isCredibleDomain(u)) continue;
      const key = hrefKeyForRewrite(u);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url: u, title: u, source: "blogs.external_links" });
    }
  }
  return out;
}

async function validateCandidates(
  rows: Array<{
    url: string;
    title: string;
    relevanceScore: number;
    credibilityScore: number;
    reasonPrefix: string;
  }>,
  max = 10
): Promise<ReplacementLinkCandidate[]> {
  const validated: ReplacementLinkCandidate[] = [];
  for (const row of rows) {
    const v = await validateUrl(row.url, 12_000);
    if (!v.isValid || v.status === undefined || v.status < 200 || v.status >= 400) continue;
    const url = v.finalUrl ?? row.url;
    const status = v.status;
    validated.push({
      url,
      title: row.title,
      domain: hostFromUrl(url),
      relevanceScore: row.relevanceScore,
      credibilityScore: row.credibilityScore,
      status,
      reason:
        status >= 300 && status < 400
          ? `${row.reasonPrefix} (HTTP ${status} redirect)`
          : `${row.reasonPrefix} (HTTP ${status})`,
    });
    if (validated.length >= max) break;
  }
  return validated.sort(
    (a, b) =>
      b.credibilityScore + b.relevanceScore * 0.5 - (a.credibilityScore + a.relevanceScore * 0.5)
  );
}

async function resolveInternalReplacement(
  input: ResolveReplacementLinkInput
): Promise<ReplacementLinkCandidate[]> {
  const projectUrl = normalizeDomain(input.projectDomain);
  const topic = input.topic ?? input.surroundingText;
  const tokens = tokenize(`${topic} ${input.selectedAnchorText} ${input.prompt}`);

  const available = await gatherAvailableLinksForRewrite({
    projectId: input.projectId,
    domain: input.projectDomain,
  });

  const scored = available
    .map(r => {
      if (hrefKeyForRewrite(r.url) === hrefKeyForRewrite(input.selectedHref)) return null;
      const rel = relevanceScore(tokens, r.url, r.title);
      return {
        url: r.url,
        title: r.title || r.url,
        relevanceScore: rel,
        credibilityScore: 0,
        reasonPrefix: "Verified internal blog page",
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 20);

  return validateCandidates(scored, 10);
}

async function resolveExternalReplacement(
  input: ResolveReplacementLinkInput
): Promise<ReplacementLinkCandidate[]> {
  const topic = input.topic ?? input.surroundingText;
  const tokens = tokenize(`${topic} ${input.selectedAnchorText} ${input.prompt}`);
  const projectHost = hostFromUrl(normalizeDomain(input.projectDomain));
  const currentKey = hrefKeyForRewrite(input.selectedHref);

  const poolRows: Array<{
    url: string;
    title: string;
    relevanceScore: number;
    credibilityScore: number;
    reasonPrefix: string;
  }> = [];

  const citationPool = await gatherProjectExternalCitationPool(input.projectId, input.projectDomain);
  for (const r of citationPool) {
    if (hrefKeyForRewrite(r.url) === currentKey) continue;
    poolRows.push({
      url: r.url,
      title: r.title,
      relevanceScore: relevanceScore(tokens, r.url, r.title),
      credibilityScore: credibilityScoreForUrl(r.url),
      reasonPrefix: "Cited on another project article",
    });
  }

  const anchor = input.selectedAnchorText.trim();
  const queryParts = [
    anchor.slice(0, 80),
    ...tokens.slice(0, 6),
    "report OR research OR study OR statistics",
  ].filter(Boolean);
  const serperQ = queryParts.join(" ").slice(0, 180);

  const organic = await serperOrganicSearch(
    serperQ,
    input.region ?? "us",
    input.language ?? "en"
  );

  for (const row of organic) {
    if (isDisallowedRewriteUrl(row.link)) continue;
    const h = hostFromUrl(row.link);
    if (!h || SERP_SKIP_HOSTS.has(h)) continue;
    if (projectHost && (h === projectHost || h.endsWith(`.${projectHost}`))) continue;
    if (hrefKeyForRewrite(row.link) === currentKey) continue;

    const cred = credibilityScoreForUrl(row.link);
    if (cred < 4 && !isCredibleDomain(row.link)) continue;

    poolRows.push({
      url: row.link,
      title: row.title || row.link,
      relevanceScore: relevanceScore(tokens, row.link, `${row.title} ${row.snippet}`),
      credibilityScore: cred,
      reasonPrefix: isCredibleDomain(row.link)
        ? "Credible external source (SERP)"
        : "External source (SERP)",
    });
  }

  const deduped = new Map<string, (typeof poolRows)[number]>();
  for (const row of poolRows) {
    const key = hrefKeyForRewrite(row.url);
    const prev = deduped.get(key);
    if (!prev || prev.relevanceScore + prev.credibilityScore < row.relevanceScore + row.credibilityScore) {
      deduped.set(key, row);
    }
  }

  const ranked = [...deduped.values()]
    .sort(
      (a, b) =>
        b.credibilityScore + b.relevanceScore * 0.6 - (a.credibilityScore + a.relevanceScore * 0.6)
    )
    .slice(0, 16);

  return validateCandidates(ranked, 10);
}

/**
 * Type-aware replacement resolver — internal vs external pools, HTTP validation, short TTL cache.
 */
export async function resolveReplacementLink(
  input: ResolveReplacementLinkInput
): Promise<ResolveReplacementLinkResult> {
  const linkType = resolveLinkType(input);
  const key = cacheKey(input, linkType);
  const cached = resolveCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const candidates =
    linkType === "internal"
      ? await resolveInternalReplacement(input)
      : await resolveExternalReplacement(input);

  const result: ResolveReplacementLinkResult = {
    linkType,
    candidates,
    selectedUrl: candidates[0]?.url,
    errorMessage:
      candidates.length === 0
        ? linkType === "internal"
          ? "No relevant working internal blog link found."
          : "No verified credible external source found."
        : undefined,
  };

  resolveCache.set(key, { at: Date.now(), value: result });
  return result;
}

/** Back-compat wrapper used by older call sites. */
export async function findRelevantWorkingLinks(input: {
  topic: string;
  anchorText: string;
  projectUrl: string;
  currentUrl: string;
  availableLinks: AvailableLinkRecord[];
  maxCandidatesToProbe?: number;
}): Promise<ResolvedLinkOption[]> {
  const tokens = tokenize(`${input.topic} ${input.anchorText}`);
  const scored = input.availableLinks
    .map(r => {
      if (hrefKeyForRewrite(r.url) === hrefKeyForRewrite(input.currentUrl)) return null;
      return {
        url: r.url,
        title: r.title,
        relevanceScore: relevanceScore(tokens, r.url, r.title),
        credibilityScore: 0,
        reasonPrefix: "Verified internal page",
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, input.maxCandidatesToProbe ?? 18);

  const validated = await validateCandidates(scored, 10);
  return validated.map(c => ({
    url: c.url,
    title: c.title,
    reason: c.reason,
    relevanceScore: c.relevanceScore,
    status: c.status,
  }));
}

export type SelectedLinkForResolver = {
  id: string;
  anchorText: string;
  href: string;
  type: LinkReplacementType;
};

export type LinkReplacementRow = {
  linkId: string;
  oldHref: string;
  oldAnchorText: string;
  newHref: string;
  newAnchorText: string;
  type: LinkReplacementType;
  reason: string;
  status: number;
  relevanceScore: number;
};

export type AddedLinkRow = {
  href: string;
  anchorText: string;
  type: LinkReplacementType;
  reason: string;
  status: number;
};

export type ResolveReplacementLinksResult = {
  replacements: LinkReplacementRow[];
  addedLinks: AddedLinkRow[];
  candidatesByLinkId: Record<string, ReplacementLinkCandidate[]>;
  errors: Array<{ linkId: string; type: LinkReplacementType; message: string }>;
};

export type ResolveReplacementLinksInput = {
  selectedLinks: SelectedLinkForResolver[];
  surroundingText: string;
  projectDomain: string;
  projectId: string;
  prompt: string;
  forceType?: LinkReplacementType | null;
  topic?: string;
  region?: string;
  language?: string;
  /** When set, only these link ids are resolved. */
  linkIds?: string[];
};

const multiResolveCache = new Map<string, { at: number; value: ResolveReplacementLinksResult }>();

function multiCacheKey(input: ResolveReplacementLinksInput, linkIds: string[]): string {
  return [
    input.projectId,
    input.prompt.slice(0, 160).toLowerCase(),
    input.forceType ?? "auto",
    linkIds.join(","),
    input.selectedLinks.map(l => hrefKeyForRewrite(l.href)).join(","),
  ].join("|");
}

function pickCandidate(
  candidates: ReplacementLinkCandidate[],
  usedKeys: Set<string>
): ReplacementLinkCandidate | null {
  for (const c of candidates) {
    const key = hrefKeyForRewrite(c.url);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    return c;
  }
  return null;
}

/**
 * Resolve verified replacements for one or many links (type-aware per link).
 */
export async function resolveReplacementLinks(
  input: ResolveReplacementLinksInput
): Promise<ResolveReplacementLinksResult> {
  const linkIds =
    input.linkIds ??
    input.selectedLinks.map(l => l.id);

  const key = multiCacheKey(input, linkIds);
  const cached = multiResolveCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const usedKeys = new Set(
    input.selectedLinks.map(l => hrefKeyForRewrite(l.href))
  );
  const replacements: LinkReplacementRow[] = [];
  const candidatesByLinkId: Record<string, ReplacementLinkCandidate[]> = {};
  const errors: ResolveReplacementLinksResult["errors"] = [];

  const targets = input.selectedLinks.filter(l => linkIds.includes(l.id));

  for (const link of targets) {
    const effectiveType: LinkReplacementType =
      input.forceType ?? link.type;

    const resolution = await resolveReplacementLink({
      selectedHref: link.href,
      selectedAnchorText: link.anchorText,
      surroundingText: input.surroundingText,
      projectDomain: input.projectDomain,
      projectId: input.projectId,
      prompt: input.prompt,
      topic: input.topic,
      linkTypeOverride: effectiveType,
      region: input.region,
      language: input.language,
    });

    candidatesByLinkId[link.id] = resolution.candidates;

    const pick = pickCandidate(resolution.candidates, usedKeys);
    if (!pick) {
      errors.push({
        linkId: link.id,
        type: effectiveType,
        message:
          effectiveType === "internal"
            ? "No verified internal replacement found."
            : "No verified credible external source found.",
      });
      continue;
    }

    replacements.push({
      linkId: link.id,
      oldHref: link.href,
      oldAnchorText: link.anchorText,
      newHref: pick.url,
      newAnchorText: link.anchorText,
      type: effectiveType,
      reason: pick.reason,
      status: pick.status,
      relevanceScore: pick.relevanceScore,
    });
  }

  const addedLinks: AddedLinkRow[] = [];
  if (/\badd\s+(more\s+)?(links?|sources?)/i.test(input.prompt)) {
    const wantTypes: LinkReplacementType[] = input.forceType
      ? [input.forceType]
      : ["internal", "external"];

    for (const t of wantTypes) {
      const resolution = await resolveReplacementLink({
        selectedHref: input.selectedLinks[0]?.href ?? "https://example.com/",
        selectedAnchorText: input.selectedLinks[0]?.anchorText ?? input.topic ?? "resource",
        surroundingText: input.surroundingText,
        projectDomain: input.projectDomain,
        projectId: input.projectId,
        prompt: `${input.prompt} additional ${t} reference`,
        topic: input.topic,
        linkTypeOverride: t,
        region: input.region,
        language: input.language,
      });
      const pick = pickCandidate(resolution.candidates, usedKeys);
      if (!pick) continue;
      addedLinks.push({
        href: pick.url,
        anchorText: pick.title.slice(0, 80) || "related resource",
        type: t,
        reason: pick.reason,
        status: pick.status,
      });
      if (addedLinks.length >= 3) break;
    }
  }

  const result: ResolveReplacementLinksResult = {
    replacements,
    addedLinks,
    candidatesByLinkId,
    errors,
  };

  multiResolveCache.set(key, { at: Date.now(), value: result });
  return result;
}
