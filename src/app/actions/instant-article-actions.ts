'use server';

import { randomInt } from 'node:crypto';
import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { researchKeyword } from '@/lib/research';
import { generateInstantWebResearchArticle, suggestInstantArticleKeywordAndTopic } from '@/lib/gemini';
import { sanitizeBlogContent, countWordsInMarkdown } from '@/lib/blog-content';
import type { BusinessBrief } from '@/lib/business-brief';
import type { Blog } from '@/lib/types';
import { TARGET_REGIONS } from '@/lib/types';
import { ingestInstantArticleCustomSources, type InstantCustomRefPayload } from '@/lib/instant-custom-sources';

export type { InstantCustomRefPayload } from '@/lib/instant-custom-sources';

const INSTANT_ASK_AI_ANGLE_HINTS = [
  'Pick a how-to or step-by-step question real searchers ask in this space.',
  'Pick a vs / alternatives / best-tools comparison angle.',
  'Pick a cost, pricing, or ROI angle when it fits the niche.',
  'Pick a common mistakes, pitfalls, or myths-to-avoid angle.',
  'Pick a checklist, template, or framework angle.',
  'Pick a getting-started or beginner guide angle.',
  'Pick a use case aimed at a specific role or company size (e.g. startup vs enterprise).',
  'Pick a benefits, outcomes, or why-it-matters angle.',
  'Pick a definition / what-is / deep-dive explainer angle.',
  'Pick a planning, strategy, or roadmap angle (still concrete, not vague thought leadership).',
] as const;

export type InstantArticleTraceEntry = {
  step: string;
  detail?: string;
  ms?: number;
};

/**
 * Ask AI — one keyword anchored to the project's website domain, then a topic for that keyword (no Serper).
 */
export async function suggestInstantArticleTopicAction(
  projectId: string,
  payload: { region: string; language: string; avoidKeywordsCsv?: string }
): Promise<
  | { success: true; topic: string; keywords: string; suggestTrace: InstantArticleTraceEntry[] }
  | { success: false; error: string; suggestTrace: InstantArticleTraceEntry[] }
> {
  const trace: InstantArticleTraceEntry[] = [];
  const mark = (step: string, detail?: string, ms?: number) => {
    trace.push({ step, detail, ms });
  };

  const user = await currentUser();
  if (!user) {
    mark('auth', 'skipped — not signed in');
    return { success: false, error: 'Not authenticated', suggestTrace: trace };
  }

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) {
    mark('project', 'not found or unauthorized');
    return { success: false, error: 'Project not found', suggestTrace: trace };
  }

  const domain = String(project.domain ?? '').trim();
  if (!domain) {
    mark('domain', 'missing — need website domain on project');
    return {
      success: false,
      error: 'Add your website domain on the project (Basic info) so Ask AI can suggest a relevant keyword.',
      suggestTrace: trace,
    };
  }

  let brief: BusinessBrief | null = null;
  try {
    const { data: briefRow } = await supabaseAdmin
      .from('project_briefs')
      .select('brief')
      .eq('project_id', projectId)
      .maybeSingle();
    brief = (briefRow?.brief as BusinessBrief | undefined) ?? null;
    mark('brief', brief ? 'loaded' : 'none');
  } catch {
    mark('brief', 'load failed');
  }

  const regionName = TARGET_REGIONS.find(r => r.code === payload.region)?.name ?? payload.region;
  const langLabels: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    de: 'German',
    fr: 'French',
    hi: 'Hindi',
  };
  const languageLabel = langLabels[payload.language] ?? payload.language;

  const avoidPhrases = (payload.avoidKeywordsCsv ?? '')
    .split(/[,;\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 2)
    .slice(0, 10);

  const rotationHint =
    INSTANT_ASK_AI_ANGLE_HINTS[randomInt(0, INSTANT_ASK_AI_ANGLE_HINTS.length - 1)];

  const t0 = Date.now();
  try {
    const { topic, keyword } = await suggestInstantArticleKeywordAndTopic({
      company: String(project.company ?? '').trim() || 'Company',
      niche: String(project.niche ?? '').trim() || 'General',
      domain,
      targetAudience: String(project.target_audience ?? '').trim() || 'General audience',
      regionLabel: regionName,
      languageLabel,
      briefSummary: brief?.summary?.trim() ?? null,
      seedPhrases: brief?.seed_phrases ?? [],
      rotationHint,
      avoidPhrases,
    });
    mark('gemini', `domain keyword + topic`, Date.now() - t0);
    return {
      success: true,
      topic,
      keywords: keyword,
      suggestTrace: trace,
    };
  } catch (e) {
    mark('gemini', `failed: ${e instanceof Error ? e.message : String(e)}`, Date.now() - t0);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Could not suggest a topic',
      suggestTrace: trace,
    };
  }
}

