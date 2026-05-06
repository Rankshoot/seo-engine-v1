'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { generateBlogPost, geminiGenerate } from '@/lib/gemini';
import { researchKeyword } from '@/lib/research';
import { Blog, BlogSeoIssueKey, BlogStatus, CalendarEntryWithBlog } from '@/lib/types';
import type { BusinessBrief } from '@/lib/business-brief';
import { generateBlogImages, insertBlogImages } from '@/services/stabilityImages';
import { sanitizeBlogContent } from '@/lib/blog-content';
import { formatContentHealthAuditForWriter } from '@/lib/content-health-calendar';

export async function generateBlog(entryId: string, wordCount: number = 2500, writerNotes?: string) {
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

    // External rank-data keyword/SERP enrichment disabled — generation uses
    // `researchKeyword` + Serper inside `generateBlogPost` only.

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

    const auditWriterBlock = formatContentHealthAuditForWriter(
      (entry as { content_health_audit?: unknown }).content_health_audit
    );
    const mergedWriterNotes = [writerNotes?.trim(), auditWriterBlock || '']
      .filter(Boolean)
      .join('\n\n---\n\n');

    const blogData = await generateBlogPost(
      entry,
      project,
      wordCount,
      research ?? undefined,
      existingBlogs,
      brief,
      undefined,
      mergedWriterNotes || undefined,
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

    // Probe every external link, drop dead ones, cap rendered images at 2
    // and strip leftover IMAGE_PLACEHOLDER artifacts so the preview and the
    // exported file always agree. `external_links` / `internal_links` are
    // rebuilt from the sanitized markdown so the sidebar counts can't drift.
    const sanitized = await sanitizeBlogContent(contentWithImages, {
      ownDomain: project.domain ?? '',
    });
    if (sanitized.removedLinks.length) {
      console.log(
        `[blog] dropped ${sanitized.removedLinks.length} dead external link(s) from "${blogData.title}":`,
        sanitized.removedLinks.slice(0, 5)
      );
    }
    const finalContent = sanitized.content;
    const finalWordCount = countWords(finalContent);

    const { data: existing } = await supabaseAdmin
      .from('blogs')
      .select('id')
      .eq('entry_id', entryId)
      .maybeSingle();

    const upsertPayload = {
      title: blogData.title,
      content: finalContent,
      meta_description: blogData.meta_description,
      slug: blogData.slug,
      word_count: finalWordCount,
      target_keyword: entry.focus_keyword,
      article_type: entry.article_type,
      status: 'generated',
      research_sources: blogData.research_sources,
      external_links: sanitized.externalLinks.slice(0, 10),
      internal_links: sanitized.internalLinks.slice(0, 12),
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
      .update({ status: 'generated', title: blogData.title })
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
    .select('id, entry_id, project_id')
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

  // Keep the calendar entry status in sync so the calendar page reflects publishing.
  if (blog.entry_id) {
    const calendarStatus =
      status === 'published' ? 'published' :
      status === 'approved'  ? 'approved'  :
      'generated';
    await supabaseAdmin
      .from('calendar_entries')
      .update({ status: calendarStatus })
      .eq('id', blog.entry_id);
  }

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
    // Strip the LLM's leftover `![alt](IMAGE_PLACEHOLDER)` artifacts so the
    // preview never flashes a broken-image icon. The async sanitizer in
    // `blog-content.ts` does this on fresh generations; this branch keeps
    // legacy rows clean too.
    .replace(/!\[[^\]]*\]\(\s*IMAGE_PLACEHOLDER\s*\)\s*\n?/gi, '')
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

// ─────────────────────────────────────────────────────────────────────────────
// Targeted blog editing helpers used by the AI assistant.
// These let the user say things like:
//   "rewrite the 4th paragraph to be more concrete"
//   "expand the H2 about <topic> with examples"
//   "add 2 internal links"
//   "add credible citations from McKinsey or SHRM"
// without regenerating the whole article.
// ─────────────────────────────────────────────────────────────────────────────

/** Split blog content into top-level "blocks" (intro, H2 sections, FAQ). */
function splitIntoH2Sections(markdown: string): Array<{ heading: string | null; body: string; start: number; end: number }> {
  const lines = markdown.split('\n');
  const sections: Array<{ heading: string | null; body: string; start: number; end: number }> = [];
  let currentHeading: string | null = null;
  let bufferStart = 0;
  let buffer: string[] = [];

  const flush = (endLine: number) => {
    sections.push({
      heading: currentHeading,
      body: buffer.join('\n').trim(),
      start: bufferStart,
      end: endLine,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) {
      if (buffer.length || currentHeading !== null) flush(i - 1);
      currentHeading = line.replace(/^##\s+/, '').trim();
      buffer = [line];
      bufferStart = i;
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length) flush(lines.length - 1);
  return sections;
}

/** Split a markdown blob into paragraphs, treating two newlines as a separator. */
function splitParagraphs(markdown: string): string[] {
  return markdown.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
}

async function persistBlogPatch(blogId: string, newContent: string, projectDomain: string): Promise<{ success: boolean; error?: string; data: Blog | null }> {
  const cleaned = sanitizeBlogMarkdown(newContent);
  const { externalLinks, internalLinks } = extractMarkdownLinks(cleaned, projectDomain);
  const { data, error } = await supabaseAdmin
    .from('blogs')
    .update({
      content: cleaned,
      word_count: countWords(cleaned),
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

/**
 * Replace one paragraph (1-indexed) with an LLM-rewritten version.
 * The LLM is given the full article for context but instructed to ONLY
 * return the new paragraph text.
 */
export async function editBlogParagraph(
  blogId: string,
  paragraphIndex: number,
  instruction: string
): Promise<{ success: boolean; error?: string; data: Blog | null; before?: string; after?: string }> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null };
  if (!instruction?.trim()) return { success: false, error: 'Missing edit instruction', data: null };
  if (paragraphIndex < 1) return { success: false, error: 'Paragraph index must be ≥ 1', data: null };

  const { data: blog } = await supabaseAdmin.from('blogs').select('*').eq('id', blogId).single();
  if (!blog) return { success: false, error: 'Blog not found', data: null };

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, domain')
    .eq('id', blog.project_id)
    .eq('user_id', user.id)
    .single();
  if (!project) return { success: false, error: 'Not authorized', data: null };

  const paragraphs = splitParagraphs(blog.content as string);
  const idx = paragraphIndex - 1;
  if (idx >= paragraphs.length) {
    return {
      success: false,
      error: `This blog only has ${paragraphs.length} paragraphs.`,
      data: null,
    };
  }
  const before = paragraphs[idx];

  const prompt = `You are rewriting ONE paragraph in an existing blog post. Return ONLY the rewritten paragraph — no explanations, no headings, no quotes, no surrounding markdown.

Blog title: ${blog.title}
Target keyword: ${blog.target_keyword}
Paragraph index (1-based): ${paragraphIndex} of ${paragraphs.length}

Edit instruction from user:
"${instruction.trim()}"

Current paragraph:
"""
${before}
"""

Surrounding context (paragraph before / after for tone & flow):
BEFORE: ${idx > 0 ? paragraphs[idx - 1] : '(start of article)'}
AFTER:  ${idx + 1 < paragraphs.length ? paragraphs[idx + 1] : '(end of article)'}

Rules:
1. Output ONLY the new paragraph text. No code fences, no labels.
2. Keep the same approximate length unless the instruction explicitly asks to expand/shrink.
3. Preserve any inline links the original paragraph had unless the instruction says otherwise.
4. Match the tone of the surrounding paragraphs.
5. Markdown is allowed for emphasis (**bold**, *italic*, [link](url)).`;

  let after: string;
  try {
    after = (await geminiGenerate(prompt, 1)).trim();
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'LLM call failed', data: null };
  }
  // Strip surrounding quotes / code fences the LLM sometimes adds
  after = after.replace(/^"+|"+$/g, '').replace(/^```[a-z]*\n?|```$/g, '').trim();
  if (!after) return { success: false, error: 'LLM returned empty paragraph', data: null };

  paragraphs[idx] = after;
  const newContent = paragraphs.join('\n\n');
  const res = await persistBlogPatch(blogId, newContent, project.domain as string);
  return { ...res, before, after };
}

/**
 * Rewrite or expand a whole H2 section identified by heading text.
 */
export async function editBlogSection(
  blogId: string,
  headingMatch: string,
  instruction: string
): Promise<{ success: boolean; error?: string; data: Blog | null; section?: string }> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null };
  if (!instruction?.trim()) return { success: false, error: 'Missing edit instruction', data: null };
  if (!headingMatch?.trim()) return { success: false, error: 'Missing heading text', data: null };

  const { data: blog } = await supabaseAdmin.from('blogs').select('*').eq('id', blogId).single();
  if (!blog) return { success: false, error: 'Blog not found', data: null };
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, domain')
    .eq('id', blog.project_id)
    .eq('user_id', user.id)
    .single();
  if (!project) return { success: false, error: 'Not authorized', data: null };

  const sections = splitIntoH2Sections(blog.content as string);
  const needle = headingMatch.toLowerCase().trim();
  const target = sections.find(
    s => s.heading && (s.heading.toLowerCase().includes(needle) || needle.includes(s.heading.toLowerCase()))
  );
  if (!target) {
    const available = sections.filter(s => s.heading).map(s => `"${s.heading}"`).join(', ');
    return {
      success: false,
      error: `Could not find an H2 matching "${headingMatch}". Available H2s: ${available || '(none)'}`,
      data: null,
    };
  }

  const prompt = `Rewrite ONE H2 section of an existing blog. Return the full new section starting with the "## " line, in valid Markdown. Do NOT add any explanation outside the section.

Blog title: ${blog.title}
Target keyword: ${blog.target_keyword}
Section heading: ${target.heading}

Edit instruction:
"${instruction.trim()}"

Current section:
"""
${target.body}
"""

Rules:
1. Begin with the "## " heading on its own line. You may improve the heading wording but keep the same topic.
2. Use the same tone as the rest of the article.
3. Allow ###, bullet lists, and inline links.
4. No FAQ-style headings unless the original section was the FAQ.
5. Output ONLY the section markdown.`;

  let newSection: string;
  try {
    newSection = (await geminiGenerate(prompt, 1)).trim();
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'LLM call failed', data: null };
  }
  if (!newSection.startsWith('## ')) newSection = `## ${target.heading}\n\n${newSection}`;

  const lines = (blog.content as string).split('\n');
  const before = lines.slice(0, target.start).join('\n');
  const afterLines = lines.slice(target.end + 1).join('\n');
  const newContent = [before.trim(), newSection.trim(), afterLines.trim()].filter(Boolean).join('\n\n');

  const res = await persistBlogPatch(blogId, newContent, project.domain as string);
  return { ...res, section: target.heading ?? '' };
}

/**
 * Add `count` internal links from the project's brief link pool, placed in
 * paragraphs that don't already contain a link.
 */
export async function addInternalLinksToBlog(
  blogId: string,
  count: number = 2
): Promise<{ success: boolean; error?: string; data: Blog | null; added: number }> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null, added: 0 };

  const { data: blog } = await supabaseAdmin.from('blogs').select('*').eq('id', blogId).single();
  if (!blog) return { success: false, error: 'Blog not found', data: null, added: 0 };
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, domain')
    .eq('id', blog.project_id)
    .eq('user_id', user.id)
    .single();
  if (!project) return { success: false, error: 'Not authorized', data: null, added: 0 };

  // Grab the brief's internal_link_candidates pool.
  const { data: briefRow } = await supabaseAdmin
    .from('project_briefs')
    .select('brief')
    .eq('project_id', blog.project_id)
    .maybeSingle();
  const brief = briefRow?.brief as { internal_link_candidates?: Array<{ url: string; title?: string; topic?: string }>; blog_urls?: string[] } | undefined;
  const pool = (brief?.internal_link_candidates ?? []).filter(l => l.url?.startsWith('http'));
  const blogUrls = (brief?.blog_urls ?? []).filter(u => u.startsWith('http'));

  const candidates = [
    ...pool.map(l => ({ url: l.url, label: l.title || l.topic || l.url })),
    ...blogUrls.map(u => ({ url: u, label: u.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '').replace(/[-_/]/g, ' ') || 'Related article' })),
  ].slice(0, 25);
  if (!candidates.length) {
    return { success: false, error: 'No internal link candidates available in your business brief.', data: null, added: 0 };
  }

  const content = blog.content as string;
  const existingUrls = new Set([...(blog.internal_links ?? []), ...(blog.external_links ?? [])]);
  const fresh = candidates.filter(c => !existingUrls.has(c.url));
  if (!fresh.length) {
    return { success: false, error: 'All internal link candidates are already used.', data: null, added: 0 };
  }

  const prompt = `Insert exactly ${Math.min(count, fresh.length)} internal links into this blog. For each link, pick a paragraph that does NOT already contain a link, find a natural anchor phrase, and replace it with [anchor](url) markdown — DO NOT add new sentences.

Available links (use these EXACT URLs):
${fresh.slice(0, 8).map((c, i) => `${i + 1}. ${c.url}  (topic: ${c.label})`).join('\n')}

Return the FULL revised blog markdown only — no commentary, no fences. Preserve every other word, heading, list, and link unchanged.

BLOG:
"""
${content}
"""`;
  let updated: string;
  try {
    updated = (await geminiGenerate(prompt, 1)).trim();
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'LLM call failed', data: null, added: 0 };
  }
  updated = updated.replace(/^```[a-z]*\n?|```$/g, '').trim();
  if (updated.length < content.length * 0.7) {
    return { success: false, error: 'LLM returned a truncated draft — change rejected', data: null, added: 0 };
  }

  const res = await persistBlogPatch(blogId, updated, project.domain as string);
  const addedCount = ((res.data?.internal_links?.length ?? 0) - (blog.internal_links?.length ?? 0)) | 0;
  return { ...res, added: Math.max(0, addedCount) };
}

