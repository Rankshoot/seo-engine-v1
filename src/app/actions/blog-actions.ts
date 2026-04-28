'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { generateBlogPost } from '@/lib/gemini';
import { researchKeyword } from '@/lib/research';
import { Blog, BlogStatus, CalendarEntryWithBlog } from '@/lib/types';
import type { BusinessBrief } from '@/lib/business-brief';

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

    const { data: existing } = await supabaseAdmin
      .from('blogs')
      .select('id')
      .eq('entry_id', entryId)
      .maybeSingle();

    const upsertPayload = {
      title: blogData.title,
      content: blogData.content,
      meta_description: blogData.meta_description,
      slug: blogData.slug,
      word_count: blogData.word_count,
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
  return { success: true, data: data as Blog | null };
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
  return { success: true, data: data as Blog };
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

function extractMarkdownLinks(markdown: string) {
  const external = new Set<string>();
  const internal = new Set<string>();
  const linkRe = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(markdown))) {
    const href = match[1].trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    if (/^https?:\/\//i.test(href)) external.add(href);
    else internal.add(href);
  }
  return { externalLinks: [...external], internalLinks: [...internal] };
}

export async function updateBlogContent(
  blogId: string,
  content: string,
  opts: { title?: string; metaDescription?: string } = {}
) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null };

  const cleaned = content.trim();
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
    .select('id')
    .eq('id', blog.project_id)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) return { success: false, error: 'Not authorized', data: null };

  const { externalLinks, internalLinks } = extractMarkdownLinks(cleaned);
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
