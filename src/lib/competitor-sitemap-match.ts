/**
 * Map benchmark keywords to competitor blog URLs discovered via public sitemap
 * (`fetchBlogUrls` in jina.ts). Lexical overlap between the keyword and URL path
 * slugs — no extra paid API calls beyond fetching sitemap XML.
 */

const STOP = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'in',
  'is',
  'it',
  'its',
  'may',
  'might',
  'must',
  'of',
  'on',
  'or',
  'our',
  'shall',
  'should',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'this',
  'those',
  'to',
  'too',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

function normalizePhrase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordTokens(keyword: string): string[] {
  return normalizePhrase(keyword)
    .split(' ')
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOP.has(t));
}

/** Full pathname as a single normalized string (for substring / phrase checks). */
export function urlPathAsPhrase(url: string): string {
  try {
    const path = new URL(url).pathname;
    return normalizePhrase(decodeURIComponent(path).replace(/\//g, ' '));
  } catch {
    return '';
  }
}

/** Distinct slug tokens from the URL path. */
function pathTokenSet(url: string): Set<string> {
  const phrase = urlPathAsPhrase(url);
  const set = new Set<string>();
  for (const t of phrase.split(' ')) {
    if (t.length >= 2) set.add(t);
  }
  return set;
}

function tokenMatchesSlugToken(kw: string, slugTokens: Set<string>): boolean {
  if (slugTokens.has(kw)) return true;
  if (kw.length >= 4) {
    const singular = kw.endsWith('s') ? kw.slice(0, -1) : kw;
    const plural = `${kw}s`;
    if (slugTokens.has(singular) || slugTokens.has(plural)) return true;
  }
  if (kw.length < 4) return false;
  for (const st of slugTokens) {
    if (st.startsWith(kw) || kw.startsWith(st)) return true;
  }
  return false;
}

function lastSegmentTitleHint(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '');
    const seg = path.split('/').filter(Boolean).pop() ?? '';
    const words = decodeURIComponent(seg)
      .split(/[-_]+/)
      .filter(Boolean)
      .map(w => (w ? w[0].toUpperCase() + w.slice(1) : ''));
    return words.join(' ').slice(0, 200) || url;
  } catch {
    return url;
  }
}

export interface BlogKeywordMatch {
  url: string;
  score: number;
  titleHint: string;
}

/**
 * Pick the sitemap blog URL that best matches `keyword` using path tokens +
 * optional full-phrase containment. Returns null if nothing clears the bar.
 */
export function bestMatchingBlogUrl(keyword: string, blogUrls: string[]): BlogKeywordMatch | null {
  const trimmed = keyword.trim().toLowerCase();
  if (!trimmed || !blogUrls.length) return null;

  const kws = keywordTokens(keyword);
  if (!kws.length) return null;

  const kwPhrase = normalizePhrase(keyword);
  const minScore =
    kws.length <= 1 ? 1 : 2;

  let best: BlogKeywordMatch | null = null;

  for (const url of blogUrls) {
    const pathPhrase = urlPathAsPhrase(url);
    if (!pathPhrase) continue;
    const slugTokens = pathTokenSet(url);

    let score = 0;
    for (const t of kws) {
      if (tokenMatchesSlugToken(t, slugTokens)) score += 1;
    }

    if (kwPhrase.length >= 6 && pathPhrase.includes(kwPhrase)) {
      score += 4;
    } else {
      const bigrams: string[] = [];
      for (let i = 0; i < kws.length - 1; i++) {
        bigrams.push(`${kws[i]} ${kws[i + 1]}`);
      }
      for (const bg of bigrams) {
        if (bg.length >= 5 && pathPhrase.includes(bg)) score += 2;
      }
    }

    if (score < minScore) continue;

    if (!best || score > best.score) {
      best = {
        url,
        score,
        titleHint: lastSegmentTitleHint(url),
      };
    }
  }

  return best;
}
