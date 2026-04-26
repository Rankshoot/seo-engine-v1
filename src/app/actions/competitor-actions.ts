'use server';

/**
 * Server actions for the Competitor Benchmarking Engine.
 *
 *   • `runCompetitorBenchmark` — full pipeline (discover → scrape → extract →
 *     benchmark → score). Persists into `competitors`, `competitor_keywords`,
 *     `keyword_gaps`. Returns a trace so the client can `console.log` it for
 *     debugging (same pattern as `discoverKeywords` in keyword-actions.ts).
 *
 *   • `getCompetitorBenchmark` — hydrate all three tables for the project.
 *     Keeps the UI free of direct Supabase calls.
 *
 *   • `generateBlogFromOpportunity` — one-click "Generate blog" from a gap
 *     row: upserts the keyword into the `keywords` table, approves it, and
 *     creates a `calendar_entries` row so the existing content pipeline runs
 *     as-is. Returns the entry id so the UI can deep-link to the calendar.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import {
  benchmarkContentQuality,
  classifyGap,
  competitorWeaknessFromSnapshot,
  discoverCompetitors,
  extractCompetitorContent,
  extractKeywordsFromContent,
  findCompetitorPages,
  scoreOpportunity,
  type BenchmarkTraceEntry,
} from '@/lib/competitor-benchmark';
import { fetchKeywordVitals } from '@/lib/dataforseo';
import { getBusinessBrief } from '@/app/actions/brief-actions';
import type {
  BenchmarkAverages,
  Competitor,
  CompetitorKeyword,
  CompetitorPageSnapshot,
  KeywordGap,
  Project,
  ProjectCompetitor,
} from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function toTitleCase(text: string): string {
  return text
    .split(' ')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Run the full benchmark pipeline
// ─────────────────────────────────────────────────────────────────────────────

export interface RunBenchmarkResult {
  success: boolean;
  error?: string;
  competitorsFound?: number;
  pagesScraped?: number;
  keywordsExtracted?: number;
  gapsFound?: number;
  averages?: BenchmarkAverages | null;
  trace?: BenchmarkTraceEntry[];
}

export async function runCompetitorBenchmark(projectId: string): Promise<RunBenchmarkResult> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: projectRow, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*, project_competitors(*)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !projectRow) return { success: false, error: 'Project not found' };
  const project = projectRow as Project & { project_competitors?: ProjectCompetitor[] };

  const trace: BenchmarkTraceEntry[] = [];

  // 1a. Seeds come from the Business Brief (same source the keyword-discovery
  //     pipeline uses — keeps competitor signals aligned with what we already
  //     know about the business).
  const briefRes = await getBusinessBrief(projectId);
  const seeds = briefRes.brief?.seed_phrases?.length
    ? briefRes.brief.seed_phrases
    : [project.niche, `best ${project.niche}`, `${project.niche} for ${project.target_audience}`];

  trace.push({
    label: 'seeds',
    ok: true,
    info: { seed_count: seeds.length, source: briefRes.brief ? 'business_brief' : 'fallback' },
  });

  // 1b. Discover competitors.
  const knownDomains = (project.project_competitors ?? []).map(c => c.domain);
  const competitors = await discoverCompetitors(seeds, {
    region: project.target_region,
    language: project.target_language,
    ownDomain: project.domain,
    seedKnownDomains: knownDomains,
    maxSeeds: 6,
    maxCompetitors: 8,
    trace,
  });

  if (!competitors.length) {
    return {
      success: false,
      error: 'No competitors found. Add a few competitor domains on the project overview and try again.',
      trace,
    };
  }

  // 1c. For each competitor → find top pages → scrape → extract keywords.
  const persistedCompetitors: Array<{
    id: string;
    domain: string;
    pages: CompetitorPageSnapshot[];
    extracted: Array<{ keyword: string; kind: 'primary' | 'longtail' | 'question'; source_url: string; source_title: string }>;
  }> = [];

  const allPages: CompetitorPageSnapshot[] = [];
  let keywordsExtracted = 0;

  for (const comp of competitors) {
    const pages = await findCompetitorPages(comp.domain, project.niche, {
      region: project.target_region,
      language: project.target_language,
      max: 3,
      trace,
    });

    const topPagesList = pages.length > 0 ? pages : [{ url: comp.top_url, title: comp.top_title }];

    const scraped: CompetitorPageSnapshot[] = [];
    const extracted: typeof persistedCompetitors[number]['extracted'] = [];

    for (const p of topPagesList.slice(0, 3)) {
      if (!p.url) continue;
      const { snapshot, markdown } = await extractCompetitorContent(p.url, { trace });
      if (!snapshot) continue;
      scraped.push(snapshot);

      const kw = await extractKeywordsFromContent(markdown, {
        niche: project.niche,
        title: snapshot.title,
        trace,
      });

      for (const phrase of kw.primary)
        extracted.push({ keyword: phrase, kind: 'primary', source_url: snapshot.url, source_title: snapshot.title });
      for (const phrase of kw.longtail)
        extracted.push({ keyword: phrase, kind: 'longtail', source_url: snapshot.url, source_title: snapshot.title });
      for (const phrase of kw.questions)
        extracted.push({ keyword: phrase, kind: 'question', source_url: snapshot.url, source_title: snapshot.title });
    }

    if (!scraped.length) {
      // Still record the competitor so the UI shows what we tried to benchmark.
      scraped.push({
        url: comp.top_url,
        title: comp.top_title,
        h1: '',
        h2_count: 0,
        h3_count: 0,
        word_count: 0,
        image_count: 0,
        internal_link_count: 0,
        external_link_count: 0,
        has_faq: false,
      });
    }

    const compAverages = benchmarkContentQuality(scraped.filter(p => p.word_count > 0));

    const compRow = {
      project_id: projectId,
      domain: comp.domain,
      title: comp.top_title.slice(0, 300),
      rank_score: comp.rank_score,
      pages_scraped: scraped.filter(p => p.word_count > 0).length,
      avg_word_count: compAverages.avg_word_count,
      avg_h2: compAverages.avg_h2,
      avg_h3: compAverages.avg_h3,
      avg_images: compAverages.avg_images,
      avg_internal_links: compAverages.avg_internal_links,
      avg_external_links: compAverages.avg_external_links,
      faq_pages_pct: compAverages.faq_pages_pct,
      top_pages: scraped,
      recommendations: compAverages.recommendations,
      last_benchmarked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: upserted, error: upErr } = await supabaseAdmin
      .from('competitors')
      .upsert(compRow, { onConflict: 'project_id,domain' })
      .select('id, domain')
      .single();

    if (upErr || !upserted) {
      trace.push({ label: `competitor_upsert: ${comp.domain}`, ok: false, error: upErr?.message ?? 'no row' });
      continue;
    }

    persistedCompetitors.push({
      id: upserted.id as string,
      domain: comp.domain,
      pages: scraped,
      extracted,
    });

    for (const p of scraped.filter(s => s.word_count > 0)) allPages.push(p);
    keywordsExtracted += extracted.length;

    // Polite pacing between competitors so we don't bury Serper/Jina/Gemini.
    await new Promise(r => setTimeout(r, 350));
  }

  // 1d. Replace competitor_keywords rows for this project atomically.
  await supabaseAdmin.from('competitor_keywords').delete().eq('project_id', projectId);
  const ckRows: Array<Record<string, unknown>> = [];
  for (const c of persistedCompetitors) {
    const seen = new Set<string>();
    for (const e of c.extracted) {
      const key = `${e.keyword}|${e.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ckRows.push({
        competitor_id: c.id,
        project_id: projectId,
        keyword: e.keyword,
        kind: e.kind,
        freq: 1,
        source_url: e.source_url,
        source_title: e.source_title,
      });
    }
  }
  if (ckRows.length) {
    const { error: ckErr } = await supabaseAdmin.from('competitor_keywords').insert(ckRows);
    if (ckErr) trace.push({ label: 'competitor_keywords_insert', ok: false, error: ckErr.message });
  }

  // 1e. Pull user's existing keywords to classify gaps.
  const { data: userKwRows } = await supabaseAdmin
    .from('keywords')
    .select('keyword, status')
    .eq('project_id', projectId);
  const userKwIndex = new Map<string, { status: string }>(
    (userKwRows ?? []).map(r => [r.keyword.toLowerCase(), { status: r.status as string }])
  );

  // 1f. Build gap candidates: every competitor keyword the user doesn't
  //     already have approved (weak/missing/untapped).
  const gapCandidates = new Map<
    string,
    {
      gap_type: 'missing' | 'weak' | 'untapped';
      top_competitor_domain: string;
      top_competitor_url: string;
      weakness: number;
    }
  >();

  for (const c of persistedCompetitors) {
    for (const e of c.extracted) {
      const norm = e.keyword.toLowerCase();
      if (gapCandidates.has(norm)) continue;
      const gapType = classifyGap(norm, userKwIndex);
      // Pick the weakest competitor page backing this keyword so the opportunity
      // score reflects a realistically beatable target.
      const pageSnapshot = c.pages.find(p => p.url === e.source_url);
      const weakness = pageSnapshot ? competitorWeaknessFromSnapshot(pageSnapshot) : 50;
      gapCandidates.set(norm, {
        gap_type: gapType,
        top_competitor_domain: c.domain,
        top_competitor_url: e.source_url,
        weakness,
      });
    }
  }

  // 1g. Hydrate real volumes + trend via DataForSEO. Covers up to 700 kws
  //     in one API call, so we send them all.
  const vitals = await fetchKeywordVitals(
    [...gapCandidates.keys()],
    project.target_region,
    project.target_language
  );
  trace.push({
    label: 'dataforseo_vitals',
    ok: true,
    info: { requested: gapCandidates.size, hydrated: vitals.size },
  });

  // 1h. Score + persist keyword_gaps (replace strategy keeps the table lean).
  await supabaseAdmin.from('keyword_gaps').delete().eq('project_id', projectId);

  const gapRows = [...gapCandidates.entries()].map(([norm, meta]) => {
    const v = vitals.get(norm);
    const volume = v?.volume ?? 0;
    const trend = v?.trend ?? '+0%';
    const trend_pct = v?.trend_pct ?? 0;
    const kd = 0;
    const opportunity_score = scoreOpportunity({
      volume,
      kd,
      trend_pct,
      competitor_weakness: meta.weakness,
      gap_type: meta.gap_type,
    });
    const reasoning = buildGapReasoning(meta.gap_type, volume, meta.weakness, trend_pct);
    return {
      project_id: projectId,
      keyword: norm,
      gap_type: meta.gap_type,
      opportunity_score,
      volume,
      kd,
      trend,
      trend_pct,
      competitor_weakness: meta.weakness,
      top_competitor_domain: meta.top_competitor_domain,
      top_competitor_url: meta.top_competitor_url,
      reasoning,
      updated_at: new Date().toISOString(),
    };
  });

  // Rank and cap at 120 rows — the UI only paginates 120 deep anyway.
  gapRows.sort((a, b) => b.opportunity_score - a.opportunity_score);
  const topGapRows = gapRows.slice(0, 120);

  if (topGapRows.length) {
    const { error: gapErr } = await supabaseAdmin
      .from('keyword_gaps')
      .upsert(topGapRows, { onConflict: 'project_id,keyword' });
    if (gapErr) trace.push({ label: 'keyword_gaps_upsert', ok: false, error: gapErr.message });
  }

  const averages = benchmarkContentQuality(allPages);

  return {
    success: true,
    competitorsFound: persistedCompetitors.length,
    pagesScraped: allPages.length,
    keywordsExtracted,
    gapsFound: topGapRows.length,
    averages,
    trace,
  };
}

function buildGapReasoning(
  gapType: 'missing' | 'weak' | 'untapped',
  volume: number,
  weakness: number,
  trendPct: number
): string {
  const bits: string[] = [];
  if (gapType === 'missing') bits.push("You don't cover this keyword yet.");
  else if (gapType === 'weak') bits.push('You have this keyword in your list but it is not approved yet.');
  else bits.push("You're approved for this but competitors still out-rank.");

  if (volume > 0) bits.push(`${volume.toLocaleString()} searches/mo.`);
  if (weakness >= 60) bits.push('Competitor content is thin — an easy one to beat.');
  else if (weakness >= 35) bits.push('Competitor content is moderate — beatable with depth.');
  else bits.push('Competitor content is strong — plan a deeper, more original piece.');
  if (trendPct > 20) bits.push('Demand trending up.');
  else if (trendPct < -20) bits.push('Demand trending down.');

  return bits.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Hydrate benchmark state for the UI
// ─────────────────────────────────────────────────────────────────────────────

export interface BenchmarkState {
  success: boolean;
  error?: string;
  competitors: Competitor[];
  competitorKeywords: CompetitorKeyword[];
  gaps: KeywordGap[];
  averages: BenchmarkAverages;
  lastBenchmarkedAt: string | null;
}

export async function getCompetitorBenchmark(projectId: string): Promise<BenchmarkState> {
  const empty: BenchmarkState = {
    success: false,
    competitors: [],
    competitorKeywords: [],
    gaps: [],
    averages: {
      avg_word_count: 0,
      avg_h2: 0,
      avg_h3: 0,
      avg_images: 0,
      avg_internal_links: 0,
      avg_external_links: 0,
      faq_pages_pct: 0,
      pages_analyzed: 0,
      recommendations: [],
    },
    lastBenchmarkedAt: null,
  };

  const user = await currentUser();
  if (!user) return { ...empty, error: 'Not authenticated' };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (pErr || !project) return { ...empty, error: 'Project not found' };

  const [
    { data: competitorsRows },
    { data: ckRows },
    { data: gapRows },
  ] = await Promise.all([
    supabaseAdmin
      .from('competitors')
      .select('*')
      .eq('project_id', projectId)
      .order('rank_score', { ascending: false }),
    supabaseAdmin
      .from('competitor_keywords')
      .select('*')
      .eq('project_id', projectId)
      .limit(1000),
    supabaseAdmin
      .from('keyword_gaps')
      .select('*')
      .eq('project_id', projectId)
      .order('opportunity_score', { ascending: false })
      .limit(200),
  ]);

  const competitors = (competitorsRows ?? []) as Competitor[];
  const allPages = competitors.flatMap(c => (c.top_pages ?? []).filter(p => p.word_count > 0));
  const averages = benchmarkContentQuality(allPages);

  const lastBenchmarkedAt = competitors.length
    ? competitors
        .map(c => c.last_benchmarked_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null
    : null;

  return {
    success: true,
    competitors,
    competitorKeywords: (ckRows ?? []) as CompetitorKeyword[],
    gaps: (gapRows ?? []) as KeywordGap[],
    averages,
    lastBenchmarkedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. One-click "Generate blog" from an opportunity row
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Spins up a scheduled calendar entry for a gap keyword. If the keyword
 * isn't already in the `keywords` table we insert it (status=approved, with
 * whatever volume/kd/trend the gap row has). Returns the new entry id so
 * the UI can navigate the user straight to the calendar.
 */