/**
 * Add credible external citations to existing claims.
 * The LLM is instructed to only insert links into sentences that already
 * make a factual or statistical claim.
 */
export async function addCitationsToBlog(
  blogId: string,
  preferredSources?: string[]
): Promise<{ success: boolean; error?: string; data: Blog | null; added: number }> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null, added: 0 };

  const { data: blog } = await supabaseAdmin.from('blogs').select('*').eq('id', blogId).single();
  if (!blog) return { success: false, error: 'Blog not found', data: null, added: 0 };
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, domain')
    .eq('id', blog.project_id)
    .eq('user_id', user.id)
    .single();
  if (!project) return { success: false, error: 'Not authorized', data: null, added: 0 };

  const sources = preferredSources?.length
    ? preferredSources.join(', ')
    : 'McKinsey, Gartner, Deloitte, SHRM, LinkedIn Talent Blog, Statista, World Economic Forum, Accenture, EY, government or peer-reviewed sources';

  const prompt = `You are an SEO editor adding inline citations to an existing blog post. Add 2–4 NEW external citation links to sentences that already make claims about industry data, statistics, hiring trends, market size, or workplace research.

Rules:
1. Only add a link where there is already a claim that benefits from sourcing — don't fabricate new sentences.
2. Cite ONLY: ${sources}.
3. Use the publication's main domain (e.g. https://www.mckinsey.com) — do NOT make up deep article URLs.
4. Each citation = inline markdown link [anchor](url) inserted into the existing sentence as the source of the claim.
5. Skip sentences that already have a link.
6. Preserve every word, heading, paragraph break, list, and existing link.
7. Return the FULL revised blog markdown only — no commentary.

BLOG:
"""
${blog.content}
"""`;
  let updated: string;
  try {
    updated = (await geminiGenerate(prompt, 1)).trim();
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'LLM call failed', data: null, added: 0 };
  }
  updated = updated.replace(/^```[a-z]*\n?|```$/g, '').trim();
  if (updated.length < (blog.content as string).length * 0.7) {
    return { success: false, error: 'LLM returned a truncated draft — change rejected', data: null, added: 0 };
  }

  const res = await persistBlogPatch(blogId, updated, project.domain as string);
  const before = blog.external_links?.length ?? 0;
  const after = res.data?.external_links?.length ?? 0;
  return { ...res, added: Math.max(0, after - before) };
}

