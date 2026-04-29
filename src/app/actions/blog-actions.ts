'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { generateBlogPost, geminiGenerate } from '@/lib/gemini';
import { researchKeyword } from '@/lib/research';
import { Blog, BlogSeoIssueKey, BlogStatus, CalendarEntryWithBlog } from '@/lib/types';
import type { BusinessBrief } from '@/lib/business-brief';
import { generateBlogImages, insertBlogImages } from '@/services/stabilityImages';

export async function generateBlog(entryId: string, wordCount: number = 2500) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: entry, error: eErr } = await supabaseAdmin
    .from('calendar_entries')
    .select('*')
    .eq('id', entryId)
    .single();

  if (eErr || !entry) return { success: false, error: 'Calendar entry not found' };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', entry.project_id)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) return { success: false, error: 'Project not found or unauthorized' };

  await supabaseAdmin
    .from('calendar_entries')
    .update({ status: 'generating' })
    .eq('id', entryId);

  try {
    let research = null;
    try {
      research = await researchKeyword(
        entry.focus_keyword,
        project.target_region,
        project.target_language
      );
    } catch (e) {
      console.warn('Research step failed, proceeding without context:', e);
    }

    let existingBlogs: { title: string; slug: string; target_keyword: string }[] = [];
    try {
      const { data: blogs } = await supabaseAdmin
        .from('blogs')
        .select('title, slug, target_keyword')
        .eq('project_id', entry.project_id)
        .in('status', ['generated', 'approved', 'published'])
        .neq('entry_id', entryId)
        .limit(15);
      existingBlogs = blogs ?? [];
    } catch {
      // optional context for internal links
    }

    // Load the cached Business Brief for this project — powers company
    // grounding + internal links to the user's REAL site pages.
    let brief: BusinessBrief | null = null;
    try {
      const { data: briefRow } = await supabaseAdmin
        .from('project_briefs')
        .select('brief')
        .eq('project_id', entry.project_id)
        .maybeSingle();
      brief = (briefRow?.brief as BusinessBrief | undefined) ?? null;
    } catch {
      // Brief is optional at the DB layer — generation must still work if it's missing.
    }

    const blogData = await generateBlogPost(
      entry,
      project,
      wordCount,
      research ?? undefined,
      existingBlogs,
      brief
    );
    const images = await generateBlogImages({
      title: blogData.title,
      targetKeyword: entry.focus_keyword,
      articleType: entry.article_type,
      niche: project.niche,
      audience: project.target_audience,
      company: project.company,
      wordCount: blogData.word_count,
    });
    const contentWithImages = sanitizeBlogMarkdown(insertBlogImages(blogData.content, images));
    const finalWordCount = countWords(contentWithImages);

    const { data: existing } = await supabaseAdmin
      .from('blogs')
      .select('id')
      .eq('entry_id', entryId)
      .maybeSingle();

    const upsertPayload = {
      title: blogData.title,
      content: contentWithImages,
      meta_description: blogData.meta_description,
      slug: blogData.slug,
      word_count: finalWordCount,
      target_keyword: entry.focus_keyword,
      article_type: entry.article_type,
      status: 'generated',
      research_sources: blogData.research_sources,
      external_links: blogData.external_links,
      internal_links: blogData.internal_links,
      updated_at: new Date().toISOString(),
    };

    let blog: Blog;
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('blogs')
        .update(upsertPayload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      blog = data as Blog;
    } else {
      const { data, error } = await supabaseAdmin
        .from('blogs')
        .insert({ ...upsertPayload, entry_id: entryId, project_id: entry.project_id })
        .select()
        .single();
      if (error) throw error;
      blog = data as Blog;
    }

    await supabaseAdmin
      .from('calendar_entries')
      .update({ status: 'generated' })
      .eq('id', entryId);

    return { success: true, data: blog };
  } catch (e: unknown) {
    await supabaseAdmin
      .from('calendar_entries')
      .update({ status: 'scheduled' })
      .eq('id', entryId);
    const message = e instanceof Error ? e.message : 'Generation failed';
    return { success: false, error: message };
  }
}

export async function getBlogByEntryId(entryId: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null };

  const { data, error } = await supabaseAdmin
    .from('blogs')
    .select('*')
    .eq('entry_id', entryId)
    .maybeSingle();

  if (error) return { success: false, error: error.message, data: null };
  const blog = data ? ({ ...data, content: sanitizeBlogMarkdown(data.content ?? '') } as Blog) : null;
  return { success: true, data: blog };
}

export async function getBlogById(blogId: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null };

  const { data, error } = await supabaseAdmin
    .from('blogs')
    .select('*')
    .eq('id', blogId)
    .single();

  if (error) return { success: false, error: error.message, data: null };
  return { success: true, data: { ...data, content: sanitizeBlogMarkdown(data.content ?? '') } as Blog };
}

