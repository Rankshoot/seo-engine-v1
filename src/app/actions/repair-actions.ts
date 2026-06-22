'use server';

/**
 * Blog-repair orchestration.
 *
 * Given an existing audit row (URL + issues), the `repairBlogFromAudit` action:
 *   1. Loads the authenticated project + business brief.
 *   2. Scrapes the live page via the hybrid scraper (fresh markdown — the audit's scrape may
 *      be hours/days old).
 *   3. Creates a placeholder calendar entry tagged "Repair", so the resulting
 *      blog can live in the calendar / content pipeline like any other post.
 *   4. Asks Gemini (`repairBlogPost`) to rewrite the page addressing every
 *      issue, while keeping the same topic and voice.
 *   5. Inserts a `blogs` row with `article_type='Repair'` and `source_url`
 *      pointing to the original public URL, so the viewer can show a banner
 *      "Repaired from <url>".
 *
 * Returns `{ success, data: { blogId, entryId } }` — the client navigates to
 * `/projects/[id]/blogs/[blogId]` to view/download/schedule the rewrite.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { repairBlogPost } from '@/lib/gemini';
import { hybridReadUrl as jinaReadUrl } from '@/services/hybridScraper';
import { getBusinessBrief } from '@/app/actions/brief-actions';
import type { BlogAuditAnalysis } from '@/lib/content-audit';
import type { Project } from '@/lib/types';
import { sanitizeBlogContent } from '@/lib/blog-content';
import type { BlogContentAnalysis } from '@/app/actions/blog-actions';

function titleNeedsRepair(analysis: BlogAuditAnalysis): boolean {
  return analysis.issues.some(i =>
    /title|h1|headline|keyword in title|target keyword/i.test(`${i.label} ${i.detail} ${i.fix}`)
  );
}

function metaNeedsRepair(analysis: BlogAuditAnalysis): boolean {
  return analysis.issues.some(i =>
    /meta description|meta tag|description/i.test(`${i.label} ${i.detail} ${i.fix}`)
  );
}

function countWords(markdown: string): number {
  return markdown.split(/\s+/).filter(Boolean).length;
}

function replaceFirstH1(markdown: string, title: string): string {
  const safeTitle = title.trim();
  if (!safeTitle) return markdown;
  if (/^#\s+.+$/m.test(markdown)) {
    return markdown.replace(/^#\s+.+$/m, `# ${safeTitle}`);
  }
  return `# ${safeTitle}\n\n${markdown.trim()}`;
}

function normalizeRepairNotes(notes: string[], analysis: BlogAuditAnalysis): string[] {
  const cleaned = notes.map(n => n.trim()).filter(Boolean);
  const hasDone = cleaned.some(n => /^done:/i.test(n));
  const hasStill = cleaned.some(n => /^still to do:/i.test(n));

  const done = hasDone
    ? cleaned.filter(n => /^done:/i.test(n))
    : analysis.issues.slice(0, 6).map(i => `Done: ${i.fix || i.label}`);

  const still = hasStill
    ? cleaned.filter(n => /^still to do:/i.test(n))
    : ['Still to do: none — re-run Content Health after publishing/replacing the page to verify the fixes.'];

  return [...done, ...still].slice(0, 10);
}

export async function repairBlogFromAudit(projectId: string, auditUrl: string) {
  const user = await currentUser();
  if (!user) return { success: false as const, error: 'Not authenticated' };

  // 1. Auth'd project load.
  const { data: projectRow, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !projectRow) {
    return { success: false as const, error: 'Project not found or unauthorized' };
  }
  const project = projectRow as Project;

  // 2. Load the audit row — we need the primary keyword, issues, content
  //    gaps and internal link targets.
  const { data: auditRow, error: aErr } = await supabaseAdmin
    .from('blog_audits')
    .select('*')
    .eq('project_id', projectId)
    .eq('url', auditUrl)
    .maybeSingle();

  if (aErr || !auditRow) {
    return { success: false as const, error: 'Audit row not found — run the audit first.' };
  }

  const analysis = (auditRow.analysis as BlogAuditAnalysis | null) ?? null;
  if (!analysis) {
    return { success: false as const, error: 'Audit has no analysis payload to repair from.' };
  }
  if (analysis.page_status === 'broken') {
    return {
      success: false as const,
      error: 'This URL returns an error. Fix the 404/redirect first, then re-audit.',
    };
  }

  // 3. Re-scrape the live page so the repair is based on current content, not
  //    whatever existed when the audit was first run.
  const fresh = await jinaReadUrl(auditUrl, { timeoutMs: 25_000 });
  if (!fresh.ok || fresh.markdown.length < 400) {
    return {
      success: false as const,
      error: fresh.error || "Couldn't re-scrape the page for repair.",
    };
  }

  // 4. Load the business brief (voice/tone context + sitemap-wide internal
  //    link pool).
  const briefRes = await getBusinessBrief(projectId);
  const brief = briefRes.success ? briefRes.brief : null;

  // Build the internal link pool: everything the audit already picked +
  // other peer URLs from the brief. Keep it verbatim so the LLM can't invent.
  const fromAudit = (analysis.internal_link_opportunities ?? []).map(i => i.target_url);
  const fromBrief = (brief?.internal_link_candidates ?? []).map(c => c.url);
  const fromBriefBlogs = brief?.blog_urls ?? [];
  const internalLinkPool = Array.from(
    new Set([...fromAudit, ...fromBrief, ...fromBriefBlogs])
  ).filter(u => u && u !== auditUrl);

  // 5. Create a placeholder calendar entry tagged Repair. blogs.entry_id is
  //    NOT NULL, so a calendar row must exist first.
  const today = new Date().toISOString().slice(0, 10);
  const focusKw = analysis.primary_keyword || auditRow.primary_keyword || auditRow.title || 'repair';
  const repairTitle = `Repair: ${auditRow.title || auditUrl}`.slice(0, 240);

  const { data: entryRow, error: entryErr } = await supabaseAdmin
    .from('calendar_entries')
    .insert({
      project_id: projectId,
      keyword_id: null,
      scheduled_date: today,
      title: repairTitle,
      article_type: 'Repair',
      slug: `repair-${today}-${Date.now().toString(36)}`,
      focus_keyword: focusKw,
      secondary_keywords: analysis.secondary_keywords ?? [],
      status: 'generating',
    })
    .select()
    .single();

  if (entryErr || !entryRow) {
    return {
      success: false as const,
      error: entryErr?.message ?? 'Failed to create calendar entry for repair.',
    };
  }

  try {
    // 6. Call the LLM to rewrite.
    const repaired = await repairBlogPost({
      sourceUrl: auditUrl,
      originalTitle: auditRow.title || '',
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
      primaryKeyword: analysis.primary_keyword || auditRow.primary_keyword || '',
      secondaryKeywords: analysis.secondary_keywords ?? [],
      brief,
      project,
      wordCount: 2200,
      pdfCtaUrl: fresh.pdfDownloadUrl ?? null,
    });

    // Guardrail: repair should not rename the page unless the audit explicitly
    // flagged title/H1/keyword-title problems.
    const preserveTitle = !titleNeedsRepair(analysis) && Boolean(auditRow.title);
    const finalTitle = preserveTitle ? auditRow.title : repaired.title;
    const rawContent = preserveTitle ? replaceFirstH1(repaired.content, auditRow.title) : repaired.content;
    const finalMetaDescription = metaNeedsRepair(analysis)
      ? repaired.meta_description
      : (analysis.summary || repaired.meta_description);
    const repairNotes = normalizeRepairNotes(repaired.repair_notes, analysis);

    // Same link validation + image cap we apply to fresh generations — a
    // repaired blog should never ship with dead citations or stray
    // IMAGE_PLACEHOLDER artifacts either.
    const sanitized = await sanitizeBlogContent(rawContent, {
      ownDomain: project.domain ?? '',
    });
    const finalContent = sanitized.content;

    // 7. Persist the blog.
    const { data: blogRow, error: blogErr } = await supabaseAdmin
      .from('blogs')
      .insert({
        entry_id: entryRow.id,
        project_id: projectId,
        title: finalTitle,
        content: finalContent,
        meta_description: finalMetaDescription,
        word_count: countWords(finalContent),
        target_keyword: analysis.primary_keyword || auditRow.primary_keyword || '',
        article_type: 'Repair',
        slug: repaired.slug,
        status: 'generated',
        research_sources: repaired.research_sources,
        external_links: sanitized.externalLinks.slice(0, 10),
        internal_links: sanitized.internalLinks.slice(0, 12),
        source_url: auditUrl,
        repair_notes: repairNotes,
      })
      .select()
      .single();

    if (blogErr || !blogRow) {
      await supabaseAdmin.from('calendar_entries').delete().eq('id', entryRow.id);
      return {
        success: false as const,
        error: blogErr?.message ?? 'Failed to persist repaired blog.',
      };
    }

    await supabaseAdmin
      .from('calendar_entries')
      .update({ status: 'generated' })
      .eq('id', entryRow.id);

    return {
      success: true as const,
      data: {
        blogId: blogRow.id,
        entryId: entryRow.id,
        repair_notes: repairNotes,
      },
    };
  } catch (e) {
    await supabaseAdmin
      .from('calendar_entries')
      .update({ status: 'error' })
      .eq('id', entryRow.id);
    return {
      success: false as const,
      error: `Repair failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Generate an enhanced version of a blog directly from its stored content +
 * a BlogContentAnalysis object (no audit URL / blog_audits row required).
 *
 * Used by the "Analyse content" modal in the blog viewer right panel.
 *
 * The enhanced blog is persisted as a new `blogs` row with `entry_id=NULL`
 * so it does NOT appear on the calendar — it is a side-by-side "After"
 * version surfaced in the viewer's Before / After toggle.
 */
