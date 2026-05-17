'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { generateBlogPost, geminiGenerate, repairBlogPost } from '@/lib/gemini';
import { researchKeyword } from '@/lib/research';
import { ArticleLibraryEntry, Blog, BlogSeoIssueKey, BlogStatus, CalendarEntryWithBlog } from '@/lib/types';
import type { BusinessBrief } from '@/lib/business-brief';
import { generateBlogImages, insertBlogImages } from '@/services/stabilityImages';
import { sanitizeBlogContent } from '@/lib/blog-content';
import { formatContentHealthAuditForWriter, parseContentHealthRepairPlan } from '@/lib/content-health-calendar';
import { hybridReadUrl } from '@/services/hybridScraper';
import type { BlogAuditAnalysis } from '@/lib/content-audit';
import { stripEmptyFragmentAnchorTags } from '@/lib/blog-content';
import {
  applyLinkUpdatesToMarkdown,
  enrichSelectionLinks,
  extractInlineMarkdownLinks,
  extractSafeUrlsFromText,
  instructionWantsNewLinkWithoutExactUrl,
  extractDisplayTextFromRewriteResponse,
  looksLikeRewriteJson,
  parseAIRewriteResponse,
  parseBlogEditorRewriteStructuredResponse,
  parseMultiLinkRewriteIntent,
  replaceMarkdownLinkTargetHref,
  resolveForcedSingleLinkHrefUpdate,
  hrefKeyForRewrite,
  type BlogEditorRewriteAction,
  type BlogEditorRewriteLinkUpdate,
} from '@/lib/blog-editor-rewrite-selection';
import { validateUrl } from '@/lib/validate-url';
import { normalizeDomain } from '@/lib/jina';
import {
  classifyLinkReplacementType,
  resolveReplacementLinks,
  type LinkReplacementRow,
  type ReplacementLinkCandidate,
  type ResolvedLinkOption,
} from '@/services/linkResolver';
import { runWithUsageLogContext } from '@/lib/admin/logging/log-context';

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

  return runWithUsageLogContext(
    { userId: user.id, projectId: entry.project_id, feature: 'blog_generate' },
    async () => {
  try {
    const { assertProjectContentCapacity } = await import('@/lib/admin/platform-settings-runtime');
    await assertProjectContentCapacity(entry.project_id);

    // Load the cached Business Brief — used for internal-link pools + repair tone.
    let brief: BusinessBrief | null = null;
    try {
      const { data: briefRow } = await supabaseAdmin
        .from('project_briefs')
        .select('brief')
        .eq('project_id', entry.project_id)
        .maybeSingle();
      brief = (briefRow?.brief as BusinessBrief | undefined) ?? null;
    } catch {
      /* optional */
    }

    const contentHealthRaw = (entry as { content_health_audit?: unknown }).content_health_audit;
    const repairPlan = parseContentHealthRepairPlan(contentHealthRaw);

    // ── Content Health → repair mode (same pipeline as audit "Repair with AI") ──
    if (repairPlan) {
      const analysis = repairPlan.analysis;
      const fresh = await hybridReadUrl(repairPlan.url, { timeoutMs: 25_000 });
      if (!fresh.ok || fresh.markdown.length < 400) {
        throw new Error(
          fresh.error ||
            'Could not read the reference article for repair. Check the URL is public, then re-run the audit and try again.'
        );
      }

      const fromAudit = (analysis.internal_link_opportunities ?? []).map(i => i.target_url);
      const fromBrief = (brief?.internal_link_candidates ?? []).map(c => c.url);
      const fromBriefBlogs = brief?.blog_urls ?? [];
      const internalLinkPool = Array.from(new Set([...fromAudit, ...fromBrief, ...fromBriefBlogs])).filter(
        u => u && u !== repairPlan.url
      );

      const repaired = await repairBlogPost({
        sourceUrl: repairPlan.url,
        originalTitle: repairPlan.title || '',
        originalMarkdown: fresh.markdown,
        issues: analysis.issues.map(i => ({
          label: i.label,
          detail: i.detail,
          fix: i.fix,
          severity: i.severity,
          why_it_matters: i.why_it_matters,
        })),
        contentGaps: analysis.content_gaps ?? [],
        internalLinkPool,
        primaryKeyword: analysis.primary_keyword || repairPlan.primary_keyword || entry.focus_keyword,
        secondaryKeywords: analysis.secondary_keywords ?? [],
        brief,
        project,
        wordCount: Math.min(4000, Math.max(1200, countWords(fresh.markdown) + 200)),
      });

      const preserveTitle = !repairTitleNeedsRepairFlag(analysis) && Boolean(repairPlan.title);
      const finalTitle = preserveTitle ? repairPlan.title : repaired.title;
      const rawMarkdown = preserveTitle ? replaceFirstH1(repaired.content, repairPlan.title) : repaired.content;
      const finalMetaDescription = repairMetaNeedsRepairFlag(analysis)
        ? repaired.meta_description
        : (analysis.summary || repaired.meta_description);
      const repairNotes = normalizeRepairNotesFromModel(repaired.repair_notes, analysis);

      const images = await generateBlogImages({
        title: finalTitle,
        targetKeyword: entry.focus_keyword,
        articleType: entry.article_type,
        niche: project.niche,
        audience: project.target_audience,
        company: project.company,
        wordCount: countWords(rawMarkdown),
      });
      const contentWithImages = sanitizeBlogMarkdown(insertBlogImages(rawMarkdown, images));
      const sanitized = await sanitizeBlogContent(contentWithImages, {
        ownDomain: project.domain ?? '',
      });
      if (sanitized.removedLinks.length) {
        console.log(
          `[blog repair] dropped ${sanitized.removedLinks.length} dead external link(s) from "${finalTitle}":`,
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
        title: finalTitle,
        content: finalContent,
        meta_description: finalMetaDescription,
        slug: repaired.slug,
        word_count: finalWordCount,
        target_keyword: entry.focus_keyword,
        article_type: 'Repair',
        status: 'generated' as const,
        research_sources: repaired.research_sources,
        external_links: sanitized.externalLinks.slice(0, 10),
        internal_links: sanitized.internalLinks.slice(0, 12),
        source_url: repairPlan.url,
        repair_notes: repairNotes,
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
        .update({ status: 'generated', title: finalTitle, article_type: 'Repair' })
        .eq('id', entryId);

      return { success: true, data: blog };
    }

    // ── Standard net-new generation ─────────────────────────────────────────
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
      /* optional */
    }

    const auditWriterBlock = formatContentHealthAuditForWriter(contentHealthRaw);
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
      source_url: '',
      repair_notes: [] as string[],
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
  });
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

  if (error || !data) return { success: false, error: error?.message ?? 'Not found', data: null };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', data.project_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (pErr || !project) return { success: false, error: 'Not found', data: null };

  return { success: true, data: { ...data, content: sanitizeBlogMarkdown(data.content ?? '') } as Blog };
}

/**
 * Look up the most recent "enhanced" version of a blog — i.e. a Repair-type
 * blog whose `source_url` points back at the original (`blog://<id>`).
 *
 * Used by the blog viewer to restore the Before / After comparison toggle
 * when a user re-opens a blog they previously enhanced via Content Health
 * → Analyse content → Generate enhanced. Returns `data: null` (with
 * `success: true`) when no enhanced version exists for this blog.
 */
export async function getEnhancedBlogForOriginal(originalBlogId: string) {
  const user = await currentUser();
  if (!user) {
    return { success: false as const, error: 'Not authenticated', data: null };
  }

  // 1. Confirm the caller owns the original blog (prevents IDOR — we use
  //    the source_url marker, which is otherwise scoped only by project).
  const { data: original, error: oErr } = await supabaseAdmin
    .from('blogs')
    .select('id, project_id')
    .eq('id', originalBlogId)
    .maybeSingle();

  if (oErr || !original) {
    return { success: false as const, error: 'Blog not found', data: null };
  }

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', original.project_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (pErr || !project) {
    return { success: false as const, error: 'Not authorized', data: null };
  }

  // 2. The enhanced row is inserted with `source_url = "blog://<originalId>"`
  //    (see `repairBlogFromContent` in `repair-actions.ts`). Pull the most
  //    recent one — there should usually only be one, but if the user
  //    re-enhances we want the freshest copy.
  const sourceMarker = `blog://${originalBlogId}`;
  const { data: enhanced, error: eErr } = await supabaseAdmin
    .from('blogs')
    .select('*')
    .eq('project_id', original.project_id)
    .eq('article_type', 'Repair')
    .eq('source_url', sourceMarker)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eErr) {
    return { success: false as const, error: eErr.message, data: null };
  }
  if (!enhanced) {
    return { success: true as const, data: null };
  }

  return {
    success: true as const,
    data: { ...enhanced, content: sanitizeBlogMarkdown(enhanced.content ?? '') } as Blog,
  };
}