export async function updateBlogStatus(blogId: string, status: BlogStatus) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null };

  if (!['generated', 'approved', 'published'].includes(status)) {
    return { success: false, error: 'Invalid blog status', data: null };
  }

  const { data: blog, error: bErr } = await supabaseAdmin
    .from('blogs')
    .select('id, project_id')
    .eq('id', blogId)
    .single();

  if (bErr || !blog) return { success: false, error: 'Blog not found', data: null };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', blog.project_id)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) return { success: false, error: 'Not authorized', data: null };

  const { data, error } = await supabaseAdmin
    .from('blogs')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', blogId)
    .select()
    .single();

  if (error) return { success: false, error: error.message, data: null };
  return { success: true, data: data as Blog };
}

function countWords(markdown: string): number {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
    .replace(/[#>*_\-[\]()`~]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeHost(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

function replaceFirstH1(markdown: string, title: string): string {
  const safeTitle = title.trim();
  if (!safeTitle) return markdown;
  if (/^#\s+.+$/m.test(markdown)) return markdown.replace(/^#\s+.+$/m, `# ${safeTitle}`);
  return `# ${safeTitle}\n\n${markdown.trim()}`;
}

function sanitizeBlogMarkdown(markdown: string): string {
  return stripSchemaJsonBlocks(markdown)
    .replace(/^\s*```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/Image placeholder missing a source\. Use edit mode to regenerate this image\./gi, '')
    .replace(/Regenerat(?:e|ing) with AI[^\n]*(?:illustration|visual)?/gi, '')
    .replace(/^\s*(?:Regenerate image|Generate image|Image\.\.\.)\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripSchemaJsonBlocks(markdown: string): string {
  return markdown
    .replace(/```(?:json|jsonld|ld\+json)?\s*([\s\S]*?)```/gi, (block, inner) => {
      return /"@context"\s*:\s*"https?:\/\/schema\.org"|schema\.org/i.test(inner) ? '' : block;
    })
    .replace(
      /(?:^|\n)\s*\{\s*\n[\s\S]*?"@context"\s*:\s*"https?:\/\/schema\.org[\s\S]*?\n\s*\}\s*(?=\n#{1,6}\s|\n*$)/gi,
      '\n'
    );
}

function extractMarkdownLinks(markdown: string, ownDomain = '') {
  const external = new Set<string>();
  const internal = new Set<string>();
  const ownHost = ownDomain ? normalizeHost(ownDomain) : '';
  const linkRe = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(markdown))) {
    if (match.index > 0 && markdown[match.index - 1] === '!') continue;
    const href = match[1].trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    if (/^https?:\/\//i.test(href)) {
      let host = '';
      try { host = new URL(href).hostname.replace(/^www\./, '').toLowerCase(); } catch { /* ignore */ }
      if (ownHost && host && (host === ownHost || host.endsWith(`.${ownHost}`))) internal.add(href);
      else external.add(href);
    } else {
      internal.add(href);
    }
  }
  return { externalLinks: [...external], internalLinks: [...internal] };
}

const SEO_FIX_INSTRUCTIONS: Record<BlogSeoIssueKey, string> = {
  title_keyword:
    'Update only the H1/title so it naturally includes the target keyword. Do not rewrite the body.',
  intro_keyword:
    'Update only the opening paragraph so the target keyword appears naturally within the first 100 words.',
  meta_keyword:
    'Update only the meta description so it includes the target keyword naturally.',
  meta_length:
    'Update only the meta description so it is 150-160 characters and preserves the same meaning.',
  word_count:
    'Expand only the most relevant existing section(s) enough to reach at least 1,500 words. Preserve all existing good content.',
  h2_structure:
    'Add or adjust only H2 headings/sections so the article has at least 3 useful H2 sections. Do not change unrelated paragraphs.',
  h3_structure:
    'Add only useful H3 subheadings inside existing sections where they improve organization.',
  faq:
    'Add only a concise FAQ section with relevant Q/A pairs near the end. Do not rewrite the rest.',
  external_links:
    'Add only credible external source links where they support existing claims. Do not rewrite unrelated content.',
  internal_links:
    'Add only one or more relevant internal links from the provided internal link candidates. Use the URLs verbatim.',
  keyword_density:
    'Adjust only small wording around the target keyword so keyword density falls into 0.5-3%. Avoid stuffing.',
};

function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function keywordStats(content: string, keyword: string): { words: number; occurrences: number; density: number } {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const words = content
    .toLowerCase()
    .replace(/[#>*_\-[\]()`~.,!?;:"]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!normalizedKeyword || !words.length) return { words: words.length, occurrences: 0, density: 0 };

  const kwWords = normalizedKeyword.split(/\s+/).filter(Boolean);
  let occurrences = 0;
  for (let i = 0; i <= words.length - kwWords.length; i++) {
    if (kwWords.every((w, j) => words[i + j] === w)) occurrences++;
  }
  return { words: words.length, occurrences, density: (occurrences / words.length) * 100 };
}

function fixLowKeywordDensity(content: string, keyword: string): string | null {
  const kw = keyword.trim();
  if (!kw) return null;

  const stats = keywordStats(content, kw);
  if (stats.density >= 0.5) return content;
  if (stats.density > 3) return null;

  const targetOccurrences = Math.ceil(stats.words * 0.0065);
  const needed = Math.max(1, targetOccurrences - stats.occurrences);
  const paragraphs = content.split(/\n{2,}/);
  const insertionSentences = [
    `For readers evaluating ${kw}, the most useful next step is to connect the recommendation back to clear business outcomes.`,
    `A practical ${kw} plan should consider current demand, stakeholder expectations, and the resources required for execution.`,
    `Teams comparing options around ${kw} should prioritize specific examples, measurable outcomes, and a realistic implementation path.`,
    `When ${kw} is part of a broader strategy, clarity on audience intent helps the content stay useful instead of generic.`,
    `The strongest ${kw} guidance usually combines market context, operational detail, and links to related resources.`,
    `Use ${kw} as a planning lens, but keep the advice focused on the reader's concrete decision or next action.`,
    `A well-structured ${kw} article should answer the main question quickly, then support it with examples and evidence.`,
    `For SEO, ${kw} should appear naturally in sections where the topic is being explained, compared, or operationalized.`,
  ];

  let inserted = 0;
  let sentenceIdx = 0;
  const avoidBlocks = /^(#|```|---META---)/;

  for (let i = 1; i < paragraphs.length && inserted < needed; i++) {
    const paragraph = paragraphs[i];
    if (avoidBlocks.test(paragraph.trim())) continue;
    if (paragraph.length < 120) continue;

    const sentence = insertionSentences[sentenceIdx % insertionSentences.length];
    sentenceIdx += 1;
    paragraphs[i] = `${paragraph.trim()}\n\n${sentence}`;
    inserted += 1;
  }

  while (inserted < needed) {
    const sentence = insertionSentences[sentenceIdx % insertionSentences.length];
    sentenceIdx += 1;
    paragraphs.push(sentence);
    inserted += 1;
  }

  const fixed = paragraphs.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  return keywordStats(fixed, kw).density >= 0.5 ? fixed : null;
}

export async function updateBlogContent(
  blogId: string,
  content: string,
  opts: { title?: string; metaDescription?: string } = {}
) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null };

  const cleaned = sanitizeBlogMarkdown(content);
  if (cleaned.length < 200) {
    return { success: false, error: 'Blog content is too short to save.', data: null };
  }

  const { data: blog, error: bErr } = await supabaseAdmin
    .from('blogs')
    .select('id, project_id')
    .eq('id', blogId)
    .single();

  if (bErr || !blog) return { success: false, error: 'Blog not found', data: null };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id, domain')
    .eq('id', blog.project_id)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) return { success: false, error: 'Not authorized', data: null };

  const { externalLinks, internalLinks } = extractMarkdownLinks(cleaned, project.domain as string);
  const patch: Record<string, unknown> = {
    content: cleaned,
    word_count: countWords(cleaned),
    external_links: externalLinks,
    internal_links: internalLinks,
    updated_at: new Date().toISOString(),
  };

  const title = opts.title?.trim();
  const metaDescription = opts.metaDescription?.trim();
  if (title) patch.title = title;
  if (typeof metaDescription === 'string') patch.meta_description = metaDescription;

  const { data, error } = await supabaseAdmin
    .from('blogs')
    .update(patch)
    .eq('id', blogId)
    .select()
    .single();

  if (error) return { success: false, error: error.message, data: null };
  return { success: true, data: data as Blog };
}

export async function fixBlogSeoIssue(blogId: string, issueKey: BlogSeoIssueKey) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null };

  const instruction = SEO_FIX_INSTRUCTIONS[issueKey];
  if (!instruction) return { success: false, error: 'Unsupported SEO issue', data: null };

  const { data: blog, error: bErr } = await supabaseAdmin
    .from('blogs')
    .select('*')
    .eq('id', blogId)
    .single();
  if (bErr || !blog) return { success: false, error: 'Blog not found', data: null };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id, user_id, domain')
    .eq('id', blog.project_id)
    .eq('user_id', user.id)
    .single();
  if (pErr || !project) return { success: false, error: 'Not authorized', data: null };

  if (issueKey === 'keyword_density') {
    const fixedContent = fixLowKeywordDensity(blog.content, blog.target_keyword ?? '');
    if (!fixedContent) {
      return {
        success: false,
        error: 'Keyword density is too high or the target keyword is missing. Please adjust wording manually or try AI fix again later.',
        data: null,
      };
    }

    const { externalLinks, internalLinks } = extractMarkdownLinks(fixedContent, project.domain as string);
    const { data, error } = await supabaseAdmin
      .from('blogs')
      .update({
        content: fixedContent,
        word_count: countWords(fixedContent),
        external_links: externalLinks,
        internal_links: internalLinks,
        updated_at: new Date().toISOString(),
      })
      .eq('id', blogId)
      .select()
      .single();

    if (error) return { success: false, error: error.message, data: null };
    return { success: true, data: data as Blog };
  }

  let internalCandidates: string[] = [];
  try {
    const { data: briefRow } = await supabaseAdmin
      .from('project_briefs')
      .select('brief')
      .eq('project_id', blog.project_id)
      .maybeSingle();
    const brief = briefRow?.brief as BusinessBrief | undefined;
    internalCandidates = [
      ...(brief?.internal_link_candidates ?? []).map(c => c.url),
      ...(brief?.blog_urls ?? []),
      ...(blog.internal_links ?? []),
    ].filter(Boolean);
  } catch {
    internalCandidates = blog.internal_links ?? [];
  }

  const prompt = `You are an SEO editor performing ONE surgical fix on an existing markdown blog.

CRITICAL RULES:
- Fix ONLY this issue: ${issueKey}
- Required action: ${instruction}
- Preserve every unrelated sentence, section, heading, link, title, and meta description.
- Do not regenerate the article.
- Do not change the topic, audience, tone, or status.
- Return ONLY valid JSON. No markdown fences.

TARGET KEYWORD: ${blog.target_keyword || '(none)'}
CURRENT TITLE: ${blog.title}
CURRENT META DESCRIPTION: ${blog.meta_description || ''}
INTERNAL LINK CANDIDATES (only use for internal_links issue, verbatim):
${internalCandidates.slice(0, 20).map(u => `- ${u}`).join('\n') || '(none)'}

CURRENT MARKDOWN:
---
${blog.content}
---

Return JSON with this exact shape:
{
  "title": "title to save",
  "meta_description": "meta description to save",
  "content": "full markdown content to save",
  "note": "one short sentence explaining only this fix"
}`;

  let raw = '';
  try {
    raw = await geminiGenerate(prompt, 2);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error: message.includes('Gemini failed')
        ? 'Gemini is rate-limited right now. Please wait a minute and try this AI fix again.'
        : `AI fix failed: ${message}`,
      data: null,
    };
  }
  const parsed = extractJsonObject(raw);
  if (!parsed) return { success: false, error: 'AI returned an invalid fix. Try again.', data: null };

  const aiTitle = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : blog.title;
  const aiMeta =
    typeof parsed.meta_description === 'string'
      ? parsed.meta_description.trim()
      : (blog.meta_description ?? '');
  const aiContent =
    typeof parsed.content === 'string' && parsed.content.trim().length > 200
      ? parsed.content.trim()
      : blog.content;

  const title = issueKey === 'title_keyword' ? aiTitle : blog.title;
  const metaDescription =
    issueKey === 'meta_keyword' || issueKey === 'meta_length'
      ? aiMeta
      : (blog.meta_description ?? '');
  const content =
    issueKey === 'title_keyword'
      ? replaceFirstH1(blog.content, title)
      : issueKey === 'meta_keyword' || issueKey === 'meta_length'
        ? blog.content
        : aiContent;

  const { externalLinks, internalLinks } = extractMarkdownLinks(content, project.domain as string);
  const { data, error } = await supabaseAdmin
    .from('blogs')
    .update({
      title,
      meta_description: metaDescription,
      content,
      word_count: countWords(content),
      external_links: externalLinks,
      internal_links: internalLinks,
      updated_at: new Date().toISOString(),
    })
    .eq('id', blogId)
    .select()
    .single();

  if (error) return { success: false, error: error.message, data: null };
  return { success: true, data: data as Blog };
}

export async function getCalendarWithBlogs(projectId: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: [] };

  const { data: entries, error: eErr } = await supabaseAdmin
    .from('calendar_entries')
    .select('*')
    .eq('project_id', projectId)
    .order('scheduled_date', { ascending: true });

  if (eErr) return { success: false, error: eErr.message, data: [] };

  const { data: blogs } = await supabaseAdmin
    .from('blogs')
    .select('id, entry_id, word_count, status, research_sources')
    .eq('project_id', projectId);

  const blogMap = new Map((blogs ?? []).map(b => [b.entry_id, b]));
  const combined: CalendarEntryWithBlog[] = (entries ?? []).map(entry => ({
    ...entry,
    blog: blogMap.get(entry.id) ?? null,
  }));

  return { success: true, data: combined };
}
