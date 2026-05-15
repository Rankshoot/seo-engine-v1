'use server';

import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  generateEbook,
  generateWhitepaper,
  generateLinkedInPost,
  suggestContentTopicWithFlash,
} from '@/lib/content-studio';
import { researchKeyword } from '@/lib/research';
import { sanitizeBlogContent } from '@/lib/blog-content';
import type { BusinessBrief } from '@/lib/business-brief';
import { TARGET_REGIONS } from '@/lib/types';
import type {
  Blog,
  ContentType,
  EbookContentData,
  LinkedInContentData,
  LinkedInPostStyle,
  WhitepaperContentData,
} from '@/lib/types';
import type { ResearchContext } from '@/lib/research';

// ─── Trace shape (matches existing keyword-actions / instant-article patterns) ─────

export type ContentGenerationTraceEntry = {
  step: string;
  detail?: string;
  ms?: number;
};

interface ProjectRow {
  id: string;
  user_id: string;
  domain: string;
  company: string;
  niche: string;
  target_audience: string;
  target_region: string;
  target_language: string;
}

const LANG_LABEL: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  de: 'German',
  fr: 'French',
  hi: 'Hindi',
  pt: 'Portuguese',
  it: 'Italian',
};

async function loadProjectAndBrief(projectId: string, userId: string): Promise<
  | { ok: true; project: ProjectRow; brief: BusinessBrief | null }
  | { ok: false; error: string }
> {
  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();
  if (pErr || !project) return { ok: false, error: 'Project not found' };

  let brief: BusinessBrief | null = null;
  try {
    const { data: briefRow } = await supabaseAdmin
      .from('project_briefs')
      .select('brief')
      .eq('project_id', projectId)
      .maybeSingle();
    brief = (briefRow?.brief as BusinessBrief | undefined) ?? null;
  } catch {
    /* optional */
  }

  return { ok: true, project: project as ProjectRow, brief };
}

async function loadInternalLinkPool(
  projectId: string,
  brief: BusinessBrief | null,
  domain: string,
): Promise<string[]> {
  const fromBrief = (brief?.internal_link_candidates ?? [])
    .map(l => l.url)
    .filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
  const fromBriefBlogs = (brief?.blog_urls ?? []).filter(u => u.startsWith('http'));
  let fromBlogs: string[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('blogs')
      .select('slug')
      .eq('project_id', projectId)
      .in('status', ['generated', 'approved', 'published'])
      .limit(20);
    fromBlogs = (data ?? [])
      .map(r => (typeof r.slug === 'string' && r.slug.trim() ? `https://${domain}/${r.slug}` : null))
      .filter((u): u is string => Boolean(u));
  } catch {
    /* optional */
  }
  return Array.from(new Set([...fromBrief, ...fromBriefBlogs, ...fromBlogs])).slice(0, 30);
}

async function loadApprovedKeywords(projectId: string): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin
      .from('keywords')
      .select('keyword, ai_score, status')
      .eq('project_id', projectId)
      .eq('status', 'approved')
      .order('ai_score', { ascending: false })
      .limit(40);
    return (data ?? []).map(r => String(r.keyword)).filter(Boolean);
  } catch {
    return [];
  }
}

function regionLabel(code: string): string {
  return TARGET_REGIONS.find(r => r.code === code)?.name ?? code;
}

function languageLabel(code: string): string {
  return LANG_LABEL[code] ?? code;
}

// ─── Ask AI: topic suggestion (Flash) ──────────────────────────────────────

export async function suggestContentTopicAction(
  projectId: string,
  payload: {
    contentType: ContentType;
    avoidPhrases?: string[];
  }
): Promise<
  | { success: true; topic: string; primary_keyword: string; semantic_keywords: string[]; rationale: string }
  | { success: false; error: string }
> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const projRes = await loadProjectAndBrief(projectId, user.id);
  if (!projRes.ok) return { success: false, error: projRes.error };
  const { project, brief } = projRes;

  const approved = await loadApprovedKeywords(projectId);
  const labelMap: Record<ContentType, string> = {
    blog: 'blog article',
    ebook: 'ebook',
    whitepaper: 'whitepaper',
    linkedin: 'LinkedIn post',
  };

  try {
    const suggestion = await suggestContentTopicWithFlash({
      contentTypeLabel: labelMap[payload.contentType],
      niche: project.niche || 'general',
      audience: project.target_audience || 'general audience',
      domain: project.domain,
      briefSummary: brief?.summary ?? null,
      approvedKeywords: approved,
      avoidPhrases: (payload.avoidPhrases ?? []).slice(0, 6),
    });
    return { success: true, ...suggestion };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Could not generate suggestion' };
  }
}

// ─── Ebook generation ──────────────────────────────────────────────────────

export async function generateEbookAction(
  projectId: string,
  payload: {
    topic: string;
    primaryKeyword: string;
    secondaryKeywords?: string[];
    audience: string;
    tone: string;
    goal: string;
    ctaObjective: string;
    chapterDepth: 'concise' | 'standard' | 'deep';
    region?: string;
    language?: string;
    semanticKeywords?: string[];
    skipResearch?: boolean;
  }
): Promise<
  | { success: true; data: Blog; trace: ContentGenerationTraceEntry[] }
  | { success: false; error: string; trace: ContentGenerationTraceEntry[] }
> {
  const trace: ContentGenerationTraceEntry[] = [];
  const mark = (step: string, detail?: string, ms?: number) => trace.push({ step, detail, ms });

  const user = await currentUser();
  if (!user) {
    mark('auth', 'not signed in');
    return { success: false, error: 'Not authenticated', trace };
  }

  if (!payload.topic?.trim()) {
    return { success: false, error: 'Topic is required', trace };
  }
  if (!payload.primaryKeyword?.trim()) {
    return { success: false, error: 'Primary keyword is required', trace };
  }

  const projRes = await loadProjectAndBrief(projectId, user.id);
  if (!projRes.ok) {
    mark('project', projRes.error);
    return { success: false, error: projRes.error, trace };
  }
  const { project, brief } = projRes;
  mark('project', `${project.company} (${project.domain})`);

  const region = payload.region || project.target_region || 'us';
  const language = payload.language || project.target_language || 'en';

  let research: ResearchContext | null = null;
  if (!payload.skipResearch) {
    const t0 = Date.now();
    try {
      research = await researchKeyword(payload.primaryKeyword.trim(), region, language);
      mark('serper', `${research.totalSourcesFound} live sources`, Date.now() - t0);
    } catch (e) {
      mark('serper', `failed: ${e instanceof Error ? e.message : String(e)}`, Date.now() - t0);
    }
  } else {
    mark('serper', 'skipped (user opted out)');
  }

  const internalLinks = await loadInternalLinkPool(projectId, brief, project.domain);
  mark('links', `internal pool: ${internalLinks.length} URL${internalLinks.length === 1 ? '' : 's'}`);

  const t1 = Date.now();
  let result;
  try {
    result = await generateEbook(
      {
        topic: payload.topic.trim(),
        primaryKeyword: payload.primaryKeyword.trim(),
        secondaryKeywords: (payload.secondaryKeywords ?? []).slice(0, 12),
        audience: payload.audience,
        tone: payload.tone,
        goal: payload.goal,
        ctaObjective: payload.ctaObjective,
        chapterDepth: payload.chapterDepth,
        regionLabel: regionLabel(region),
        languageLabel: languageLabel(language),
        companyName: project.company,
        companyDomain: project.domain,
        niche: project.niche,
        brief,
        research,
        internalLinks,
        semanticKeywords: payload.semanticKeywords ?? [],
      },
      project.domain,
    );
    mark('gemini-pro', `${result.word_count} words drafted`, Date.now() - t1);
  } catch (e) {
    mark('gemini-pro', `failed: ${e instanceof Error ? e.message : String(e)}`, Date.now() - t1);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Ebook generation failed',
      trace,
    };
  }

  const sanitized = await sanitizeBlogContent(result.content, { ownDomain: project.domain });
  if (sanitized.removedLinks.length) {
    mark('sanitize', `dropped ${sanitized.removedLinks.length} dead external link(s)`);
  }

  const { data: row, error: insErr } = await supabaseAdmin
    .from('blogs')
    .insert({
      entry_id: null,
      project_id: projectId,
      title: result.title,
      content: sanitized.content,
      meta_description: result.meta_description,
      slug: result.slug,
      word_count: result.word_count,
      target_keyword: payload.primaryKeyword.trim(),
      article_type: 'Ebook',
      status: 'generated',
      research_sources: result.research_sources,
      external_links: sanitized.externalLinks.slice(0, 16),
      internal_links: sanitized.internalLinks.slice(0, 14),
      content_type: 'ebook',
      content_data: result.content_data,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insErr || !row) {
    mark('db', `insert failed: ${insErr?.message ?? 'unknown'}`);
    return { success: false, error: insErr?.message ?? 'Could not save ebook', trace };
  }

  mark('db', `ebook id ${row.id}`);
  return { success: true, data: row as Blog, trace };
}

