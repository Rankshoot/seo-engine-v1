'use server';

import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { QuotaService, QuotaExhaustedError } from '@/services/quota';
import {
  generateEbook,
  generateWhitepaper,
  generateLinkedInPost,
  suggestContentTopicWithFlash,
  suggestLinkedInInputsWithFlash,
  suggestMultipleTopicsWithFlash,
} from '@/lib/content-studio';
import { researchKeyword } from '@/lib/research';
import { sanitizeBlogContent } from '@/lib/blog-content';
import { loadRankedSitemapInternalLinks } from '@/lib/internal-links';
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
  brand_voice?: string;
  brand_values?: string;
  brand_description?: string;
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
  topic?: { focusKeyword?: string; title?: string; secondaryKeywords?: string[] },
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

  // Relevance-ranked URLs from the project's saved sitemap — the deep content
  // links that make internal linking rich instead of homepage-only. Listed
  // first so the most relevant survive the cap.
  let fromSitemap: string[] = [];
  try {
    const ranked = await loadRankedSitemapInternalLinks(projectId, {
      focusKeyword: topic?.focusKeyword,
      title: topic?.title,
      secondaryKeywords: topic?.secondaryKeywords,
      limit: 24,
    });
    fromSitemap = ranked.map(l => l.url);
  } catch {
    /* optional — sitemap not configured yet */
  }

  return Array.from(new Set([...fromSitemap, ...fromBrief, ...fromBriefBlogs, ...fromBlogs])).slice(0, 40);
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

async function loadUsedKeywords(projectId: string): Promise<string[]> {
  try {
    const [blogsRes, keywordsRes] = await Promise.all([
      supabaseAdmin
        .from('blogs')
        .select('target_keyword')
        .eq('project_id', projectId)
        .not('target_keyword', 'is', null)
        .limit(100),
      supabaseAdmin
        .from('keywords')
        .select('keyword')
        .eq('project_id', projectId)
        .limit(100),
    ]);
    const fromBlogs = (blogsRes.data ?? [])
      .map(r => String(r.target_keyword ?? '').trim())
      .filter(Boolean);
    const fromKeywords = (keywordsRes.data ?? [])
      .map(r => String(r.keyword ?? '').trim())
      .filter(Boolean);
    return Array.from(new Set([...fromBlogs, ...fromKeywords]));
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
    seedKeyword?: string;
    /** Topic the user already typed — respected, never replaced. */
    seedTopic?: string;
    /** Topic ideas already shown — the AI won't repeat them on reload. */
    avoidTopics?: string[];
  }
): Promise<
  | {
      success: true;
      topic: string;
      primary_keyword: string;
      semantic_keywords: string[];
      rationale: string;
      alternate_topics: string[];
      goal?: string;
      audience?: string;
      post_style?: string;
      voice?: string;
      author_role?: string;
      cta_objective?: string;
      tone?: string;
    }
  | { success: false; error: string }
> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const projRes = await loadProjectAndBrief(projectId, user.id);
  if (!projRes.ok) return { success: false, error: projRes.error };
  const { project, brief } = projRes;

  // Deduct 1 AI helper credit for this call
  try {
    await QuotaService.deductQuota(user.id, 'ai_credits', 1);
  } catch (e) {
    if (e instanceof QuotaExhaustedError) {
      return { success: false, error: 'QUOTA_EXCEEDED:ai_credits — You have used all your AI helper credits. Upgrade your plan to use Ask AI.' };
    }
    // Non-quota errors: continue without blocking (soft fail)
    console.warn('[suggestContentTopicAction] ai_credits deduction failed (soft fail):', e);
  }

  if (payload.contentType === 'linkedin') {
    try {
      const suggestion = await suggestLinkedInInputsWithFlash({
        niche: project.niche || 'general',
        audience: project.target_audience || 'general audience',
        domain: project.domain,
        briefSummary: brief?.summary ?? null,
        brandVoice: project.brand_voice,
        brandValues: project.brand_values,
        brandDescription: project.brand_description,
        seedKeyword: payload.seedKeyword,
        seedTopic: payload.seedTopic,
      });
      return {
        success: true,
        topic: suggestion.topic,
        primary_keyword: suggestion.primary_keyword,
        semantic_keywords: [],
        rationale: 'LinkedIn feed optimization suggestion',
        alternate_topics: [],
        audience: suggestion.audience,
        post_style: suggestion.post_style,
        voice: suggestion.voice,
        author_role: suggestion.author_role,
        cta_objective: suggestion.cta_objective,
        tone: suggestion.tone,
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Could not generate suggestion' };
    }
  }

  const [approved, used] = await Promise.all([
    loadApprovedKeywords(projectId),
    loadUsedKeywords(projectId),
  ]);
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
      usedKeywords: used,
      avoidPhrases: (payload.avoidPhrases ?? []).slice(0, 6),
      seedKeyword: payload.seedKeyword,
      seedTopic: payload.seedTopic,
      avoidTopics: payload.avoidTopics,
    });
    return { success: true, ...suggestion };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Could not generate suggestion' };
  }
}

// ─── "More topic ideas" — topic-only, never touches other fields ──────────
//
// Deliberately separate from suggestContentTopicAction (the Auto-fill-with-AI
// action). This one ONLY returns topic strings for the suggestion chips —
// it must never fill/overwrite the keyword, audience, goal, CTA, or any
// other field, no matter what the caller currently holds in those fields.