/**
 * Apply the user's free-form instruction to the entire blog (smaller-scope
 * fallback when the user's request doesn't match a paragraph or section).
 *
 * Used for instructions like "make the tone more conversational" or
 * "tighten the intro and use fewer adjectives".
 */
export async function applyBlogInstruction(
  blogId: string,
  instruction: string
): Promise<{ success: boolean; error?: string; data: Blog | null }> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null };
  if (!instruction?.trim()) return { success: false, error: 'Missing instruction', data: null };

  const { data: blog } = await supabaseAdmin.from('blogs').select('*').eq('id', blogId).single();
  if (!blog) return { success: false, error: 'Blog not found', data: null };
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, domain')
    .eq('id', blog.project_id)
    .eq('user_id', user.id)
    .single();
  if (!project) return { success: false, error: 'Not authorized', data: null };

  const prompt = `You are an editor making a SMALL targeted change to an existing blog post. Apply the user's instruction MINIMALLY — only modify the parts the instruction asks about. Preserve all other content, headings, links, FAQ, and meta exactly.

User instruction:
"${instruction.trim()}"

Current blog:
"""
${blog.content}
"""

Return the FULL revised blog markdown only — no commentary, no code fences.`;
  let updated: string;
  try {
    updated = (await geminiGenerate(prompt, 1)).trim();
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'LLM call failed', data: null };
  }
  updated = updated.replace(/^```[a-z]*\n?|```$/g, '').trim();
  if (updated.length < (blog.content as string).length * 0.6) {
    return { success: false, error: 'LLM returned a truncated draft — change rejected', data: null };
  }
  return await persistBlogPatch(blogId, updated, project.domain as string);
}

