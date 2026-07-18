/**
 * Deep research for blog grounding (server-only).
 *
 * The goal: stop the model from writing blogs out of its own head. Before we
 * draft, we run a real web-research pass that pulls SPECIFIC facts and statistics
 * for the keyword, each tied to a CREDIBLE PRIMARY SOURCE (a research report,
 * government/institutional dataset, academic paper, or established research org),
 * published within the freshness window. Those verified facts + source URLs are
 * then injected into the blog prompt so the article is built on real data and its
 * external citations point only at sources we actually fetched — never fabricated.
 *
 * Engine: Perplexity's `sonar`/`sonar-pro` models search the live web and return
 * grounded answers plus the exact source URLs (`citations` / `search_results`).
 * That makes it the production "deep research tool" for this step.
 *
 * Design constraints (production):
 *   - NEVER blocks or fails generation: any error → empty result, and the prompt
 *     falls back to its own citation guardrails.
 *   - Every returned source URL is HTTP-validated before we hand it to the writer,
 *     so we don't instruct the model to cite a dead link.
 *   - Bounded latency: single request, hard timeout.
 *
 * Env:
 *   PERPLEXITY_API_KEY        — required (no key → empty result)
 *   PERPLEXITY_RESEARCH_MODEL — optional, defaults to "sonar-pro"
 */

import { recordPerplexityCall } from '@/lib/admin/logging/record-provider-call';
import { validateExternalUrls } from '@/lib/blog-content';
import { minCitationYear } from '@/lib/blog-content';

const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const DEFAULT_TIMEOUT_MS = 25_000;

/** A specific, citable fact the writer can build a claim on. */
export interface ResearchFact {
  /** The factual claim / data point, stated plainly. */
  claim: string;
  /** The concrete statistic or figure, if any (e.g. "42% of workers"). */
  statistic?: string;
  sourceTitle: string;
  sourceUrl: string;
  publisher?: string;
  year?: number;
}

/** A credible source URL the article is allowed to cite. */
export interface CredibleSource {
  title: string;
  url: string;
  publisher?: string;
  year?: number;
}

export interface DeepResearchResult {
  facts: ResearchFact[];
  sources: CredibleSource[];
}

export interface DeepResearchOptions {
  /** Minimum credible sources we want (soft — we return whatever validates). */
  minSources?: number;
  timeoutMs?: number;
  /** Oldest acceptable publication year. Defaults to the app-wide freshness floor. */
  freshnessFloor?: number;
}

// Domains that are not credible primary sources for citation purposes.
const NON_CREDIBLE_HOST = /(^|\.)(reddit|quora|medium|pinterest|facebook|instagram|twitter|x|tiktok|youtube|linkedin|wikipedia|wikihow|slideshare)\.(com|org)$/i;

// Strong credibility signals — government, education, institutions, and
// well-known research organisations / primary-data publishers.
const HIGH_CREDIBILITY_HOST =
  /(\.gov(\.[a-z]{2})?$|\.edu(\.[a-z]{2})?$|\.ac\.[a-z]{2}$|\.int$|(^|\.)(who|worldbank|oecd|imf|un|ilo|weforum|europa|nih|ncbi\.nlm\.nih|cdc|bls|census|eurostat|statista|pewresearch|mckinsey|gartner|deloitte|pwc|ey|bcg|bain|accenture|forrester|shrm|ieee|iso|nature|sciencedirect|springer|jstor|researchgate)\.)/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isCredibleUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  const host = hostOf(url);
  if (!host) return false;
  if (NON_CREDIBLE_HOST.test(host)) return false;
  return true;
}

/** Credibility rank for sorting fallback sources: higher = more authoritative. */
function credibilityScore(url: string): number {
  const host = hostOf(url);
  if (!host) return 0;
  if (HIGH_CREDIBILITY_HOST.test(host)) return 3;
  if (/\.org$/.test(host)) return 2;
  return 1;
}

/** Best-effort extraction of the research JSON object from the model reply. */
function parseResearchJson(text: string): { facts?: unknown; sources?: unknown } | null {
  if (!text) return null;
  // Prefer a fenced or bare JSON object.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function coerceYear(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 1990 && n < 2100 ? n : undefined;
}

/**
 * Runs a deep-research pass for `keyword` and returns validated facts + credible
 * source URLs. Always resolves; returns empty arrays on any failure so callers
 * can treat it as best-effort grounding.
 */