function derivePrimaryKeyword(topic: string, keywordsCsv: string): string {
  const fromCsv = keywordsCsv
    .split(/[,;\n]/)
    .map(k => k.trim())
    .find(k => k.length > 0);
  if (fromCsv) return fromCsv.slice(0, 120);
  const t = topic.trim();
  if (t.length <= 100) return t;
  return t.slice(0, 100).trim();
}

/**
 * Instant Article: Serper context + Gemini (Google Search tool) + optional user references (PDF/DOCX/links via Jina) → `blogs` row (no calendar entry).
 */
export async function generateInstantWebResearchArticleAction(
  projectId: string,
  payload: {
    topic: string;
    region: string;
    language: string;
    writingStyle: string;
    writingStyleLabel: string;
    keywords: string;
    articleType: string;
    articleTypeLabel: string;
    researchMethod: 'web' | 'custom';
    customReferences?: InstantCustomRefPayload[];
  }
): Promise<
  | { success: true; data: Blog; instantArticleTrace: InstantArticleTraceEntry[] }
  | { success: false; error: string; instantArticleTrace: InstantArticleTraceEntry[] }
> {
  const trace: InstantArticleTraceEntry[] = [];
  const mark = (step: string, detail?: string, ms?: number) => {
    trace.push({ step, detail, ms });
  };

  const user = await currentUser();
  if (!user) {
    mark('auth', 'skipped — not signed in');
    return { success: false, error: 'Not authenticated', instantArticleTrace: trace };
  }

  const topic = payload.topic?.trim() ?? '';
  if (!topic) {
    mark('validate', 'empty topic');
    return { success: false, error: 'Topic is required', instantArticleTrace: trace };
  }
  if (!payload.writingStyle?.trim()) {
    mark('validate', 'writing style not set');
    return { success: false, error: 'Select a writing style', instantArticleTrace: trace };
  }

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) {
    mark('project', 'not found or unauthorized');
    return { success: false, error: 'Project not found', instantArticleTrace: trace };
  }

  const primaryKeyword = derivePrimaryKeyword(topic, payload.keywords);
  mark('keyword', `primary research query: "${primaryKeyword.slice(0, 80)}${primaryKeyword.length > 80 ? '…' : ''}"`);

  const researchMethod = payload.researchMethod === 'custom' ? 'custom' : 'web';
  let customSourcesMarkdown = '';
  let customSourceIngestCount = 0;

  if (researchMethod === 'custom') {
    const refs = payload.customReferences ?? [];
    if (!refs.length) {
      mark('custom_refs', 'none supplied');
      return {
        success: false,
        error: 'Add at least one file or link in Custom Sources, or switch to AI Web Research.',
        instantArticleTrace: trace,
      };
    }
    const tIn = Date.now();
    try {
      const ingested = await ingestInstantArticleCustomSources(refs);
      ingested.details.forEach(d => mark('custom_refs', d));
      customSourcesMarkdown = ingested.combinedBlock;
      customSourceIngestCount = ingested.okCount;
      mark('custom_refs', `ingested ${ingested.okCount} source(s)`, Date.now() - tIn);
    } catch (e) {
      mark('custom_refs', `ingest error: ${e instanceof Error ? e.message : String(e)}`, Date.now() - tIn);
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Could not read custom references',
        instantArticleTrace: trace,
      };
    }
    if (!customSourcesMarkdown.trim() || customSourceIngestCount === 0) {
      return {
        success: false,
        error:
          'Could not extract text from your references. Check that links are public (https) and files are text-based PDF or DOCX.',
        instantArticleTrace: trace,
      };
    }
  }

  let research;
  const t0 = Date.now();
  try {
    research = await researchKeyword(primaryKeyword, payload.region || 'us', payload.language || 'en');
    mark(
      'serper',
      `context: ${research.totalSourcesFound} sources (organic + PAA + videos + news) for "${research.keyword}"`,
      Date.now() - t0
    );
  } catch (e) {
    mark('serper', `failed: ${e instanceof Error ? e.message : String(e)}`, Date.now() - t0);
    return {
      success: false,
      error: 'Research step failed. Check SERPER_API_KEY and try again.',
      instantArticleTrace: trace,
    };
  }

  let brief: BusinessBrief | null = null;
  try {
    const { data: briefRow } = await supabaseAdmin
      .from('project_briefs')
      .select('brief')
      .eq('project_id', projectId)
      .maybeSingle();
    brief = (briefRow?.brief as BusinessBrief | undefined) ?? null;
    mark('brief', brief ? 'loaded project_briefs row' : 'no brief cached');
  } catch {
    mark('brief', 'load skipped / failed');
  }

  let existingBlogs: { title: string; slug: string; target_keyword: string }[] = [];
  try {
    const { data: blogs } = await supabaseAdmin
      .from('blogs')
      .select('title, slug, target_keyword')
      .eq('project_id', projectId)
      .in('status', ['generated', 'approved', 'published'])
      .limit(15);
    existingBlogs = blogs ?? [];
    mark('blogs', `internal link context: ${existingBlogs.length} prior posts`);
  } catch {
    mark('blogs', 'could not load existing blogs');
  }

  const regionName = TARGET_REGIONS.find(r => r.code === payload.region)?.name ?? payload.region;
  const langLabels: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    de: 'German',
    fr: 'French',
    hi: 'Hindi',
  };
  const languageLabel = langLabels[payload.language] ?? payload.language;

  let blogData;
  const t1 = Date.now();
  try {
    blogData = await generateInstantWebResearchArticle({
      project,
      topic,
      primaryKeyword,
      regionName,
      languageLabel,
      writingStyleLabel: payload.writingStyleLabel,
      articleType: payload.articleType,
      articleTypeLabel: payload.articleTypeLabel,
      optionalKeywordsCsv: payload.keywords,
      research,
      brief,
      existingBlogs,
      customSourcesMarkdown: customSourcesMarkdown || null,
      researchMethod,
      customSourceIngestCount,
    });
    mark('gemini', `draft parsed — ${blogData.word_count} words (pre-sanitize)`, Date.now() - t1);
  } catch (e) {
    mark('gemini', `failed: ${e instanceof Error ? e.message : String(e)}`, Date.now() - t1);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Generation failed',
      instantArticleTrace: trace,
    };
  }

  const sanitized = await sanitizeBlogContent(blogData.content, {
    ownDomain: project.domain ?? '',
  });
  if (sanitized.removedLinks.length) {
    mark('sanitize', `dropped ${sanitized.removedLinks.length} dead external link(s)`);
  } else {
    mark('sanitize', 'external links probed — no removals');
  }

  const finalContent = sanitized.content;
  const finalWordCount = countWordsInMarkdown(finalContent);

  const articleTypeTag = `Instant · ${payload.articleTypeLabel}`;

  const { data: row, error: insErr } = await supabaseAdmin
    .from('blogs')
    .insert({
      entry_id: null,
      project_id: projectId,
      title: blogData.title,
      content: finalContent,
      meta_description: blogData.meta_description,
      slug: blogData.slug,
      word_count: finalWordCount,
      target_keyword: primaryKeyword,
      article_type: articleTypeTag,
      status: 'generated',
      research_sources: blogData.research_sources,
      external_links: sanitized.externalLinks.slice(0, 10),
      internal_links: sanitized.internalLinks.slice(0, 12),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insErr || !row) {
    mark('db', `insert failed: ${insErr?.message ?? 'unknown'}`);
    return {
      success: false,
      error: insErr?.message ?? 'Could not save article',
      instantArticleTrace: trace,
    };
  }

  mark('db', `blog id ${row.id}`);
  return { success: true, data: row as Blog, instantArticleTrace: trace };
}