export async function repairBlogFromContent(
  blogId: string,
  analysis: BlogContentAnalysis,
) {
  const user = await currentUser();
  if (!user) return { success: false as const, error: 'Not authenticated' };

  // 1. Load the blog + verify ownership through the project.
  const { data: blogRow, error: bErr } = await supabaseAdmin
    .from('blogs')
    .select('id, project_id, title, content, target_keyword, meta_description, article_type, source_url')
    .eq('id', blogId)
    .single();

  if (bErr || !blogRow) {
    return { success: false as const, error: 'Blog not found.' };
  }

  const { data: projectRow, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', blogRow.project_id)
    .eq('user_id', user.id)
    .single();

  if (pErr || !projectRow) {
    return { success: false as const, error: 'Project not found or unauthorized.' };
  }
  const project = projectRow as Project;

  // 2. Load business brief for voice/internal-link context.
  const briefRes = await getBusinessBrief(blogRow.project_id);
  const brief = briefRes.success ? briefRes.brief : null;

  const fromBrief = (brief?.internal_link_candidates ?? []).map(c => c.url);
  const fromBriefBlogs = brief?.blog_urls ?? [];
  const internalLinkPool = Array.from(new Set([...fromBrief, ...fromBriefBlogs])).filter(Boolean);

  // 3. Enhanced blogs are NOT scheduled on the calendar — they are an
  //    alternate "After" version of an existing post. `blogs.entry_id` is
  //    nullable (see supabase-migration-blogs-entry-id-nullable.sql) so we
  //    can persist the enhanced row without polluting the schedule.
  const focusKw = blogRow.target_keyword || blogRow.title || 'repair';

  try {
    // 4. Prefer live markdown when this blog was captured from a public URL (import / repair).
    let originalMarkdown = blogRow.content || '';
    let repairSourceUrl = blogRow.source_url?.trim() || `blog://${blogId}`;
    const candidateLive = blogRow.source_url?.trim() ?? '';
    if (/^https?:\/\//i.test(candidateLive)) {
      const fresh = await jinaReadUrl(candidateLive, { timeoutMs: 25_000 });
      if (fresh.ok && fresh.markdown.length >= 400) {
        originalMarkdown = fresh.markdown;
        repairSourceUrl = candidateLive;
      }
    }

    const wc = countWords(originalMarkdown);

    // Map BlogContentAnalysis → repairBlogPost (include category + full analysis bundle for SEO enhancement mode).
    const mappedIssues = analysis.issues.map(i => ({
      label: i.label,
      detail: i.detail,
      fix: i.fix,
      severity: i.severity,
      category: i.category,
    }));

    const repaired = await repairBlogPost({
      sourceUrl: repairSourceUrl,
      originalTitle: blogRow.title || '',
      originalMarkdown,
      issues: mappedIssues,
      contentGaps: analysis.content_gaps ?? [],
      internalLinkPool,
      primaryKeyword: focusKw,
      secondaryKeywords: [],
      brief,
      project,
      wordCount: Math.min(4000, Math.max(1500, wc + 400)),
      pdfCtaUrl: /^https?:\/\//i.test(candidateLive)
        ? ((await jinaReadUrl(candidateLive, { timeoutMs: 5_000 }).catch(() => null))?.pdfDownloadUrl ?? null)
        : null,
      contentAnalysisBundle: {
        summary: analysis.summary,
        plain_language_verdict: analysis.plain_language_verdict,
        conclusion_verdict: analysis.conclusion.verdict,
        conclusion_summary: analysis.conclusion.summary,
        quick_wins: analysis.quick_wins ?? [],
        quality_rubric: analysis.quality_rubric ?? [],
      },
    });

    const repairNotes = [
      ...analysis.quick_wins.slice(0, 4).map(w => `Done: ${w}`),
      'Still to do: none — re-run Content Analysis after updating your live page to verify fixes.',
    ].slice(0, 10);

    const sanitized = await sanitizeBlogContent(repaired.content, {
      ownDomain: project.domain ?? '',
    });

    // 5. Persist the enhanced blog (no calendar entry — entry_id stays null).
    const { data: newBlog, error: blogErr } = await supabaseAdmin
      .from('blogs')
      .insert({
        entry_id: null,
        project_id: blogRow.project_id,
        title: repaired.title || blogRow.title,
        content: sanitized.content,
        meta_description: repaired.meta_description || blogRow.meta_description || '',
        word_count: sanitized.content.split(/\s+/).filter(Boolean).length,
        target_keyword: focusKw,
        article_type: 'Repair',
        slug: repaired.slug,
        status: 'generated',
        research_sources: repaired.research_sources,
        external_links: sanitized.externalLinks.slice(0, 10),
        internal_links: sanitized.internalLinks.slice(0, 12),
        source_url: blogRow.source_url || `blog://${blogId}`,
        repair_notes: repairNotes,
      })
      .select()
      .single();

    if (blogErr || !newBlog) {
      return {
        success: false as const,
        error: blogErr?.message ?? 'Failed to persist enhanced blog.',
      };
    }

    return {
      success: true as const,
      data: { blogId: newBlog.id, entryId: null as string | null },
    };
  } catch (e) {
    return {
      success: false as const,
      error: `Enhancement failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