// ─── Whitepaper generation ─────────────────────────────────────────────────

export async function generateWhitepaperAction(
  projectId: string,
  payload: {
    topic: string;
    industry: string;
    primaryKeyword: string;
    secondaryKeywords?: string[];
    audience: string;
    problemStatement: string;
    technicalDepth: 'executive' | 'analyst' | 'engineering';
    researchAngle: string;
    businessObjective: string;
    region?: string;
    language?: string;
    semanticKeywords?: string[];
    skipResearch?: boolean;
  }
): Promise<
  | { success: true; data: Blog; trace: ContentGenerationTraceEntry[] }
  | { success: false; error: string; trace: ContentGenerationTraceEntry[] }
> {
  const trace: ContentGenerationTraceEntry[] = [];
  const mark = (step: string, detail?: string, ms?: number) => trace.push({ step, detail, ms });

  const user = await currentUser();
  if (!user) {
    mark('auth', 'not signed in');
    return { success: false, error: 'Not authenticated', trace };
  }

  if (!payload.topic?.trim()) {
    return { success: false, error: 'Topic is required', trace };
  }
  if (!payload.primaryKeyword?.trim()) {
    return { success: false, error: 'Primary keyword is required', trace };
  }
  if (!payload.problemStatement?.trim()) {
    return { success: false, error: 'Problem statement is required', trace };
  }

  const projRes = await loadProjectAndBrief(projectId, user.id);
  if (!projRes.ok) return { success: false, error: projRes.error, trace };
  const { project, brief } = projRes;

  const region = payload.region || project.target_region || 'us';
  const language = payload.language || project.target_language || 'en';

  let research: ResearchContext | null = null;
  if (!payload.skipResearch) {
    const t0 = Date.now();
    try {
      research = await researchKeyword(payload.primaryKeyword.trim(), region, language);
      mark('serper', `${research.totalSourcesFound} live sources`, Date.now() - t0);
    } catch (e) {
      mark('serper', `failed: ${e instanceof Error ? e.message : String(e)}`, Date.now() - t0);
    }
  }

  const internalLinks = await loadInternalLinkPool(projectId, brief, project.domain);
  mark('links', `internal pool: ${internalLinks.length} URL${internalLinks.length === 1 ? '' : 's'}`);

  const t1 = Date.now();
  let result;
  try {
    result = await generateWhitepaper(
      {
        topic: payload.topic.trim(),
        industry: payload.industry || project.niche || 'general',
        primaryKeyword: payload.primaryKeyword.trim(),
        secondaryKeywords: (payload.secondaryKeywords ?? []).slice(0, 12),
        audience: payload.audience,
        problemStatement: payload.problemStatement.trim(),
        technicalDepth: payload.technicalDepth,
        researchAngle: payload.researchAngle,
        businessObjective: payload.businessObjective,
        regionLabel: regionLabel(region),
        languageLabel: languageLabel(language),
        companyName: project.company,
        companyDomain: project.domain,
        brief,
        research,
        internalLinks,
        semanticKeywords: payload.semanticKeywords ?? [],
      },
      project.domain,
    );
    mark('gemini-pro', `${result.word_count} words drafted`, Date.now() - t1);
  } catch (e) {
    mark('gemini-pro', `failed: ${e instanceof Error ? e.message : String(e)}`, Date.now() - t1);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Whitepaper generation failed',
      trace,
    };
  }

  const sanitized = await sanitizeBlogContent(result.content, { ownDomain: project.domain });
  if (sanitized.removedLinks.length) {
    mark('sanitize', `dropped ${sanitized.removedLinks.length} dead external link(s)`);
  }

  const { data: row, error: insErr } = await supabaseAdmin
    .from('blogs')
    .insert({
      entry_id: null,
      project_id: projectId,
      title: result.title,
      content: sanitized.content,
      meta_description: result.meta_description,
      slug: result.slug,
      word_count: result.word_count,
      target_keyword: payload.primaryKeyword.trim(),
      article_type: 'Whitepaper',
      status: 'generated',
      research_sources: result.research_sources,
      external_links: sanitized.externalLinks.slice(0, 18),
      internal_links: sanitized.internalLinks.slice(0, 14),
      content_type: 'whitepaper',
      content_data: result.content_data,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insErr || !row) {
    mark('db', `insert failed: ${insErr?.message ?? 'unknown'}`);
    return { success: false, error: insErr?.message ?? 'Could not save whitepaper', trace };
  }

  mark('db', `whitepaper id ${row.id}`);
  return { success: true, data: row as Blog, trace };
}