export async function generateBlogFromOpportunity(projectId: string, keyword: string) {
  const user = await currentUser();
  if (!user) return { success: false as const, error: 'Not authenticated' };

  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return { success: false as const, error: 'Missing keyword.' };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (pErr || !project) return { success: false as const, error: 'Project not found' };

  // Pull the gap row so we can carry forward volume / trend / source metadata.
  const { data: gap } = await supabaseAdmin
    .from('keyword_gaps')
    .select('*')
    .eq('project_id', projectId)
    .eq('keyword', normalized)
    .maybeSingle();

  // 1. Upsert into keywords (status=approved). Reuses the existing unique
  //    constraint on (project_id, keyword) — we never duplicate rows.
  const { data: kwRow, error: kwErr } = await supabaseAdmin
    .from('keywords')
    .upsert(
      {
        project_id: projectId,
        keyword: normalized,
        volume: gap?.volume ?? 0,
        kd: gap?.kd ?? 0,
        trend: gap?.trend ?? '+0%',
        status: 'approved',
        source_url: gap?.top_competitor_url ?? '',
        gap_competitor: gap?.top_competitor_domain ?? '',
        ai_score: gap?.opportunity_score ?? 0,
        keyword_analysis_score: gap?.opportunity_score ?? 0,
      },
      { onConflict: 'project_id,keyword', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (kwErr || !kwRow) return { success: false as const, error: kwErr?.message ?? 'Failed to save keyword.' };

  // 2. Create a scheduled calendar entry (tomorrow, local date). Existing
  //    calendar page picks it up and the "Generate" button on that row runs
  //    the same blog-generation pipeline we already use.
  const scheduledDate = new Date();
  scheduledDate.setDate(scheduledDate.getDate() + 1);
  const dateStr = scheduledDate.toISOString().split('T')[0];
  const slugBase = slugify(normalized) || `opportunity-${Date.now().toString(36)}`;

  const { data: entryRow, error: entryErr } = await supabaseAdmin
    .from('calendar_entries')
    .insert({
      project_id: projectId,
      keyword_id: kwRow.id,
      scheduled_date: dateStr,
      title: toTitleCase(normalized),
      article_type: 'How-to Guide',
      slug: `${slugBase}-${Date.now().toString(36)}`,
      focus_keyword: normalized,
      secondary_keywords: [],
      status: 'scheduled',
    })
    .select('id')
    .single();

  if (entryErr || !entryRow) {
    return { success: false as const, error: entryErr?.message ?? 'Failed to create calendar entry.' };
  }

  return { success: true as const, entryId: entryRow.id as string, keywordId: kwRow.id as string };
}