export async function researchCredibleSources(
  keyword: string,
  opts: DeepResearchOptions = {}
): Promise<DeepResearchResult> {
  const kw = keyword?.trim();
  if (!kw) return { facts: [], sources: [] };

  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  // No Perplexity key → fall back to a Serper-based credible-source search so
  // blogs are still grounded in real, validated source URLs (facts come from the
  // model reading the snippets/pages; the full fact-extraction pass needs Perplexity).
  if (!apiKey) return researchViaSerper(kw, opts);

  const minSources = opts.minSources ?? 3;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const freshnessFloor = opts.freshnessFloor ?? minCitationYear();
  const model = process.env.PERPLEXITY_RESEARCH_MODEL?.trim() || 'sonar-pro';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const researchPrompt = `Research the topic "${kw}" and return ONLY hard, verifiable facts backed by credible PRIMARY sources.

Requirements:
- Find at least ${Math.max(minSources, 4)} specific facts or statistics with concrete numbers.
- Each fact MUST come from a credible primary source: a research report, government or institutional dataset, academic/peer-reviewed paper, official standards body, or an established research organisation (e.g. .gov, .edu, WHO, World Bank, OECD, ILO, WEF, McKinsey, Gartner, Deloitte, PwC, Statista report pages, PubMed/NCBI, IEEE). Do NOT use blogs, forums, Wikipedia, listicles, or vendor marketing pages.
- Only sources published in ${freshnessFloor} or later. Prefer the most recent edition.
- Give the EXACT source URL for each fact (a real, working page you found — never invent one).

Return ONLY a JSON object in this exact shape, no prose:
{
  "facts": [
    { "claim": "<the fact stated plainly>", "statistic": "<the number/figure, if any>", "sourceTitle": "<report/paper title>", "sourceUrl": "<exact url>", "publisher": "<organisation>", "year": <year> }
  ],
  "sources": [
    { "title": "<source title>", "url": "<exact url>", "publisher": "<organisation>", "year": <year> }
  ]
}`;

    const res = await fetch(PERPLEXITY_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: researchPrompt }],
        max_tokens: 1600,
        temperature: 0.1,
        search_recency_filter: 'year',
        return_citations: true,
      }),
    });

    if (!res.ok) {
      recordPerplexityCall('deep_research', false, Date.now() - started, `HTTP ${res.status}`);
      return { facts: [], sources: [] };
    }

    const json = (await res.json()) as {
      citations?: unknown;
      search_results?: Array<{ title?: string; url?: string; date?: string }>;
      choices?: Array<{ message?: { content?: string } }>;
    };
    recordPerplexityCall('deep_research', true, Date.now() - started);

    const content = json.choices?.[0]?.message?.content ?? '';
    const parsed = parseResearchJson(content) ?? {};

    // 1. Facts from the model's structured answer.
    const rawFacts = Array.isArray(parsed.facts) ? parsed.facts : [];
    const facts: ResearchFact[] = rawFacts
      .map((f): ResearchFact | null => {
        const o = f as Record<string, unknown>;
        const sourceUrl = String(o.sourceUrl ?? '').trim();
        const claim = String(o.claim ?? '').trim();
        if (!claim || !isCredibleUrl(sourceUrl)) return null;
        return {
          claim,
          statistic: o.statistic ? String(o.statistic).trim() : undefined,
          sourceTitle: String(o.sourceTitle ?? '').trim() || hostOf(sourceUrl),
          sourceUrl,
          publisher: o.publisher ? String(o.publisher).trim() : undefined,
          year: coerceYear(o.year),
        };
      })
      .filter((f): f is ResearchFact => f !== null);

    // 2. Candidate sources = parsed sources ∪ fact URLs ∪ API citations/search_results.
    const sourceMap = new Map<string, CredibleSource>();
    const addSource = (s: CredibleSource) => {
      if (!isCredibleUrl(s.url)) return;
      const key = s.url.split('?')[0].replace(/\/+$/, '').toLowerCase();
      if (!sourceMap.has(key)) sourceMap.set(key, s);
    };

    (Array.isArray(parsed.sources) ? parsed.sources : []).forEach((s) => {
      const o = s as Record<string, unknown>;
      addSource({
        title: String(o.title ?? '').trim(),
        url: String(o.url ?? '').trim(),
        publisher: o.publisher ? String(o.publisher).trim() : undefined,
        year: coerceYear(o.year),
      });
    });
    facts.forEach((f) => addSource({ title: f.sourceTitle, url: f.sourceUrl, publisher: f.publisher, year: f.year }));
    (json.search_results ?? []).forEach((r) => {
      if (r.url) addSource({ title: r.title || hostOf(r.url), url: r.url, year: coerceYear(r.date?.slice(0, 4)) });
    });
    (Array.isArray(json.citations) ? json.citations : []).forEach((c) => {
      if (typeof c === 'string') addSource({ title: hostOf(c), url: c });
    });

    // 3. Validate reachability so we never ask the writer to cite a dead link.
    const candidateUrls = [...sourceMap.values()].map((s) => s.url);
    const validSet = await validateExternalUrls(candidateUrls);
    const sources = [...sourceMap.values()].filter((s) => validSet.has(s.url));
    const validFacts = facts.filter((f) => validSet.has(f.sourceUrl));

    // If Perplexity came back thin, top up credible source URLs via Serper.
    if (sources.length < minSources) {
      const fallback = await researchViaSerper(kw, opts);
      const seen = new Set(sources.map((s) => s.url.split('?')[0].replace(/\/+$/, '').toLowerCase()));
      for (const s of fallback.sources) {
        const key = s.url.split('?')[0].replace(/\/+$/, '').toLowerCase();
        if (!seen.has(key)) { seen.add(key); sources.push(s); }
      }
    }

    return { facts: validFacts, sources };
  } catch (e) {
    recordPerplexityCall(
      'deep_research',
      false,
      Date.now() - started,
      e instanceof Error ? e.message : String(e)
    );
    return { facts: [], sources: [] };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Serper-based fallback: finds credible source URLs for the keyword (biased to
 * reports/studies/datasets), keeps only credible domains, ranks the most
 * authoritative first, and validates reachability. Returns source URLs only —
 * fact extraction requires the Perplexity path.
 */
async function researchViaSerper(
  keyword: string,
  opts: DeepResearchOptions = {}
): Promise<DeepResearchResult> {
  try {
    const { searchCredibleWeb } = await import('@/lib/research');
    const results = await searchCredibleWeb(keyword);
    const credible = results
      .filter((r) => isCredibleUrl(r.url))
      .sort((a, b) => credibilityScore(b.url) - credibilityScore(a.url));

    // Prefer high-credibility hosts; take a generous slice, then validate.
    const top = credible.slice(0, 12);
    const validSet = await validateExternalUrls(top.map((r) => r.url));

    const sources: CredibleSource[] = [];
    const seen = new Set<string>();
    for (const r of top) {
      if (!validSet.has(r.url)) continue;
      const key = r.url.split('?')[0].replace(/\/+$/, '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({ title: r.title || hostOf(r.url), url: r.url, publisher: hostOf(r.url) });
    }

    const minSources = opts.minSources ?? 3;
    // Only return if we cleared the credibility bar for a useful pool.
    return { facts: [], sources: sources.slice(0, Math.max(minSources, 6)) };
  } catch {
    return { facts: [], sources: [] };
  }
}

/**
 * Formats deep-research output for injection into the blog prompt. Returns "" when
 * there's nothing verified, so the caller can omit the block entirely.
 */
export function formatDeepResearchForPrompt(result: DeepResearchResult): string {
  if (!result.sources.length && !result.facts.length) return '';

  const factLines = result.facts
    .slice(0, 12)
    .map((f) => {
      const stat = f.statistic ? `${f.statistic} — ` : '';
      const attr = [f.publisher, f.year].filter(Boolean).join(', ');
      return `- ${stat}${f.claim}${attr ? ` (${attr})` : ''} → ${f.sourceUrl}`;
    })
    .join('\n');

  const sourceLines = result.sources
    .slice(0, 12)
    .map((s) => {
      const attr = [s.publisher, s.year].filter(Boolean).join(', ');
      return `- ${s.title || s.url}${attr ? ` (${attr})` : ''} → ${s.url}`;
    })
    .join('\n');

  return `\nVERIFIED RESEARCH (fetched live from credible primary sources — build the article on THIS real data, and cite ONLY from the URLs below):
${factLines ? `\nKey facts & statistics (use these, with the exact figures, and cite the URL next to each):\n${factLines}` : ''}
${sourceLines ? `\nApproved citation URLs (every external link in the article MUST be one of these exact URLs — do NOT invent or use any other external URL):\n${sourceLines}` : ''}
`;
}