export type BlogEditorRewriteTrace = Array<{ label: string; ok: boolean; ms?: number; detail?: string }>;

/**
 * Rewrite text the user selected in the visual blog editor (contentEditable).
 * Does not persist — the client replaces the selection and the user saves when ready.
 */
export async function rewriteBlogEditorSelection(
  blogId: string,
  /** Markdown excerpt from the editor (includes `[text](url)` for links). */
  selectedMarkdown: string,
  instruction: string
): Promise<{
  success: boolean;
  error?: string;
  rewritten?: string;
  trace?: BlogEditorRewriteTrace;
}> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const sel = selectedMarkdown.trim();
  const instr = instruction.trim();
  if (!sel) return { success: false, error: 'Select some text to rewrite.' };
  if (!instr) return { success: false, error: 'Add an instruction or pick a quick action.' };
  if (sel.length > 12_000) return { success: false, error: 'Selection is too long (max 12,000 characters).' };
  if (instr.length > 4_000) return { success: false, error: 'Instruction is too long.' };

  const { data: blog } = await supabaseAdmin.from('blogs').select('id, title, target_keyword, project_id').eq('id', blogId).single();
  if (!blog) return { success: false, error: 'Blog not found' };

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', blog.project_id)
    .eq('user_id', user.id)
    .single();
  if (!project) return { success: false, error: 'Not authorized' };

  const prompt = `You are rewriting a short excerpt from an existing blog post. Return ONLY the rewritten excerpt — no title lines, no preamble, no quotes around the answer, no code fences.

Blog title: ${blog.title}
Target keyword: ${blog.target_keyword}

User instruction:
"${instr}"

Selected excerpt (Markdown — rewrite this; links use [anchor text](url)):
"""
${sel}
"""

Rules:
1. Output GitHub-flavored Markdown for this excerpt only. Do not use # headings or fenced code blocks. Inline code with backticks is OK only if the original had it.
2. Preserve every hyperlink from the excerpt as Markdown [anchor](url) using the same URL. You may shorten or rephrase the anchor text if the instruction requires it, but keep the destination URL unless the instruction says to remove the link.
3. Apply the instruction faithfully while staying on-topic for this article.
4. Match the tone of a professional business blog.
5. Unless the instruction asks otherwise, keep a similar scope (do not turn one sentence into a full article).`;

  const t0 = Date.now();
  let rewritten: string;
  try {
    rewritten = (await geminiGenerate(prompt, 1)).trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'LLM call failed';
    return {
      success: false,
      error: msg,
      trace: [
        { label: '(gemini)', ok: false, ms: Date.now() - t0, detail: msg },
      ],
    };
  }
  const ms = Date.now() - t0;
  rewritten = rewritten.replace(/^"+|"+$/g, '').replace(/^```[a-z]*\n?|```$/g, '').trim();
  if (!rewritten) {
    return {
      success: false,
      error: 'Model returned empty text.',
      trace: [{ label: '(gemini)', ok: false, ms, detail: 'empty output' }],
    };
  }

  const trace: BlogEditorRewriteTrace = [
    {
      label: '(gemini)',
      ok: true,
      ms,
      detail: `chars in: ${sel.length + instr.length}, out: ${rewritten.length}`,
    },
  ];

  return { success: true, rewritten, trace };
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
    .select('id, entry_id, title, word_count, status, research_sources')
    .eq('project_id', projectId);

  const blogMap = new Map((blogs ?? []).map(b => [b.entry_id, b]));
  const combined: CalendarEntryWithBlog[] = (entries ?? []).map(entry => ({
    ...entry,
    blog: blogMap.get(entry.id) ?? null,
  }));

  return { success: true, data: combined };
}
