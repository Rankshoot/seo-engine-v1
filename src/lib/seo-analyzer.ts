import { Blog, BlogSeoIssueKey } from "./types";
import { reclassifyBlogLinkSidebarLists, urlMatchesProjectSite } from "./blog-content";

export interface SEOCheck {
  key: BlogSeoIssueKey;
  label: string;
  pass: boolean;
  points: number;
  hint: string;
}

export interface SEOScore {
  total: number;
  maxTotal: number;
  grade: "A" | "B" | "C" | "D" | "F";
  checks: SEOCheck[];
}

/** Lowercase + collapse whitespace — use for all case-insensitive substring checks. */
export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * True if the target keyword appears in haystack (caller passes haystack already lowercased).
 * - Always accepts full-phrase substring.
 * - For multi-word keys, also passes when each "content" token (length >= 3) appears — ignores <=2-char glue words.
 */
export function keywordInText(keywordNorm: string, haystackLower: string): boolean {
  if (!keywordNorm || !haystackLower) return false;
  if (haystackLower.includes(keywordNorm)) return true;
  const tokens = keywordNorm.split(" ").filter(Boolean);
  if (tokens.length <= 1) return false;
  return tokens.every(t => t.length < 3 || haystackLower.includes(t));
}

/** Count `https?://` markdown links that are not the project's own site. */
export function countMarkdownExternalHttpLinks(md: string, projectDomain?: string): number {
  if (!projectDomain?.trim()) {
    return (md.match(/\[([^\]]+)\]\(https?:\/\//g) ?? []).length;
  }
  let n = 0;
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  for (const m of md.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > 0 && md[idx - 1] === "!") continue;
    if (!urlMatchesProjectSite(m[2], projectDomain)) n++;
  }
  return n;
}

/** Relative `/...` links plus absolute URLs on the project domain. */
export function countMarkdownInternalLinks(md: string, projectDomain?: string): number {
  const relative = (md.match(/\[([^\]]+)\]\(\//g) ?? []).length;
  if (!projectDomain?.trim()) return relative;
  let ownAbsolute = 0;
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  for (const m of md.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > 0 && md[idx - 1] === "!") continue;
    if (urlMatchesProjectSite(m[2], projectDomain)) ownAbsolute++;
  }
  return relative + ownAbsolute;
}

/** First ~100 words of body as plain lowercase text (strip headings / link syntax) for intro keyword check. */
export function openingPlainLower(md: string, maxWords: number): string {
  const noFront = md.replace(/^---[\s\S]*?---\s*/m, "");
  const flat = noFront
    .replace(/^#{1,6}\s+.+$/gm, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#-]/g, " ")
    .toLowerCase();
  return flat.split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ");
}

/** Pure SEO scoring function reused across client and server. */
export function computeSEOScore(
  blog: Partial<Blog> & { content?: string; title?: string; meta_description?: string; target_keyword?: string; word_count?: number },
  projectDomain?: string,
  expectedTitle?: string
): SEOScore {
  const kw      = normalizeKeyword(blog.target_keyword ?? "");
  const content = blog.content ?? "";
  const title   = blog.title?.toLowerCase() ?? "";
  const meta    = (blog.meta_description ?? "").toLowerCase();

  const expectedTitleNorm = expectedTitle?.toLowerCase().trim() || "";
  const isExpectedTitle = expectedTitleNorm ? (title.trim() === expectedTitleNorm) : false;

  const firstParaMatch = content.match(/^#.+\n+(.+)/m);
  const firstPara = firstParaMatch ? firstParaMatch[1].toLowerCase() : content.slice(0, 500).toLowerCase();
  const opening100 = openingPlainLower(content, 100);
  const introHaystack = `${opening100} ${firstPara}`.trim();

  const h2Count = (content.match(/^## /gm) ?? []).length;
  const h3Count = (content.match(/^### /gm) ?? []).length;

  const classified = reclassifyBlogLinkSidebarLists(
    blog.external_links ?? [],
    blog.internal_links ?? [],
    projectDomain
  );
  const markdownExternalLinks = countMarkdownExternalHttpLinks(content, projectDomain);
  const markdownInternalLinks = countMarkdownInternalLinks(content, projectDomain);
  // Merge lists to get standard count
  const externalLinks = Math.max(classified.externalLinks.length, markdownExternalLinks);
  const internalLinks = Math.max(classified.internalLinks.length, markdownInternalLinks);

  const hasFAQ = /#{1,3}\s*(faq|frequently asked)/i.test(content);

  const words = content.toLowerCase().replace(/[#>*_\-[\]()`~.,!?;:"]/g, " ").split(/\s+/).filter(Boolean);
  const kwWords = kw.replace(/[#>*_\-[\]()`~.,!?;:"]/g, " ").split(/\s+/).filter(Boolean);
  let kwOccurrences = 0;
  for (let i = 0; i <= words.length - kwWords.length; i++) {
    if (kwWords.every((w, j) => words[i + j] === w)) kwOccurrences++;
  }
  const kwDensity = words.length > 0 ? (kwOccurrences / words.length) * 100 : 0;

  // Word count fallback if missing
  const wordCount = blog.word_count ?? words.length;

  const checks: SEOCheck[] = [
    {
      key: "title_keyword",
      label: "Target keyword in title",
      pass: keywordInText(kw, title) || isExpectedTitle,
      points: 15,
      hint: "Include the target keyword in your H1 title",
    },
    {
      key: "intro_keyword",
      label: "Keyword in first 100 words",
      pass: keywordInText(kw, introHaystack),
      points: 10,
      hint: "Mention the target keyword within the opening paragraph",
    },
    {
      key: "meta_keyword",
      label: "Meta description has keyword",
      pass: keywordInText(kw, meta),
      points: 10,
      hint: "Include the target keyword in your meta description",
    },
    {
      key: "meta_length",
      label: "Meta description 150–160 chars",
      pass: meta.length >= 140 && meta.length <= 165,
      points: 5,
      hint: `Meta is ${meta.length} chars — aim for 150–160`,
    },
    {
      key: "word_count",
      label: "Content ≥ 1,500 words",
      pass: wordCount >= 1500,
      points: 15,
      hint: `Current: ${wordCount} words — aim for at least 1,500`,
    },
    {
      key: "h2_structure",
      label: "Has ≥ 3 H2 headings",
      pass: h2Count >= 3,
      points: 10,
      hint: `${h2Count} H2 headings — add more structured sections`,
    },
    {
      key: "h3_structure",
      label: "Has H3 sub-headings",
      pass: h3Count >= 1,
      points: 5,
      hint: "Add H3 headings to organise sub-topics",
    },
    {
      key: "faq",
      label: "FAQ section included",
      pass: hasFAQ,
      points: 10,
      hint: "Add a FAQ section to capture People Also Ask traffic",
    },
    {
      key: "external_links",
      label: "External links (3–8)",
      pass: externalLinks >= 3,
      points: 10,
      hint: `${externalLinks} external links — aim for 3–8 authoritative sources`,
    },
    {
      key: "internal_links",
      label: "Internal links present",
      pass: internalLinks >= 1,
      points: 5,
      hint: "Link to other relevant articles on your site",
    },
    {
      key: "keyword_density",
      label: "Keyword density 0.5–3%",
      pass: kwDensity >= 0.5 && kwDensity <= 3,
      points: 5,
      hint: `Density: ${kwDensity.toFixed(2)}% — ideal range is 0.5–3%`,
    },
  ];

  const total    = checks.reduce((s, c) => s + (c.pass ? c.points : 0), 0);
  const maxTotal = checks.reduce((s, c) => s + c.points, 0);
  const pct      = (total / maxTotal) * 100;
  const grade: SEOScore["grade"] =
    pct >= 90 ? "A" : pct >= 75 ? "B" : pct >= 60 ? "C" : pct >= 40 ? "D" : "F";

  return { total, maxTotal, grade, checks };
}