export async function getArticlesLibraryForProject(projectId: string) {
  const user = await currentUser();
  if (!user) return { success: false as const, error: 'Not authenticated', data: [] as ArticleLibraryEntry[] };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (pErr || !project) return { success: false as const, error: 'Project not found', data: [] as ArticleLibraryEntry[] };

  const { data, error } = await supabaseAdmin
    .from('blogs')
    .select('id, title, target_keyword, article_type, status, created_at, updated_at')
    .eq('project_id', projectId)
    .eq('in_articles_library', true)
    .in('status', ['generated', 'approved', 'published'])
    .order('updated_at', { ascending: false });

  if (error) {
    if (/in_articles_library|schema cache/i.test(error.message)) {
      return { success: true as const, data: [] as ArticleLibraryEntry[] };
    }
    return { success: false as const, error: error.message, data: [] as ArticleLibraryEntry[] };
  }

  return { success: true as const, data: (data ?? []) as ArticleLibraryEntry[] };
}

/** Instant / web-research drafts created from Content Generator (`article_type` prefix). */
const INSTANT_ARTICLE_TYPE_PREFIX = 'Instant ·';

export async function getContentGeneratorHistoryForProject(projectId: string) {
  const user = await currentUser();
  if (!user) return { success: false as const, error: 'Not authenticated', data: [] as ArticleLibraryEntry[] };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (pErr || !project) return { success: false as const, error: 'Project not found', data: [] as ArticleLibraryEntry[] };

  const historyQuery = (columns: string) =>
    supabaseAdmin
      .from('blogs')
      .select(columns)
      .eq('project_id', projectId)
      .like('article_type', `${INSTANT_ARTICLE_TYPE_PREFIX}%`)
      .in('status', ['generated', 'approved', 'published'])
      .order('updated_at', { ascending: false });

  // Full query — includes the FK relation `calendar_entries(scheduled_date)`
  // so the UI can show "Scheduled for ..." instead of "Schedule".
  const FULL_COLS =
    'id, title, target_keyword, article_type, status, created_at, updated_at, in_articles_library, entry_id, calendar_entries:entry_id(scheduled_date)';
  let { data, error } = await historyQuery(FULL_COLS);

  // Older databases may not have `in_articles_library` yet — fall back.
  if (error && /in_articles_library|schema cache/i.test(error.message)) {
    const second = await historyQuery(
      'id, title, target_keyword, article_type, status, created_at, updated_at, entry_id, calendar_entries:entry_id(scheduled_date)'
    );
    data = second.data;
    error = second.error;
  }
  // If the FK embed itself isn't available, retry without it.
  if (error && /calendar_entries|relationship/i.test(error.message)) {
    const third = await historyQuery(
      'id, title, target_keyword, article_type, status, created_at, updated_at, in_articles_library, entry_id'
    );
    data = third.data;
    error = third.error;
  }

  if (error) return { success: false as const, error: error.message, data: [] as ArticleLibraryEntry[] };

  // Flatten the embedded calendar relation into a top-level scheduled_date.
  type EmbeddedRow = ArticleLibraryEntry & {
    in_articles_library?: boolean;
    entry_id?: string | null;
    // Supabase returns embedded relations as either a single object or array.
    calendar_entries?: { scheduled_date: string } | { scheduled_date: string }[] | null;
  };
  const rows = ((data ?? []) as unknown as EmbeddedRow[]).map((r) => {
    const sched = Array.isArray(r.calendar_entries)
      ? r.calendar_entries[0]?.scheduled_date
      : r.calendar_entries?.scheduled_date;
    const { calendar_entries: _unused, ...rest } = r;
    void _unused;
    return { ...rest, scheduled_date: sched ?? null };
  });
  return { success: true as const, data: rows };
}