// ─── LinkedIn post generation ──────────────────────────────────────────────

export async function generateLinkedInPostAction(
  projectId: string,
  payload: {
    topic: string;
    primaryKeyword: string;
    audience: string;
    tone: string;
    postStyle: LinkedInPostStyle;
    voicePerspective: 'first_person' | 'company';
    authorRole?: string;
    ctaObjective: string;
    region?: string;
    language?: string;
  }
): Promise<
  | { success: true; data: Blog; trace: ContentGenerationTraceEntry[] }
  | { success: false; error: string; trace: ContentGenerationTraceEntry[] }
> {
  const trace: ContentGenerationTraceEntry[] = [];
  const mark = (step: string, detail?: string, ms?: number) => trace.push({ step, detail, ms });

  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', trace };

  if (!payload.topic?.trim()) return { success: false, error: 'Topic is required', trace };
  if (!payload.primaryKeyword?.trim()) return { success: false, error: 'Primary keyword is required', trace };

  const projRes = await loadProjectAndBrief(projectId, user.id);
  if (!projRes.ok) return { success: false, error: projRes.error, trace };
  const { project, brief } = projRes;

  const region = payload.region || project.target_region || 'us';
  const language = payload.language || project.target_language || 'en';

  const t1 = Date.now();
  let result;
  try {
    result = await generateLinkedInPost({
      topic: payload.topic.trim(),
      postStyle: payload.postStyle,
      audience: payload.audience,
      tone: payload.tone,
      primaryKeyword: payload.primaryKeyword.trim(),
      ctaObjective: payload.ctaObjective,
      voicePerspective: payload.voicePerspective,
      authorRole: payload.authorRole,
      regionLabel: regionLabel(region),
      languageLabel: languageLabel(language),
      companyName: project.company,
      companyDomain: project.domain,
      niche: project.niche,
      brief,
    });
    mark('gemini-pro', `${result.word_count} words drafted`, Date.now() - t1);
  } catch (e) {
    mark('gemini-pro', `failed: ${e instanceof Error ? e.message : String(e)}`, Date.now() - t1);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'LinkedIn post generation failed',
      trace,
    };
  }

  const { data: row, error: insErr } = await supabaseAdmin
    .from('blogs')
    .insert({
      entry_id: null,
      project_id: projectId,
      title: result.title,
      content: result.content,
      meta_description: result.meta_description,
      slug: result.slug,
      word_count: result.word_count,
      target_keyword: payload.primaryKeyword.trim(),
      article_type: 'LinkedIn',
      status: 'generated',
      research_sources: 0,
      external_links: [],
      internal_links: [],
      content_type: 'linkedin',
      content_data: result.content_data,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insErr || !row) {
    mark('db', `insert failed: ${insErr?.message ?? 'unknown'}`);
    return { success: false, error: insErr?.message ?? 'Could not save LinkedIn post', trace };
  }

  mark('db', `linkedin id ${row.id}`);
  return { success: true, data: row as Blog, trace };
}