export async function suggestTopicIdeasAction(
  projectId: string,
  payload: {
    contentType: ContentType;
    /** Current keyword field value, if any — always respected as an anchor. */
    seedKeyword?: string;
    /** Other details already filled in on the form — used as context only. */
    audience?: string;
    tone?: string;
    goal?: string;
    ctaObjective?: string;
    secondaryKeywords?: string[];
    /** Ideas already shown to the user — ask for genuinely different ones. */
    avoidTopics?: string[];
  }
): Promise<{ success: true; topics: string[] } | { success: false; error: string }> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const projRes = await loadProjectAndBrief(projectId, user.id);
  if (!projRes.ok) return { success: false, error: projRes.error };
  const { project, brief } = projRes;

  try {
    await QuotaService.deductQuota(user.id, 'ai_credits', 1);
  } catch (e) {
    if (e instanceof QuotaExhaustedError) {
      return { success: false, error: 'QUOTA_EXCEEDED:ai_credits — You have used all your AI helper credits. Upgrade your plan to use Ask AI.' };
    }
    console.warn('[suggestTopicIdeasAction] ai_credits deduction failed (soft fail):', e);
  }

  const labelMap: Record<ContentType, string> = {
    blog: 'blog article',
    ebook: 'ebook',
    whitepaper: 'whitepaper',
    linkedin: 'LinkedIn post',
  };

  const formContextContextLines: string[] = [];
  if (payload.audience?.trim()) formContextContextLines.push(`Audience: ${payload.audience.trim()}`);
  if (payload.tone?.trim()) formContextContextLines.push(`Tone: ${payload.tone.trim()}`);
  if (payload.goal?.trim()) formContextContextLines.push(`Reader goal: ${payload.goal.trim()}`);
  if (payload.ctaObjective?.trim()) formContextContextLines.push(`CTA objective: ${payload.ctaObjective.trim()}`);
  if (payload.secondaryKeywords?.length) formContextContextLines.push(`Supporting keywords: ${payload.secondaryKeywords.slice(0, 8).join(', ')}`);

  const [approved, used] = await Promise.all([
    loadApprovedKeywords(projectId),
    loadUsedKeywords(projectId),
  ]);

  try {
    const topics = await suggestMultipleTopicsWithFlash({
      contentTypeLabel: labelMap[payload.contentType],
      niche: project.niche || 'general',
      audience: project.target_audience || 'general audience',
      domain: project.domain,
      briefSummary: brief?.summary ?? null,
      seedKeyword: payload.seedKeyword,
      avoidTopics: payload.avoidTopics,
      formContext: formContextContextLines.join('\n') || undefined,
    });
    return { success: true, topics };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Could not generate topic ideas' };
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
    customWordCount?: number;
    region?: string;
    language?: string;
    semanticKeywords?: string[];
    skipResearch?: boolean;
    entryId?: string | null;
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

  // ── Quota check: ebooks ─────────────────────────────────────────────────
  try {
    await QuotaService.checkQuota(user.id, 'ebooks');
  } catch (e) {
    if (e instanceof QuotaExhaustedError) {
      mark('quota', 'ebook limit reached');
      return { success: false, error: 'QUOTA_EXCEEDED:ebooks — You have reached your ebook generation limit. Upgrade your plan to generate more ebooks.', trace };
    }
    throw e;
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

  const internalLinks = await loadInternalLinkPool(projectId, brief, project.domain, {
    focusKeyword: payload.primaryKeyword,
    title: payload.topic,
    secondaryKeywords: payload.secondaryKeywords,
  });
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
        customWordCount: payload.customWordCount,
        regionLabel: regionLabel(region),
        languageLabel: languageLabel(language),
        companyName: project.company,
        companyDomain: project.domain,
        niche: project.niche,
        brief,
        research,
        internalLinks,
        semanticKeywords: payload.semanticKeywords ?? [],
        brandVoice: project.brand_voice,
        brandValues: project.brand_values,
        brandDescription: project.brand_description,
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
      entry_id: payload.entryId || null,
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

  if (payload.entryId) {
    await supabaseAdmin
      .from('calendar_entries')
      .update({ status: 'generated', title: result.title })
      .eq('id', payload.entryId);
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
    customWordCount?: number;
    researchAngle: string;
    businessObjective: string;
    region?: string;
    language?: string;
    semanticKeywords?: string[];
    skipResearch?: boolean;
    entryId?: string | null;
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

  // ── Quota check: whitepapers ─────────────────────────────────────────
  try {
    await QuotaService.checkQuota(user.id, 'whitepapers');
  } catch (e) {
    if (e instanceof QuotaExhaustedError) {
      mark('quota', 'whitepaper limit reached');
      return { success: false, error: 'QUOTA_EXCEEDED:whitepapers — You have reached your whitepaper generation limit. Upgrade your plan to generate more whitepapers.', trace };
    }
    throw e;
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

  const internalLinks = await loadInternalLinkPool(projectId, brief, project.domain, {
    focusKeyword: payload.primaryKeyword,
    title: payload.topic,
    secondaryKeywords: payload.secondaryKeywords,
  });
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
        customWordCount: payload.customWordCount,
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
        brandVoice: project.brand_voice,
        brandValues: project.brand_values,
        brandDescription: project.brand_description,
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
      entry_id: payload.entryId || null,
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

  if (payload.entryId) {
    await supabaseAdmin
      .from('calendar_entries')
      .update({ status: 'generated', title: result.title })
      .eq('id', payload.entryId);
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
    entryId?: string | null;
  }
): Promise<
  | { success: true; data: Blog; trace: ContentGenerationTraceEntry[] }
  | { success: false; error: string; trace: ContentGenerationTraceEntry[] }
> {
  const trace: ContentGenerationTraceEntry[] = [];
  const mark = (step: string, detail?: string, ms?: number) => trace.push({ step, detail, ms });

  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', trace };

  // ── Quota check: linkedin ────────────────────────────────────────────────
  try {
    await QuotaService.checkQuota(user.id, 'linkedin');
  } catch (e) {
    if (e instanceof QuotaExhaustedError) {
      mark('quota', 'linkedin limit reached');
      return { success: false, error: 'QUOTA_EXCEEDED:linkedin — You have reached your LinkedIn post generation limit. Upgrade your plan to generate more posts.', trace };
    }
    throw e;
  }

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
      brandVoice: project.brand_voice,
      brandValues: project.brand_values,
      brandDescription: project.brand_description,
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
      entry_id: payload.entryId || null,
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

  if (payload.entryId) {
    await supabaseAdmin
      .from('calendar_entries')
      .update({ status: 'generated', title: result.title })
      .eq('id', payload.entryId);
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
  entry_id?: string | null;
}

export async function listContentStudioHistory(
  projectId: string,
  filter: {
    types?: ContentType[];
    statuses?: string[];
    limit?: number;
    offset?: number;
    search?: string;
    sort?: 'updated' | 'created' | 'words' | 'title';
  } = {}
): Promise<
  | { success: true; data: ContentStudioHistoryRow[]; total: number; hasMore: boolean; counts: Record<ContentType, number> }
  | { success: false; error: string; data: ContentStudioHistoryRow[]; total: number; hasMore: boolean; counts: Record<ContentType, number> }
> {
  const user = await currentUser();
  const emptyCounts: Record<ContentType, number> = { blog: 0, ebook: 0, whitepaper: 0, linkedin: 0 };
  if (!user) return { success: false, error: 'Not authenticated', data: [], total: 0, hasMore: false, counts: emptyCounts };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (pErr || !project) return { success: false, error: 'Project not found', data: [], total: 0, hasMore: false, counts: emptyCounts };

  const types = filter.types?.length ? filter.types : (['blog', 'ebook', 'whitepaper', 'linkedin'] as ContentType[]);
  const statuses = filter.statuses?.length ? filter.statuses : ['generated', 'approved', 'published'];

  const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
  const offset = Math.max(filter.offset ?? 0, 0);
  const sort = filter.sort || 'updated';

  const dbSortCol =
    sort === 'created' ? 'created_at' :
    sort === 'words' ? 'word_count' :
    sort === 'title' ? 'title' :
    'updated_at';
  const ascending = sort === 'title';

  // Use content_type when it exists; fall back to article_type heuristics so older
  // databases without the migration still produce a sensible history list.
  const COLS =
    'id, title, meta_description, target_keyword, article_type, status, word_count, content_type, content_data, created_at, updated_at, entry_id';

  let query = supabaseAdmin
    .from('blogs')
    .select(COLS, { count: 'exact' })
    .eq('project_id', projectId)
    .in('status', statuses);

  if (filter.types?.length) {
    query = query.in('content_type', filter.types);
  }

  if (filter.search) {
    const q = `%${filter.search.replace(/[%_,]/g, '')}%`;
    query = query.or(`title.ilike.${q},target_keyword.ilike.${q},article_type.ilike.${q}`);
  }

  query = query.order(dbSortCol, { ascending }).range(offset, offset + limit - 1);

  let { data, error, count } = await query;
  let hasRunFallback = false;

  if (error && /content_type|content_data|schema cache/i.test(error.message)) {
    hasRunFallback = true;
    // Migration not run yet — degrade to a content-type-aware filter via article_type.
    let fallbackQuery = supabaseAdmin
      .from('blogs')
      .select('id, title, meta_description, target_keyword, article_type, status, word_count, created_at, updated_at', { count: 'exact' })
      .eq('project_id', projectId)
      .in('status', statuses);

    if (filter.search) {
      const q = `%${filter.search.replace(/[%_,]/g, '')}%`;
      fallbackQuery = fallbackQuery.or(`title.ilike.${q},target_keyword.ilike.${q},article_type.ilike.${q}`);
    }

    fallbackQuery = fallbackQuery.order(dbSortCol, { ascending }).range(offset, offset + limit - 1);

    const fallback = await fallbackQuery;
    data = (fallback.data as unknown) as typeof data;
    error = fallback.error;
    count = fallback.count;
  }

  if (error) return { success: false, error: error.message, data: [], total: 0, hasMore: false, counts: emptyCounts };

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
    entry_id?: string | null;
  }>;

  let mapped: ContentStudioHistoryRow[] = rows.map(r => {
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
      entry_id: r.entry_id,
    };
  });

  if (hasRunFallback) {
    // In fallback mode, filter mapped list in-memory since the db couldn't query content_type.
    mapped = mapped.filter(r => types.includes(r.content_type));
  }

  // Load counts for type badges on the server
  const counts: Record<ContentType, number> = { blog: 0, ebook: 0, whitepaper: 0, linkedin: 0 };
  let countDataResult: Array<{ content_type?: string; article_type?: string }> = [];

  const countRes = await supabaseAdmin
    .from('blogs')
    .select('content_type, article_type')
    .eq('project_id', projectId)
    .in('status', statuses);

  if (countRes.error && /content_type|schema cache/i.test(countRes.error.message)) {
    const fallbackRes = await supabaseAdmin
      .from('blogs')
      .select('article_type')
      .eq('project_id', projectId)
      .in('status', statuses);
    if (fallbackRes.data) {
      countDataResult = fallbackRes.data as Array<{ article_type?: string }>;
    }
  } else if (countRes.data) {
    countDataResult = countRes.data;
  }

  for (const item of countDataResult) {
    const t = (item.content_type ?? inferContentType(item.article_type ?? '')) as ContentType;
    if (counts[t] !== undefined) {
      counts[t]++;
    }
  }

  const total = count ?? mapped.length;
  const hasMore = offset + mapped.length < total;

  return { success: true, data: mapped, total, hasMore, counts };
}

function inferContentType(articleType: string): ContentType {
  const t = articleType.toLowerCase();
  if (t === 'ebook') return 'ebook';
  if (t === 'whitepaper') return 'whitepaper';
  if (t === 'linkedin') return 'linkedin';
  return 'blog';
}

export async function deleteContentAssetAction(
  projectId: string,
  blogId: string,
  entryId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // 1. Verify project ownership
  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (pErr || !project) return { success: false, error: 'Project not found' };

  // 2. Verify the blog exists and belongs to this project
  const { data: blog, error: bErr } = await supabaseAdmin
    .from('blogs')
    .select('id, entry_id')
    .eq('id', blogId)
    .eq('project_id', projectId)
    .single();
  if (bErr || !blog) return { success: false, error: 'Content not found' };

  // 3. Reset the linked calendar entry so the keyword shows Generate again
  const linkedEntryId = entryId || blog.entry_id;
  if (linkedEntryId) {
    await supabaseAdmin
      .from('calendar_entries')
      .update({ status: 'scheduled', updated_at: new Date().toISOString() })
      .eq('id', linkedEntryId)
      .eq('project_id', projectId);
  }

  // 4. Delete the blog (cascades blog_deep_analyses via FK)
  const { error: delErr } = await supabaseAdmin
    .from('blogs')
    .delete()
    .eq('id', blogId)
    .eq('project_id', projectId);
  if (delErr) return { success: false, error: delErr.message };

  return { success: true };
}

export async function unscheduleContentAction(
  projectId: string,
  blogId: string,
  entryId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // 1. Verify project ownership
  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (pErr || !project) return { success: false, error: 'Project not found' };

  // 2. Set blogs.entry_id = null first to break foreign key cascades
  const { error: bErr } = await supabaseAdmin
    .from('blogs')
    .update({ entry_id: null })
    .eq('id', blogId)
    .eq('project_id', projectId);
  if (bErr) return { success: false, error: bErr.message };

  // 3. Delete the calendar entry
  const { error: cErr } = await supabaseAdmin
    .from('calendar_entries')
    .delete()
    .eq('id', entryId)
    .eq('project_id', projectId);
  if (cErr) return { success: false, error: cErr.message };

  return { success: true };
}