/**
 * Pin the current blog to the project Articles list. Idempotent if already saved.
 * Uses `select('*')` so this still loads the row before `in_articles_library` exists in DB
 * (explicit `select(..., in_articles_library)` makes PostgREST error and looked like "Blog not found").
 */
export async function addBlogToArticlesLibrary(blogId: string) {
  const user = await currentUser();
  if (!user) return { success: false as const, error: 'Not authenticated', alreadySaved: false };

  const id = blogId?.trim();
  if (!id) return { success: false as const, error: 'Missing blog id', alreadySaved: false };

  const { data: row, error: bErr } = await supabaseAdmin
    .from('blogs')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (bErr) {
    return { success: false as const, error: bErr.message, alreadySaved: false };
  }
  if (!row) {
    return { success: false as const, error: 'Blog not found', alreadySaved: false };
  }

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', row.project_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (pErr || !project) return { success: false as const, error: 'Not authorized', alreadySaved: false };

  const already = Boolean((row as { in_articles_library?: boolean }).in_articles_library);
  if (already) {
    return { success: true as const, alreadySaved: true };
  }

  const { data: updated, error: uErr } = await supabaseAdmin
    .from('blogs')
    .update({ in_articles_library: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (uErr) {
    const hint =
      /in_articles_library|schema cache/i.test(uErr.message)
        ? ' Run the SQL migration `supabase-migration-blog-in-articles-library.sql` on your Supabase project.'
        : '';
    return { success: false as const, error: `${uErr.message}${hint}`, alreadySaved: false };
  }

  if (!updated) {
    return {
      success: false as const,
      error: 'Update did not apply. Confirm the blog exists and `in_articles_library` is enabled in Supabase.',
      alreadySaved: false,
    };
  }

  return { success: true as const, alreadySaved: false };
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

function repairTitleNeedsRepairFlag(analysis: BlogAuditAnalysis): boolean {
  return analysis.issues.some(i =>
    /title|h1|headline|keyword in title|target keyword/i.test(`${i.label} ${i.detail} ${i.fix}`)
  );
}

function repairMetaNeedsRepairFlag(analysis: BlogAuditAnalysis): boolean {
  return analysis.issues.some(i =>
    /meta description|meta tag|description/i.test(`${i.label} ${i.detail} ${i.fix}`)
  );
}

function normalizeRepairNotesFromModel(notes: string[], analysis: BlogAuditAnalysis): string[] {
  const cleaned = notes.map(n => n.trim()).filter(Boolean);
  const hasDone = cleaned.some(n => /^done:/i.test(n));
  const hasStill = cleaned.some(n => /^still to do:/i.test(n));
  const done = hasDone
    ? cleaned.filter(n => /^done:/i.test(n))
    : analysis.issues.slice(0, 6).map(i => `Done: ${i.fix || i.label}`);
  const still = hasStill
    ? cleaned.filter(n => /^still to do:/i.test(n))
    : [
        'Still to do: none — re-run Content Health after publishing to verify the fixes.',
      ];
  return [...done, ...still].slice(0, 10);
}

function sanitizeBlogMarkdown(markdown: string): string {
  return stripEmptyFragmentAnchorTags(stripSchemaJsonBlocks(markdown))
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

export type RewriteBlogEditorSelectionMeta = {
  plainText?: string;
  htmlFragment?: string;
  links?: Array<{
    id?: string;
    anchorText: string;
    href: string;
    type?: 'internal' | 'external';
  }>;
  /** Client picked a verified replacement URL — re-validated server-side before apply. */
  prefValidatedInternalUrl?: string;
  prefValidatedReplacementUrl?: string;
  /** Per-link verified replacements from the UI (multi-link). */
  prefValidatedReplacements?: Array<{ linkId: string; newHref: string }>;
};

async function validateUrlForRewriter(
  url: string
): Promise<
  { ok: true; href: string; status: number } | { ok: false; message: string; status?: number }
> {
  const v = await validateUrl(url, 12_000);
  if (!v.isValid || v.status === undefined || v.status < 200 || v.status >= 400) {
    return {
      ok: false,
      message: v.reason ?? 'This URL is not reachable. Please use a working URL.',
      status: v.status,
    };
  }
  return { ok: true, href: v.finalUrl ?? url, status: v.status };
}

async function assertRewrittenMarkdownHrefsReachable(
  rewritten: string,
  baselineHrefKeys: Set<string>,
  preApprovedHrefKeys: Set<string>
): Promise<{ ok: true } | { ok: false; error: string; href?: string; status?: number }> {
  const found = extractInlineMarkdownLinks(rewritten);
  for (const { href } of found) {
    const key = hrefKeyForRewrite(href);
    if (baselineHrefKeys.has(key)) continue;
    if (preApprovedHrefKeys.has(key)) continue;
    const chk = await validateUrlForRewriter(href);
    if (!chk.ok) {
      const msg =
        chk.status === 404 || chk.status === 410
          ? 'This link returns 404. Choose another link.'
          : chk.message;
      return { ok: false, error: msg, href, status: chk.status };
    }
    preApprovedHrefKeys.add(hrefKeyForRewrite(chk.href));
  }
  return { ok: true };
}

/**
 * Rewrite text the user selected in the visual blog editor (contentEditable).
 * Does not persist — the client replaces the selection and the user saves when ready.
 */
export async function rewriteBlogEditorSelection(
  blogId: string,
  /** Markdown excerpt from the editor (includes `[text](url)` for links). */
  selectedMarkdown: string,
  instruction: string,
  meta: RewriteBlogEditorSelectionMeta = {}
): Promise<{
  success: boolean;
  error?: string;
  rewritten?: string;
  action?: BlogEditorRewriteAction;
  linkUpdates?: BlogEditorRewriteLinkUpdate[];
  linkUpdatesDetail?: Array<
    BlogEditorRewriteLinkUpdate & {
      isValidated?: boolean;
      validationStatus?: number;
      validationReason?: string;
    }
  >;
  linkResolution?: { url?: string; status?: number; reason?: string; linkType?: 'internal' | 'external' };
  linkResolutions?: Array<{
    linkId: string;
    oldHref: string;
    newHref: string;
    type: 'internal' | 'external';
    status: number;
    reason: string;
  }>;
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

  const { data: blog } = await supabaseAdmin
    .from('blogs')
    .select('id, title, target_keyword, project_id')
    .eq('id', blogId)
    .single();
  if (!blog) return { success: false, error: 'Blog not found' };

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, domain, target_region, target_language')
    .eq('id', blog.project_id)
    .eq('user_id', user.id)
    .single();
  if (!project?.domain) return { success: false, error: 'Not authorized' };

  const detectedLinks = enrichSelectionLinks(
    meta.links && meta.links.length > 0 ? meta.links : extractInlineMarkdownLinks(sel),
    project.domain as string
  );
  const plain = (meta.plainText ?? '').trim();
  const multiIntent = parseMultiLinkRewriteIntent(instr, detectedLinks);
  const baselineHrefKeys = new Set(detectedLinks.map(l => hrefKeyForRewrite(l.href)));
  const preApprovedHrefKeys = new Set<string>();

  for (const u of extractSafeUrlsFromText(instr)) {
    if (baselineHrefKeys.has(hrefKeyForRewrite(u))) continue;
    const vx = await validateUrlForRewriter(u);
    if (!vx.ok) {
      return {
        success: false,
        error: 'This URL is not reachable. Please use a working URL.',
        trace: [{ label: '(instruction-url)', ok: false, detail: u }],
      };
    }
    preApprovedHrefKeys.add(hrefKeyForRewrite(vx.href));
  }

  let machineResolvedHref: string | null = null;
  let machineResolvedTitle = '';
  let machineResolvedStatus = 0;
  let resolvedLinkType: 'internal' | 'external' | null = null;
  let resolverCandidates: ReplacementLinkCandidate[] = [];
  let machineLinkRows: LinkReplacementRow[] = [];
  let addedLinksForPrompt: Array<{ href: string; anchorText: string; type: string }> = [];
  const wantsVagueResolver =
    instructionWantsNewLinkWithoutExactUrl(instr) && detectedLinks.length > 0;

  const prefUrl = (meta.prefValidatedReplacementUrl ?? meta.prefValidatedInternalUrl)?.trim();
  const resolverBase = {
    surroundingText: plain || sel,
    projectDomain: project.domain as string,
    projectId: blog.project_id,
    prompt: instr,
    topic: `${blog.target_keyword} ${blog.title}`,
    region: (project.target_region as string) || 'us',
    language: (project.target_language as string) || 'en',
  };

  const selectedForResolver = detectedLinks.map(l => ({
    id: l.id!,
    anchorText: l.anchorText,
    href: l.href,
    type: (l.type ?? classifyLinkReplacementType(l.href, project.domain as string)) as
      | 'internal'
      | 'external',
  }));

  if (meta.prefValidatedReplacements?.length) {
    for (const pref of meta.prefValidatedReplacements) {
      const link = detectedLinks.find(l => l.id === pref.linkId);
      if (!link) continue;
      const vx = await validateUrlForRewriter(pref.newHref);
      if (!vx.ok) {
        return {
          success: false,
          error: vx.message,
          trace: [{ label: '(pref-url)', ok: false, detail: pref.linkId }],
        };
      }
      machineLinkRows.push({
        linkId: link.id!,
        oldHref: link.href,
        oldAnchorText: link.anchorText,
        newHref: vx.href,
        newAnchorText: link.anchorText,
        type: link.type as 'internal' | 'external',
        reason: 'User-selected verified link',
        status: vx.status,
        relevanceScore: 0,
      });
      preApprovedHrefKeys.add(hrefKeyForRewrite(vx.href));
    }
  } else if (prefUrl && detectedLinks.length === 1) {
    const vx = await validateUrlForRewriter(prefUrl);
    if (!vx.ok) {
      return {
        success: false,
        error: vx.message,
        trace: [{ label: '(pref-url)', ok: false, detail: prefUrl }],
      };
    }
    const link = detectedLinks[0];
    machineLinkRows = [
      {
        linkId: link.id!,
        oldHref: link.href,
        oldAnchorText: link.anchorText,
        newHref: vx.href,
        newAnchorText: link.anchorText,
        type: link.type as 'internal' | 'external',
        reason: 'Selected suggestion',
        status: vx.status,
        relevanceScore: 0,
      },
    ];
    preApprovedHrefKeys.add(hrefKeyForRewrite(vx.href));
  } else if (multiIntent.mode === 'replace_links' && wantsVagueResolver) {
    const targetIds =
      multiIntent.targetLinkIds ?? selectedForResolver.map(l => l.id);
    const multi = await resolveReplacementLinks({
      ...resolverBase,
      selectedLinks: selectedForResolver,
      forceType: multiIntent.forceType,
      linkIds: targetIds,
    });

    for (const c of Object.values(multi.candidatesByLinkId)) {
      resolverCandidates.push(...c);
    }
    machineLinkRows = multi.replacements;
    addedLinksForPrompt = multi.addedLinks.map(a => ({
      href: a.href,
      anchorText: a.anchorText,
      type: a.type,
    }));

    if (multi.replacements.length === 0 && multi.errors.length > 0) {
      const internalFail = multi.errors.some(e => e.type === 'internal');
      const externalFail = multi.errors.some(e => e.type === 'external');
      const msg =
        internalFail && externalFail
          ? 'No verified internal replacement found. No verified credible external source found.'
          : internalFail
            ? 'No verified internal replacement found.'
            : 'No verified credible external source found.';
      return {
        success: false,
        error: msg,
        action: 'needs_url',
        trace: [{ label: '(link-resolver)', ok: false, detail: msg }],
      };
    }

    for (const row of machineLinkRows) {
      preApprovedHrefKeys.add(hrefKeyForRewrite(row.newHref));
      resolvedLinkType = row.type;
    }
  } else if (multiIntent.mode === 'add_links') {
    const multi = await resolveReplacementLinks({
      ...resolverBase,
      selectedLinks: selectedForResolver,
      forceType: multiIntent.forceType,
      linkIds: [],
    });
    addedLinksForPrompt = multi.addedLinks.map(a => ({
      href: a.href,
      anchorText: a.anchorText,
      type: a.type,
    }));
    for (const c of Object.values(multi.candidatesByLinkId)) {
      resolverCandidates.push(...c);
    }
    for (const a of multi.addedLinks) {
      preApprovedHrefKeys.add(hrefKeyForRewrite(a.href));
    }
  }

  if (machineLinkRows.length === 1) {
    machineResolvedHref = machineLinkRows[0].newHref;
    machineResolvedTitle = machineLinkRows[0].reason;
    machineResolvedStatus = machineLinkRows[0].status;
    resolvedLinkType = machineLinkRows[0].type;
  }

  const linksJson = JSON.stringify(detectedLinks, null, 0);
  const htmlFrag = (meta.htmlFragment ?? '').trim();
  const htmlBlock =
    htmlFrag && htmlFrag.length <= 8000
      ? `\nOptional HTML fragment (context for links/formatting; do not paste verbatim):\n"""\n${htmlFrag}\n"""\n`
      : '';

  const verifiedPoolJson = JSON.stringify(
    resolverCandidates.slice(0, 24).map(c => ({
      url: c.url,
      title: c.title,
      domain: c.domain,
      status: c.status,
    })),
    null,
    0
  );

  const resolutionBlock =
    machineLinkRows.length > 0
      ? `
Server-resolved link replacements (HTTP-validated). Use these EXACT newHref values in linkUpdates and rewrittenMarkdown:
${JSON.stringify(
  machineLinkRows.map(r => ({
    linkId: r.linkId,
    oldHref: r.oldHref,
    newHref: r.newHref,
    oldAnchorText: r.oldAnchorText,
    newAnchorText: r.newAnchorText,
    type: r.type,
    status: r.status,
  })),
  null,
  2
)}
Never swap internal vs external link type unless the user explicitly asked (e.g. "change to external").
Do not invent URLs.
`
      : machineResolvedHref
        ? `
Server-resolved ${resolvedLinkType ?? 'verified'} link (already HTTP-validated). Use this EXACT href when the user asked for a different / better / relevant / credible link without pasting a URL:
- href: ${machineResolvedHref}
- title hint: ${machineResolvedTitle}
- link type: ${resolvedLinkType ?? 'unknown'}
Never replace an internal company link with an external URL (or vice versa) unless the user explicitly asked to switch link type.
Do not invent URLs.
`
        : addedLinksForPrompt.length > 0
          ? `
Additional verified links to insert (HTTP-validated; use verbatim href + anchorText where appropriate):
${JSON.stringify(addedLinksForPrompt, null, 2)}
Do not invent URLs.
`
          : '';

  const prompt = `You are rewriting a short excerpt from an existing blog post.

Blog title: ${blog.title}
Target keyword: ${blog.target_keyword}

User instruction:
"""
${instr}
"""

Selection — plain text (may omit link URLs):
"""
${plain || '(not provided)'}
"""

Selection — Markdown excerpt (source of truth for links; format is [anchor text](url)):
"""
${sel}
"""

Detected links as JSON (anchor + href from the Markdown excerpt):
${linksJson}
${htmlBlock}
${resolutionBlock}

VERIFIED_INTERNAL_URL_POOL and VERIFIED_EXTERNAL_URL_POOL (combined; only these may be used as brand-new link targets if the user did not paste a URL; do not invent others):
${verifiedPoolJson}

Return ONLY a single JSON object (valid JSON, no markdown outside it, no code fences) with exactly this shape:
{
  "action": "replace_text" | "update_link" | "update_text_and_link" | "needs_url",
  "rewrittenMarkdown": "<GitHub-flavored Markdown for the excerpt only>",
  "rewrittenHtml": "<same as rewrittenMarkdown — optional duplicate for tools>",
  "linkUpdates": [
    {
      "oldHref": "string",
      "newHref": "string",
      "oldAnchorText": "string",
      "newAnchorText": "string",
      "isValidated": true,
      "validationStatus": 200,
      "reason": "optional"
    }
  ]
}

Critical URL rules:
1. Do NOT invent URLs, paths, or slugs. Never guess a URL.
2. If the user did not paste an http(s) URL and asked for a different/relevant/better/credible link, use ONLY hrefs from the verified URL pool or the server-resolved link block above.
3. Keep link type consistent: internal company pages for internal links; credible external sources for external links — unless the user explicitly asked to switch type.
4. If no suitable verified URL exists, return action "needs_url" and explain briefly in linkUpdates[0].reason (no fake href).
5. If the user pasted a URL, use that exact string in newHref and rewrittenMarkdown.
6. rewrittenMarkdown must be GitHub-flavored Markdown for this excerpt only. No # headings or fenced code blocks unless already in the excerpt style.

Other rules:
- When keeping the same URL, preserve href exactly unless the instruction changes it.
- Match a professional business blog tone.
- Keep similar scope unless asked to expand.`;

  const t0 = Date.now();
  let raw: string;
  try {
    raw = (await geminiGenerate(prompt, 1)).trim();
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
  raw = raw.replace(/^"+|"+$/g, '').trim();

  const aiParsed = parseAIRewriteResponse(raw);
  const structured = aiParsed
    ? {
        action: aiParsed.action,
        rewrittenMarkdown: aiParsed.rewrittenMarkdown,
        linkUpdates: aiParsed.linkUpdates,
      }
    : parseBlogEditorRewriteStructuredResponse(raw);
  if (structured?.action === 'needs_url') {
    const needsMsg =
      resolvedLinkType === 'external'
        ? 'No verified credible external source found.'
        : resolvedLinkType === 'internal'
          ? 'No relevant working internal blog link found.'
          : 'No suitable verified link is available. Paste a full http(s) URL you want to use.';
    return {
      success: false,
      error: needsMsg,
      action: 'needs_url',
      trace: [{ label: '(gemini)', ok: true, ms, detail: 'needs_url' }],
    };
  }

  let rewritten = aiParsed?.displayText ?? structured?.rewrittenMarkdown ?? '';
  if (!rewritten) {
    rewritten = extractDisplayTextFromRewriteResponse(raw);
  }
  if (!rewritten && looksLikeRewriteJson(raw)) {
    return {
      success: false,
      error: 'Model returned an unreadable response. Please try again.',
      trace: [{ label: '(gemini)', ok: false, ms, detail: 'json without display text' }],
    };
  }
  if (!rewritten) {
    rewritten = raw.replace(/^```[a-z]*\n?|```$/g, '').trim();
  }

  if (!rewritten) {
    return {
      success: false,
      error: 'Model returned empty text.',
      trace: [{ label: '(gemini)', ok: false, ms, detail: 'empty output' }],
    };
  }

  let action: BlogEditorRewriteAction = structured?.action ?? 'replace_text';
  const mergedUpdates: BlogEditorRewriteLinkUpdate[] = [...(structured?.linkUpdates ?? [])];

  rewritten = applyLinkUpdatesToMarkdown(rewritten, mergedUpdates);

  const forced = resolveForcedSingleLinkHrefUpdate(sel, detectedLinks, instr);
  if (forced) {
    const vForced = await validateUrlForRewriter(forced.newHref);
    if (!vForced.ok) {
      return {
        success: false,
        error: 'This URL is not reachable. Please use a working URL.',
        trace: [{ label: '(forced-url)', ok: false, detail: forced.newHref }],
      };
    }
    const canonical = vForced.href;
    rewritten = replaceMarkdownLinkTargetHref(rewritten, forced.oldHref, canonical);
    const existingIx = mergedUpdates.findIndex(u => u.oldHref === forced.oldHref);
    if (existingIx >= 0) {
      mergedUpdates[existingIx] = { ...mergedUpdates[existingIx], newHref: canonical };
    } else {
      const fromSel = detectedLinks.find(l => l.href === forced.oldHref);
      mergedUpdates.push({
        oldHref: forced.oldHref,
        newHref: canonical,
        oldAnchorText: fromSel?.anchorText ?? '',
        newAnchorText: fromSel?.anchorText ?? '',
      });
    }
    preApprovedHrefKeys.add(hrefKeyForRewrite(canonical));
    if (action === 'replace_text') action = 'update_link';
  }

  if (machineLinkRows.length > 0) {
    for (const row of machineLinkRows) {
      if (hrefKeyForRewrite(row.oldHref) === hrefKeyForRewrite(row.newHref)) continue;
      rewritten = replaceMarkdownLinkTargetHref(rewritten, row.oldHref, row.newHref);
      const ix = mergedUpdates.findIndex(u => u.oldHref === row.oldHref);
      if (ix >= 0) {
        const cur = mergedUpdates[ix];
        if (cur) mergedUpdates[ix] = { ...cur, newHref: row.newHref, newAnchorText: row.newAnchorText };
      } else {
        mergedUpdates.push({
          oldHref: row.oldHref,
          newHref: row.newHref,
          oldAnchorText: row.oldAnchorText,
          newAnchorText: row.newAnchorText,
        });
      }
      if (action === 'replace_text') action = 'update_link';
    }
  } else if (machineResolvedHref && detectedLinks.length === 1) {
    const oldOnly = detectedLinks[0].href;
    if (hrefKeyForRewrite(oldOnly) !== hrefKeyForRewrite(machineResolvedHref)) {
      rewritten = replaceMarkdownLinkTargetHref(rewritten, oldOnly, machineResolvedHref);
      const ix = mergedUpdates.findIndex(u => u.oldHref === oldOnly);
      if (ix >= 0) {
        const cur = mergedUpdates[ix];
        if (cur) mergedUpdates[ix] = { ...cur, newHref: machineResolvedHref };
      } else {
        mergedUpdates.push({
          oldHref: oldOnly,
          newHref: machineResolvedHref,
          oldAnchorText: detectedLinks[0].anchorText,
          newAnchorText: detectedLinks[0].anchorText,
        });
      }
      if (action === 'replace_text') action = 'update_link';
    }
  }

  const reach = await assertRewrittenMarkdownHrefsReachable(
    rewritten,
    baselineHrefKeys,
    preApprovedHrefKeys
  );
  if (!reach.ok) {
    return {
      success: false,
      error: reach.error,
      trace: [
        { label: '(gemini)', ok: true, ms, detail: 'blocked: href validation' },
        { label: '(href-validate)', ok: false, detail: reach.href ?? '' },
      ],
    };
  }

  const expectedTypeByHrefKey = new Map<string, 'internal' | 'external'>();
  for (const row of machineLinkRows) {
    expectedTypeByHrefKey.set(hrefKeyForRewrite(row.newHref), row.type);
  }
  if (multiIntent.forceType) {
    for (const row of machineLinkRows) {
      expectedTypeByHrefKey.set(hrefKeyForRewrite(row.newHref), multiIntent.forceType);
    }
  }

  for (const { href } of extractInlineMarkdownLinks(rewritten)) {
    const key = hrefKeyForRewrite(href);
    const expected =
      expectedTypeByHrefKey.get(key) ??
      (baselineHrefKeys.has(key)
        ? detectedLinks.find(l => hrefKeyForRewrite(l.href) === key)?.type
        : resolvedLinkType) ??
      null;
    if (!expected) continue;
    const actual = classifyLinkReplacementType(href, project.domain as string);
    if (actual !== expected) {
      return {
        success: false,
        error:
          expected === 'internal'
            ? 'No verified internal replacement found.'
            : 'No verified credible external source found.',
        trace: [
          {
            label: '(link-type)',
            ok: false,
            detail: `expected=${expected} got=${actual} href=${href}`,
          },
        ],
      };
    }
  }

  const trace: BlogEditorRewriteTrace = [
    {
      label: '(gemini)',
      ok: true,
      ms,
      detail: `json=${Boolean(structured)} chars in: ${sel.length + instr.length}, out: ${rewritten.length}`,
    },
  ];
  if (forced) {
    trace.push({
      label: '(href-enforced)',
      ok: true,
      detail: `${forced.oldHref} → ${mergedUpdates.find(u => u.oldHref === forced.oldHref)?.newHref ?? forced.newHref}`,
    });
  }
  if (machineLinkRows.length > 0) {
    trace.push({
      label: '(link-resolver)',
      ok: true,
      detail: machineLinkRows.map(r => `${r.oldHref} → ${r.newHref}`).join('; '),
    });
  } else if (machineResolvedHref) {
    trace.push({
      label: '(link-resolver)',
      ok: true,
      detail: machineResolvedHref,
    });
  }

  let linkUpdatesDetail:
    | Array<
        BlogEditorRewriteLinkUpdate & {
          isValidated?: boolean;
          validationStatus?: number;
          validationReason?: string;
        }
      >
    | undefined;
  if (mergedUpdates.length) {
    linkUpdatesDetail = await Promise.all(
      mergedUpdates.map(async u => {
        const vx = await validateUrlForRewriter(u.newHref);
        return {
          ...u,
          isValidated: vx.ok,
          validationStatus: vx.status,
          validationReason: vx.ok ? undefined : vx.message,
        };
      })
    );
  }

  return {
    success: true,
    rewritten,
    action,
    linkUpdates: mergedUpdates.length ? mergedUpdates : undefined,
    linkUpdatesDetail,
    linkResolution: machineResolvedHref
      ? {
          url: machineResolvedHref,
          status: machineResolvedStatus,
          reason: machineResolvedTitle,
          linkType: resolvedLinkType ?? undefined,
        }
      : undefined,
    trace,
  };
}

export async function resolveBlogEditorLinkAlternates(
  blogId: string,
  selectedMarkdown: string,
  meta: RewriteBlogEditorSelectionMeta = {},
  prompt = ''
): Promise<{
  success: boolean;
  error?: string;
  linkType?: 'internal' | 'external';
  candidates?: ReplacementLinkCandidate[];
  selectedUrl?: string;
  replacements?: LinkReplacementRow[];
  addedLinks?: Array<{ href: string; anchorText: string; type: 'internal' | 'external'; reason: string; status: number }>;
  candidatesByLinkId?: Record<string, ReplacementLinkCandidate[]>;
  resolverErrors?: Array<{ linkId: string; type: 'internal' | 'external'; message: string }>;
  /** @deprecated */ legacyCandidates?: ResolvedLinkOption[];
  trace?: BlogEditorRewriteTrace;
}> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const sel = selectedMarkdown.trim();
  if (!sel) return { success: false, error: 'Select some text first.' };

  const { data: blog } = await supabaseAdmin
    .from('blogs')
    .select('id, title, target_keyword, project_id')
    .eq('id', blogId)
    .single();
  if (!blog) return { success: false, error: 'Blog not found' };

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, domain, target_region, target_language')
    .eq('id', blog.project_id)
    .eq('user_id', user.id)
    .single();
  if (!project?.domain) return { success: false, error: 'Not authorized' };

  const detectedLinks = enrichSelectionLinks(
    meta.links && meta.links.length > 0 ? meta.links : extractInlineMarkdownLinks(sel),
    project.domain as string
  );
  if (detectedLinks.length === 0) {
    return { success: false, error: 'Select text that contains at least one link.' };
  }

  const instr = prompt.trim() || 'find a relevant replacement link';
  const multiIntent = parseMultiLinkRewriteIntent(instr, detectedLinks);
  const selectedForResolver = detectedLinks.map(l => ({
    id: l.id!,
    anchorText: l.anchorText,
    href: l.href,
    type: (l.type ?? classifyLinkReplacementType(l.href, project.domain as string)) as
      | 'internal'
      | 'external',
  }));
  const targetIds =
    multiIntent.targetLinkIds ??
    selectedForResolver.map(l => l.id);

  const t0 = Date.now();
  const plain = (meta.plainText ?? '').trim();
  const multi = await resolveReplacementLinks({
    selectedLinks: selectedForResolver,
    surroundingText: plain || sel,
    projectDomain: project.domain as string,
    projectId: blog.project_id,
    prompt: instr,
    forceType: multiIntent.forceType,
    linkIds: multiIntent.mode === 'add_links' ? [] : targetIds,
    topic: `${blog.target_keyword} ${blog.title}`,
    region: (project.target_region as string) || 'us',
    language: (project.target_language as string) || 'en',
  });

  const trace: BlogEditorRewriteTrace = [
    {
      label: '(link-resolver)',
      ok: multi.replacements.length > 0 || Object.values(multi.candidatesByLinkId).some(c => c.length > 0),
      ms: Date.now() - t0,
      detail: `replacements=${multi.replacements.length} errors=${multi.errors.length}`,
    },
  ];

  const hasAnyCandidate = Object.values(multi.candidatesByLinkId).some(c => c.length > 0);
  if (!multi.replacements.length && !hasAnyCandidate && multi.addedLinks.length === 0) {
    const internalFail = multi.errors.some(e => e.type === 'internal');
    const externalFail = multi.errors.some(e => e.type === 'external');
    const msg =
      internalFail && externalFail
        ? 'No verified internal replacement found. No verified credible external source found.'
        : internalFail
          ? 'No verified internal replacement found.'
          : 'No verified credible external source found.';
    return {
      success: false,
      error: msg,
      resolverErrors: multi.errors,
      candidatesByLinkId: multi.candidatesByLinkId,
      trace,
    };
  }

  const singleId = detectedLinks.length === 1 ? detectedLinks[0].id! : null;
  const singleCandidates = singleId ? multi.candidatesByLinkId[singleId] : undefined;
  const legacyCandidates: ResolvedLinkOption[] | undefined = singleCandidates?.map(c => ({
    url: c.url,
    title: c.title,
    reason: c.reason,
    relevanceScore: c.relevanceScore,
    status: c.status,
  }));

  return {
    success: true,
    linkType: detectedLinks.length === 1 ? selectedForResolver[0].type : undefined,
    candidates: singleCandidates,
    selectedUrl: multi.replacements[0]?.newHref,
    replacements: multi.replacements,
    addedLinks: multi.addedLinks,
    candidatesByLinkId: multi.candidatesByLinkId,
    resolverErrors: multi.errors.length ? multi.errors : undefined,
    legacyCandidates,
    trace,
  };
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

  const blogMap = new Map(
    (blogs ?? [])
      .filter((b): b is typeof b & { entry_id: string } => Boolean(b.entry_id))
      .map(b => [b.entry_id, b])
  );
  const combined: CalendarEntryWithBlog[] = (entries ?? []).map(entry => ({
    ...entry,
    blog: blogMap.get(entry.id) ?? null,
  }));

  return { success: true, data: combined };
}

// ─── Blog content analysis ────────────────────────────────────────────────

export type BlogContentIssue = {
  label: string;
  detail: string;
  fix: string;
  severity: "high" | "medium" | "low";
  category: "technical" | "seo" | "content" | "ux";
};

export type BlogContentRubricRow = {
  id: string;
  label: string;
  detail: string;
  status: "pass" | "warn" | "fail";
};

export type BlogContentAnalysis = {
  summary: string;
  plain_language_verdict: string;
  conclusion: {
    verdict: "ready_to_publish" | "needs_minor_fixes" | "needs_major_work";
    summary: string;
  };
  issues: BlogContentIssue[];
  quality_rubric: BlogContentRubricRow[];
  content_gaps: string[];
  quick_wins: string[];
};

/**
 * Analyze a blog post's content with Gemini.
 * Content-only diagnosis — no URL scraping, no keyword demand data.
 */
export async function analyzeBlogContent(
  blogId: string
): Promise<{ success: true; analysis: BlogContentAnalysis } | { success: false; error: string }> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: blog, error: bErr } = await supabaseAdmin
    .from("blogs")
    .select("id, project_id, title, content, target_keyword, meta_description")
    .eq("id", blogId)
    .single();

  if (bErr || !blog) return { success: false, error: "Blog not found" };

  // Ownership check
  const { data: project, error: pErr } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", blog.project_id)
    .eq("user_id", user.id)
    .single();

  if (pErr || !project) return { success: false, error: "Unauthorized" };

  const contentPreview = (blog.content ?? "").slice(0, 12_000);

  const prompt = `You are a senior SEO and content strategist performing a thorough, one-pass audit of a blog post. Your job is to find ALL genuine issues in a single pass so nothing needs to be re-discovered later. Do not invent issues that aren't truly present — only report real problems.

BLOG TITLE: ${blog.title ?? "(no title)"}
TARGET KEYWORD: ${blog.target_keyword ?? "(unknown)"}
META DESCRIPTION: ${blog.meta_description ?? "(none)"}

CONTENT (first 12,000 chars):
${contentPreview}

Return ONLY valid JSON in this exact shape — no markdown fences, no commentary:
{
  "summary": "2-3 sentence description of what this article is about",
  "plain_language_verdict": "1-2 sentence plain-English summary of the most impactful problem (or that the content is solid if no real issues)",
  "conclusion": {
    "verdict": "ready_to_publish|needs_minor_fixes|needs_major_work",
    "summary": "1-2 sentence plain-English conclusion for a non-technical user — tell them clearly if it's safe to post, needs a few tweaks, or requires significant work, and why"
  },
  "issues": [
    {
      "label": "short issue name",
      "detail": "what exactly is wrong and why it matters for rankings or readers",
      "fix": "specific, actionable fix in plain language — enough detail to act on immediately",
      "severity": "high|medium|low",
      "category": "technical|seo|content|ux"
    }
  ],
  "quality_rubric": [
    { "id": "unique_id", "label": "rubric item label", "detail": "why pass/warn/fail", "status": "pass|warn|fail" }
  ],
  "content_gaps": ["topic or angle this article should cover but doesn't"],
  "quick_wins": ["one small specific change that would immediately improve this article"]
}

Rules — read carefully:
- COMPLETENESS: Surface every genuine issue in this single pass. If the content is already strong, say so — do not inflate the issue list.
- VERDICT MAPPING: "ready_to_publish" = no high-severity issues, maybe 1-2 minor; "needs_minor_fixes" = 1-3 medium issues fixable in <30 min; "needs_major_work" = any high-severity issue or structural problem.
- Return 0-8 issues ordered by impact (highest first). Zero issues is valid for high-quality content.
- Include 6-8 quality_rubric rows covering: E-E-A-T signals, keyword placement, heading structure, meta description, internal linking, readability, answer-first structure, call to action.
- Include 0-5 content_gaps (only real missing topics, not padding).
- Include 1-4 quick_wins.
- Be specific. Reference actual text from the article when relevant.
- Do NOT fabricate keyword volume data. Focus purely on content quality.`;

  try {
    const raw = await geminiGenerate(prompt, 2);
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as BlogContentAnalysis;
    return { success: true, analysis: parsed };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Analysis failed" };
  }
}
