import { searchOpenverse } from "@/lib/images/providers/openverse";
import { searchWikimedia } from "@/lib/images/providers/wikimedia";
import { searchPexels } from "@/lib/images/providers/pexels";

/**
 * A copyright-safe image with the attribution + license data a blog needs to
 * reuse it legally. Unlike the old Serper/Google path (best-effort CC filter,
 * nothing stored), every provider here returns a verifiable license.
 */
export interface LicensedImage {
  /** Direct media URL to fetch + convert to webp. */
  imageUrl: string;
  thumbnailUrl?: string;
  title: string;
  /** Landing page to attribute / link back to. */
  sourcePage: string;
  /** Creator/photographer name — kept for internal records even though we no
   *  longer display it (see `requiresAttribution`). */
  author: string;
  /** Human-readable license label, e.g. "CC0 (Public Domain)", "Pexels License". */
  license: string;
  licenseUrl: string;
  provider: "openverse" | "wikimedia" | "pexels";
}

/** Credit record persisted on `blogs.content_data.image_credits` (internal record only — not rendered). */
export interface ImageCredit {
  storedUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourcePage: string;
  provider: LicensedImage["provider"];
  placement: "cover" | "section";
}

function dedupeByUrl(images: LicensedImage[]): LicensedImage[] {
  const seen = new Set<string>();
  const out: LicensedImage[] = [];
  for (const img of images) {
    const key = img.imageUrl.split("?")[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(img);
  }
  return out;
}

// Words that make an image query too specific/noisy for photo catalogs, OR
// that are generic blog-title filler that crowds out the real subject when a
// query gets truncated to N words. Both categories get stripped before
// searching so the *subject nouns* survive truncation instead of leftover
// filler like "major types" (from "The Major Types of X You Should Know").
const IMAGE_QUERY_STOPWORDS = new Set([
  // grammar / connectors
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'for', 'in', 'on', 'at', 'by',
  'with', 'from', 'into', 'your', 'you', 'our', 'their', 'its', 'is', 'are', 'be',
  'how', 'what', 'why', 'when', 'where', 'which', 'who', 'do', 'does', 'can', 'should',
  // media/meta words that never help an image search
  'illustration', 'image', 'photo', 'picture', 'graphic', 'visual', 'infographic',
  // generic blog-title template filler — these carry no visual-search meaning
  // and, left in, push the real subject nouns out of a truncated query.
  'guide', 'complete', 'ultimate', 'best', 'top', 'vs', 'versus', 'step', 'steps',
  'strong', 'building', 'build', 'using', 'use', 'about', 'that', 'this',
  'major', 'minor', 'types', 'type', 'category', 'categories', 'kind', 'kinds',
  'deserve', 'deserves', 'deserving', 'attention', 'everything', 'things', 'thing',
  'importance', 'essential', 'overview', 'introduction', 'role', 'need', 'needs',
  'knowing', 'reason', 'reasons', 'more', 'most', 'all', 'every', 'each', 'must',
]);

/** Lowercased, punctuation-stripped, stopword-filtered tokens (order preserved). */
function significantTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !IMAGE_QUERY_STOPWORDS.has(w) && w.length > 2);
}

/**
 * Whether a candidate image's title is actually about the query, not just a
 * loose keyword-in-metadata match. CC/public-domain catalogs run naive
 * full-text search over a huge, uncurated corpus — a 1-2 word query can match
 * something wildly unrelated (a medical diagram, a costume mask) that merely
 * contains one of the words somewhere. Requiring a majority of the *query's*
 * significant tokens to literally appear in the *candidate's* title filters
 * those false positives out before we ever upload them.
 */
function isRelevantTitle(title: string, queryTokens: string[]): boolean {
  if (!queryTokens.length) return false;
  const titleWords = new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
  const hits = queryTokens.filter((tok) => titleWords.has(tok)).length;
  // Single/two-token queries need every token to show up (nothing to spare);
  // longer queries need a clear majority so a one-word coincidence can't pass.
  const required = queryTokens.length <= 2 ? queryTokens.length : Math.ceil(queryTokens.length * 0.6);
  return hits >= required;
}

/**
 * Ordered, de-duplicated list of query tiers to try, each paired with the
 * tokens used to build it (so relevance can be checked against what was
 * actually searched for). Ordered from most-specific-but-still-real to a
 * short last resort — we deliberately do NOT fall back to a blind 2-word
 * truncation of a filler-heavy title; the fallback query (usually the clean
 * focus keyword) is tried first because it's far less likely to be noise.
 */
function buildQueryTiers(query: string, fallbackQuery?: string): Array<{ q: string; tokens: string[] }> {
  const tiers: Array<{ q: string; tokens: string[] }> = [];
  const push = (raw: string, maxWords: number) => {
    const tokens = significantTokens(raw).slice(0, maxWords);
    const q = tokens.join(' ');
    if (q) tiers.push({ q, tokens });
  };

  push(query, 5);
  if (fallbackQuery) push(fallbackQuery, 5);
  // Last resort: a shorter cut of the primary query. Still relevance-checked
  // against its own (short) token set, so a degenerate tier can't slip junk
  // through — it just tends to find fewer, still-on-topic matches.
  push(query, 2);

  // De-dupe by query string while preserving order.
  const seen = new Set<string>();
  return tiers.filter((t) => (seen.has(t.q) ? false : (seen.add(t.q), true)));
}

/**
 * Searches copyright-safe, no-attribution-required image sources for `query`,
 * returning up to `count` results. Order of preference:
 *   1. Pexels (if PEXELS_API_KEY is set) — real stock photography with much
 *      better search relevance than the CC catalogs, and the Pexels License
 *      needs no attribution.
 *   2. Openverse — public-domain / CC0 only (see providers/openverse.ts).
 *   3. Wikimedia Commons — public-domain / CC0 only (see providers/wikimedia.ts).
 *
 * Every candidate is relevance-checked against the query that found it before
 * being returned (see `isRelevantTitle`) — a provider returning something
 * merely keyword-adjacent is filtered out rather than passed through. Returns
 * [] when nothing both relevant AND attribution-free is found; callers must
 * treat that as "skip this image", never fabricate or force a weak match.
 */
export async function searchLicensedImages(
  query: string,
  count = 5,
  opts: { fallbackQuery?: string } = {}
): Promise<LicensedImage[]> {
  const target = Math.min(Math.max(count, 1), 20);
  const collected: LicensedImage[] = [];

  const providers: Array<(q: string, n: number) => Promise<LicensedImage[]>> = [
    searchPexels, // no-op (returns []) when PEXELS_API_KEY isn't set
    searchOpenverse,
    searchWikimedia,
  ];

  const tiers = buildQueryTiers(query, opts.fallbackQuery);
  if (!tiers.length) return [];

  for (const { q, tokens } of tiers) {
    for (const search of providers) {
      if (collected.length >= target) break;
      try {
        const results = await search(q, Math.max(target * 2, 10)); // over-fetch; relevance filter narrows it
        const relevant = results.filter((img) => isRelevantTitle(img.title, tokens));
        collected.push(...relevant);
      } catch {
        // Provider-level failures are already logged inside each provider.
      }
    }
    if (dedupeByUrl(collected).length >= target) break;
  }

  return dedupeByUrl(collected).slice(0, target);
}
