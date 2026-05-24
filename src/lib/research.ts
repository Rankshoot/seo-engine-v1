/** Serper-backed SERP/video/news context for blog prompts. */

import { recordSerperCall } from '@/lib/admin/logging/record-provider-call';

export interface ResearchArticle {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  position: number;
}

export interface ResearchVideo {
  title: string;
  channel: string;
  link: string;
  snippet: string;
}

export interface ResearchNews {
  title: string;
  source: string;
  snippet: string;
  link: string;
  date: string;
}

export interface ResearchContext {
  keyword: string;
  topArticles: ResearchArticle[];
  peopleAlsoAsk: { question: string; answer: string }[];
  relatedSearches: string[];
  videos: ResearchVideo[];
  news: ResearchNews[];
  totalSourcesFound: number;
}

export interface CompetitorGapKeyword {
  keyword: string;
  competitorDomain: string;
  sourceTitle: string;
  /** SERP article URL when known; otherwise a search link or empty */
  sourceUrl: string;
  estimatedVolume: number;
}

const SERPER_API_KEY = () => process.env.SERPER_API_KEY!;

type SerperResultRow = Record<string, unknown>;

async function serperPost(endpoint: string, body: object): Promise<unknown> {
  const started = Date.now();
  try {
    const res = await fetch(`https://google.serper.dev/${endpoint}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      recordSerperCall(endpoint, false, latencyMs, `HTTP ${res.status}`);
      return null;
    }
    recordSerperCall(endpoint, true, latencyMs);
    return res.json();
  } catch (e) {
    recordSerperCall(
      endpoint,
      false,
      Date.now() - started,
      e instanceof Error ? e.message : String(e)
    );
    return null;
  }
}

export async function researchKeyword(
  keyword: string,
  region = 'us',
  language = 'en'
): Promise<ResearchContext> {
  const [web, videos, news] = await Promise.all([
    serperPost('search', { q: keyword, gl: region, hl: language, num: 10 }),
    serperPost('videos', { q: keyword, gl: region, hl: language, num: 6 }),
    serperPost('news', { q: keyword, gl: region, hl: language, num: 5 }),
  ]);

  const topArticles: ResearchArticle[] = ((web as { organic?: SerperResultRow[] } | null)?.organic ?? [])
    .slice(0, 8)
    .map((r, i: number) => {
    let domain = typeof r.domain === "string" ? r.domain : '';
    const link = typeof r.link === "string" ? r.link : "";
    if (!domain && link) {
      try { domain = new URL(link).hostname; } catch { domain = ''; }
    }
    return {
      title: typeof r.title === "string" ? r.title : '',
      url: link,
      snippet: typeof r.snippet === "string" ? r.snippet : '',
      domain,
      position: i + 1,
    };
  });

  const peopleAlsoAsk = ((web as { peopleAlsoAsk?: SerperResultRow[] } | null)?.peopleAlsoAsk ?? [])
    .slice(0, 7)
    .map((q) => ({
      question: typeof q.question === "string" ? q.question : '',
      answer:
        typeof q.snippet === "string"
          ? q.snippet
          : typeof q.answer === "string"
            ? q.answer
            : '',
    }));

  const relatedSearches = ((web as { relatedSearches?: SerperResultRow[] } | null)?.relatedSearches ?? [])
    .slice(0, 8)
    .map((r) => (typeof r.query === "string" ? r.query : ''));

  const videoList: ResearchVideo[] = ((videos as { videos?: SerperResultRow[] } | null)?.videos ?? [])
    .slice(0, 5)
    .map((v) => ({
      title: typeof v.title === "string" ? v.title : '',
      channel:
        typeof v.channel === "string"
          ? v.channel
          : typeof v.source === "string"
            ? v.source
            : '',
      link: typeof v.link === "string" ? v.link : '',
      snippet:
        typeof v.snippet === "string"
          ? v.snippet
          : typeof v.description === "string"
            ? v.description
            : '',
    }));

  const newsList: ResearchNews[] = ((news as { news?: SerperResultRow[] } | null)?.news ?? [])
    .slice(0, 4)
    .map((n) => ({
      title: typeof n.title === "string" ? n.title : '',
      source: typeof n.source === "string" ? n.source : '',
      snippet: typeof n.snippet === "string" ? n.snippet : '',
      link: typeof n.link === "string" ? n.link : '',
      date: typeof n.date === "string" ? n.date : '',
    }));

  const totalSourcesFound =
    topArticles.length + videoList.length + newsList.length + peopleAlsoAsk.length;

  return {
    keyword,
    topArticles,
    peopleAlsoAsk,
    relatedSearches,
    videos: videoList,
    news: newsList,
    totalSourcesFound,
  };
}

export function formatResearchForPrompt(ctx: ResearchContext): string {
  const lines: string[] = [];

  lines.push('=== LIVE RESEARCH CONTEXT (use this to write accurate, current content) ===\n');

  if (ctx.topArticles.length) {
    lines.push('TOP RANKING ARTICLES FOR THIS KEYWORD:');
    ctx.topArticles.forEach((a, i) => {
      lines.push(`${i + 1}. "${a.title}" — ${a.domain}`);
      lines.push(`   Snippet: ${a.snippet}`);
      lines.push(`   URL: ${a.url}`);
    });
    lines.push('');
  }

  if (ctx.peopleAlsoAsk.length) {
    lines.push('PEOPLE ALSO ASK (answer these naturally inside the article and in FAQ):');
    ctx.peopleAlsoAsk.forEach(q => {
      lines.push(`• Q: ${q.question}`);
      if (q.answer) lines.push(`  A: ${q.answer}`);
    });
    lines.push('');
  }

  if (ctx.relatedSearches.length) {
    lines.push('RELATED SEARCHES (use as secondary keywords where natural):');
    lines.push(ctx.relatedSearches.join(', '));
    lines.push('');
  }

  if (ctx.videos.length) {
    lines.push('VIDEO/YOUTUBE CONTENT ON THIS TOPIC (reference insights from these):');
    ctx.videos.forEach(v => {
      lines.push(`• "${v.title}" by ${v.channel}`);
      if (v.snippet) lines.push(`  ${v.snippet}`);
    });
    lines.push('');
  }

  if (ctx.news.length) {
    lines.push('RECENT NEWS (add recency/freshness where relevant):');
    ctx.news.forEach(n => {
      lines.push(`• "${n.title}" — ${n.source} (${n.date})`);
    });
    lines.push('');
  }

  lines.push('LINKING INSTRUCTIONS:');
  lines.push('- Link to authoritative external sources found above using [anchor text](URL) markdown syntax');
  lines.push('- Add 3–5 external links to the most relevant sources');
  lines.push('=== END RESEARCH CONTEXT ===');

  return lines.join('\n');
}

export async function discoverCompetitorGapKeywords(
  competitorDomains: string[],
  niche: string,
  existingKeywords: string[]
): Promise<CompetitorGapKeyword[]> {
  const existingSet = new Set(existingKeywords.map(k => k.toLowerCase().trim()));
  const gaps: CompetitorGapKeyword[] = [];
  const seen = new Set<string>();

  for (const domain of competitorDomains.slice(0, 5)) {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    const [siteResult, nicheResult] = await Promise.all([
      serperPost('search', { q: `site:${cleanDomain} ${niche}`, num: 20 }),
      serperPost('search', { q: `${cleanDomain} ${niche} blog`, num: 10 }),
    ]);

    const allResults = [
      ...(siteResult?.organic ?? []),
      ...(nicheResult?.organic ?? []),
    ];

    const relatedFromSite = [
      ...(siteResult?.relatedSearches ?? []).map((r: { query?: string }) => r.query ?? ''),
      ...(nicheResult?.relatedSearches ?? []).map((r: { query?: string }) => r.query ?? ''),
    ];

    for (const result of allResults as { title?: string; link?: string }[]) {
      const title = result.title ?? '';
      const cleaned = title
        .replace(/\|.*$/, '')
        .replace(/–.*$/, '')
        .replace(/[-—|·].*$/, '')
        .replace(/\b\d{4}\b/g, '')
        .trim();

      if (cleaned.length < 10 || cleaned.length > 100) continue;
      if (existingSet.has(cleaned.toLowerCase())) continue;
      if (seen.has(cleaned.toLowerCase())) continue;

      seen.add(cleaned.toLowerCase());
      const sourceUrl = typeof result.link === 'string' && result.link.startsWith('http') ? result.link : '';
      gaps.push({
        keyword: cleaned,
        competitorDomain: cleanDomain,
        sourceTitle: title,
        sourceUrl,
        // AGENTS.md rule: never fake metrics. Callers hydrate real volumes
        // from DataForSEO `keyword_overview/live` before showing to the user.
        estimatedVolume: 0,
      });
    }

    for (const q of relatedFromSite) {
      if (!q || q.length < 5) continue;
      if (existingSet.has(q.toLowerCase()) || seen.has(q.toLowerCase())) continue;
      seen.add(q.toLowerCase());
      gaps.push({
        keyword: q,
        competitorDomain: cleanDomain,
        sourceTitle: `Related search (${cleanDomain})`,
        sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
        estimatedVolume: 0,
      });
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return gaps.slice(0, 60);
}
