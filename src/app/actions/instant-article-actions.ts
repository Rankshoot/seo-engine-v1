'use server';

import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { researchKeyword } from '@/lib/research';
import { generateInstantWebResearchArticle, suggestInstantArticleTopicAndKeywords } from '@/lib/gemini';
import { sanitizeBlogContent, countWordsInMarkdown } from '@/lib/blog-content';
import type { BusinessBrief } from '@/lib/business-brief';
import type { Blog } from '@/lib/types';
import { TARGET_REGIONS } from '@/lib/types';

export type InstantArticleTraceEntry = {
  step: string;
  detail?: string;
  ms?: number;
};

/**
 * Ask AI — Gemini suggests a topic + 4 keywords for the Instant Article form (no Serper).
 */
export async function suggestInstantArticleTopicAction(
  projectId: string,
  payload: { region: string; language: string }
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

  const t0 = Date.now();
  try {
    const { topic, keywords } = await suggestInstantArticleTopicAndKeywords({
      company: String(project.company ?? '').trim() || 'Company',
      niche: String(project.niche ?? '').trim() || 'General',
      domain: String(project.domain ?? '').trim() || '',
      targetAudience: String(project.target_audience ?? '').trim() || 'General audience',
      regionLabel: regionName,
      languageLabel,
      briefSummary: brief?.summary?.trim() ?? null,
      seedPhrases: brief?.seed_phrases ?? [],
    });
    mark('gemini', `topic + 4 keywords`, Date.now() - t0);
    return {
      success: true,
      topic,
      keywords: keywords.join(', '),
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
 * Instant Article — AI Web Research path: Serper context + Gemini (Google Search tool) + blog row (no calendar entry).
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
      articleTypeLabel: payload.articleTypeLabel,
      optionalKeywordsCsv: payload.keywords,
      research,
      brief,
      existingBlogs,
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