// ─── Unified content history (filterable by type + status) ─────────────────

export interface ContentStudioHistoryRow {
  id: string;
  title: string;
  meta_description: string;
  target_keyword: string;
  article_type: string;
  status: string;
  word_count: number;
  content_type: ContentType;
  /** Type-specific payload — kept loose here so the UI can branch safely. */
  content_data: EbookContentData | WhitepaperContentData | LinkedInContentData | Record<string, never>;
  created_at: string;
  updated_at: string;
}

export async function listContentStudioHistory(
  projectId: string,
  filter: { types?: ContentType[]; statuses?: string[] } = {}
): Promise<
  | { success: true; data: ContentStudioHistoryRow[] }
  | { success: false; error: string; data: ContentStudioHistoryRow[] }
> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: [] };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (pErr || !project) return { success: false, error: 'Project not found', data: [] };

  const types = filter.types?.length ? filter.types : (['blog', 'ebook', 'whitepaper', 'linkedin'] as ContentType[]);
  const statuses = filter.statuses?.length ? filter.statuses : ['generated', 'approved', 'published'];

  // Use content_type when it exists; fall back to article_type heuristics so older
  // databases without the migration still produce a sensible history list.
  const COLS =
    'id, title, meta_description, target_keyword, article_type, status, word_count, content_type, content_data, created_at, updated_at';

  let { data, error } = await supabaseAdmin
    .from('blogs')
    .select(COLS)
    .eq('project_id', projectId)
    .in('status', statuses)
    .order('updated_at', { ascending: false })
    .limit(120);

  if (error && /content_type|content_data|schema cache/i.test(error.message)) {
    // Migration not run yet — degrade to a content-type-aware filter via article_type.
    const fallback = await supabaseAdmin
      .from('blogs')
      .select('id, title, meta_description, target_keyword, article_type, status, word_count, created_at, updated_at')
      .eq('project_id', projectId)
      .in('status', statuses)
      .order('updated_at', { ascending: false })
      .limit(120);
    data = (fallback.data as unknown) as typeof data;
    error = fallback.error;
  }

  if (error) return { success: false, error: error.message, data: [] };

  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    meta_description?: string;
    target_keyword?: string;
    article_type?: string;
    status?: string;
    word_count?: number;
    content_type?: ContentType;
    content_data?: ContentStudioHistoryRow['content_data'];
    created_at: string;
    updated_at: string;
  }>;

  const mapped: ContentStudioHistoryRow[] = rows
    .map(r => {
      const inferredType = r.content_type ?? inferContentType(r.article_type ?? '');
      return {
        id: r.id,
        title: r.title,
        meta_description: r.meta_description ?? '',
        target_keyword: r.target_keyword ?? '',
        article_type: r.article_type ?? '',
        status: r.status ?? 'generated',
        word_count: r.word_count ?? 0,
        content_type: inferredType,
        content_data: (r.content_data ?? {}) as ContentStudioHistoryRow['content_data'],
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    })
    .filter(r => types.includes(r.content_type));

  return { success: true, data: mapped };
}

function inferContentType(articleType: string): ContentType {
  const t = articleType.toLowerCase();
  if (t === 'ebook') return 'ebook';
  if (t === 'whitepaper') return 'whitepaper';
  if (t === 'linkedin') return 'linkedin';
  return 'blog';
}
