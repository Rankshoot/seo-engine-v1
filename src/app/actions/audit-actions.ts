'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { criticalityFromScore } from '@/lib/audit-criticality';
import { auditBlogUrl, type BlogAuditAnalysis, type BlogAuditRecord } from '@/lib/content-audit';
import { fetchBlogUrls, fetchSitemapUrls, isContentUrl, BLOG_URL_INVENTORY_MAX } from '@/lib/jina';
import { generateBusinessBrief } from './brief-actions';
import type { BusinessBrief } from '@/lib/business-brief';

export interface PersistedBlogAudit extends BlogAuditRecord {
  updated_at?: string;
}

export interface AuditCoverage {
  blogs_found: number;
  blogs_audited: number;
  last_updated_at: string | null;
  /** Average health score across audited blogs (0–100). */
  avg_health: number;
  /** Count of audits currently flagged high severity. */
  high_severity: number;
}

async function ensureOwner(projectId: string) {
  const user = await currentUser();
  if (!user) return { user: null, project: null, error: 'Not authenticated' as const };
  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('*, project_competitors(*)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (error || !project) return { user, project: null, error: 'Project not found' as const };
  return { user, project, error: null };
}

/** Light helper: fetch the cached brief without regenerating. */
async function fetchCachedBrief(projectId: string): Promise<BusinessBrief | null> {
  const { data } = await supabaseAdmin
    .from('project_briefs')
    .select('brief')
    .eq('project_id', projectId)
    .maybeSingle();
  return (data?.brief as BusinessBrief | undefined) ?? null;
}

export async function getBlogAudits(projectId: string): Promise<{
  success: boolean;
  error?: string;
  data: PersistedBlogAudit[];
  coverage: AuditCoverage;
}> {
  const { project, error } = await ensureOwner(projectId);
  if (error || !project) {
    return {
      success: false,
      error: error ?? 'Project not found',
      data: [],
      coverage: emptyCoverage(),
    };
  }

  const brief = await fetchCachedBrief(projectId);
  // Live sitemap inventory so Content Health matches the real blog count (brief
  // used to cap at 200 and could go stale). Fall back to cached brief if fetch fails.
  let blogs_found = (brief?.blog_urls ?? []).filter(isContentUrl).length;
  try {
    blogs_found = (await fetchBlogUrls(project.domain, BLOG_URL_INVENTORY_MAX)).filter(isContentUrl).length;
  } catch {
    // keep brief-derived count
  }

  const { data, error: dbErr } = await supabaseAdmin
    .from('blog_audits')
    .select('*')
    .eq('project_id', projectId)
    .order('health_score', { ascending: true });

  if (dbErr) {
    return {
      success: false,
      error: dbErr.message,
      data: [],
      coverage: { ...emptyCoverage(), blogs_found },
    };
  }

  const rows = (data ?? []).map(rowToRecord);
  const coverage: AuditCoverage = {
    blogs_found,
    blogs_audited: rows.length,
    last_updated_at: rows[0]?.updated_at ?? null,
    avg_health: rows.length
      ? Math.round(rows.reduce((s, r) => s + r.health_score, 0) / rows.length)
      : 0,
    high_severity: rows.filter(r => criticalityFromScore(r.health_score, r.analysis.page_status) === 'high').length,
  };

  return { success: true, data: rows, coverage };
}

export interface AuditRunOpts {
  /** Rerun even URLs we've audited before. Default false = only new ones. */
  force?: boolean;
  /** Hard cap so one click can't rack up too many LLM calls. Default 10. */
  limit?: number;
}

export async function auditExistingBlogs(
  projectId: string,
  opts: AuditRunOpts = {}
): Promise<{
  success: boolean;
  error?: string;
  audited: number;
  skipped: number;
  failed: number;
  coverage: AuditCoverage;
}> {
  const { project, error } = await ensureOwner(projectId);
  if (error || !project) {
    return {
      success: false,
      error: error ?? 'Project not found',
      audited: 0,
      skipped: 0,
      failed: 0,
      coverage: emptyCoverage(),
    };
  }

  // Make sure we have a brief. If we don't, generate one (it also discovers the
  // blog URLs on the sitemap — the audit absolutely needs that list).
  let brief = await fetchCachedBrief(projectId);
  if (!brief) {
    const gen = await generateBusinessBrief(projectId, { force: false });
    if (gen.success && gen.brief) brief = gen.brief;
  }

  // Always re-crawl the sitemap at audit time rather than trusting the
  // cached brief — the crawler improved since some briefs were written, and
  // we don't want old blog URL lists (or lists containing .xml garbage) to
  // leak through into new audit runs.
  const blogUrls = (await fetchBlogUrls(project.domain, BLOG_URL_INVENTORY_MAX)).filter(isContentUrl);

  if (!blogUrls.length) {
    return {
      success: false,
      error:
        'No blog URLs found on your site. Make sure your sitemap is reachable and contains URLs like /blog/slug or /blogs/slug, or use the Refresh brief button first.',
      audited: 0,
      skipped: 0,
      failed: 0,
      coverage: emptyCoverage(),
    };
  }

  // Purge any previously-stored audit rows that either (a) aren't content
  // URLs at all (e.g. the .xml sitemaps we used to accept), or (b) are no
  // longer present on the site's sitemap. Keeps the Content Health screen
  // honest on re-runs.
  try {
    const { data: existingRows } = await supabaseAdmin
      .from('blog_audits')
      .select('url')
      .eq('project_id', projectId);
    const currentSet = new Set(blogUrls);
    const stale =
      (existingRows ?? [])
        .map(r => r.url as string)
        .filter(u => !isContentUrl(u) || !currentSet.has(u));
    if (stale.length) {
      await supabaseAdmin
        .from('blog_audits')
        .delete()
        .eq('project_id', projectId)
        .in('url', stale);
    }
  } catch {
    // Non-fatal — the upsert below will still do the right thing.
  }

  const limit = opts.limit ?? 10;

  // If not forcing, only audit URLs we haven't audited yet.
  let alreadyAudited: Set<string> = new Set();
  if (!opts.force) {
    const { data: existing } = await supabaseAdmin
      .from('blog_audits')
      .select('url')
      .eq('project_id', projectId);
    alreadyAudited = new Set((existing ?? []).map(r => r.url as string));
  }

  const queue = blogUrls.filter(u => !alreadyAudited.has(u)).slice(0, limit);
  const skipped = blogUrls.length - queue.length;

  let audited = 0;
  let failed = 0;

  // Audit with small concurrency so we don't hammer Jina/Gemini all at once.
  const CONCURRENCY = 3;
  const region = (project as { target_region?: string }).target_region || 'us';
  const language = (project as { target_language?: string }).target_language || 'en';

  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    const batch = queue.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(url =>
        auditBlogUrl({ url, brief, sitePeerUrls: blogUrls, region, language }).catch(e => ({
          url,
          title: url,
          word_count: 0,
          scraped_chars: 0,
          health_score: 0,
          severity: 'high' as const,
          primary_keyword: '',
          analysis: {
            summary: `Audit crashed: ${e instanceof Error ? e.message : String(e)}`,
            primary_keyword: '',
            secondary_keywords: [],
            issues: [],
            content_gaps: [],
            internal_link_opportunities: [],
            suggested_funnel_stage: '' as const,
            llm_quality_score: undefined,
            keyword_demand: null,
            plain_language_verdict: '',
            page_status: 'empty' as const,
            quality_rubric: [],
          },
          error: e instanceof Error ? e.message : String(e),
        }))
      )
    );
    for (const r of results) {
      const row = {
        project_id: projectId,
        url: r.url,
        title: r.title,
        word_count: r.word_count,
        health_score: r.health_score,
        severity: r.severity,
        primary_keyword: r.primary_keyword,
        analysis: r.analysis,
        scraped_chars: r.scraped_chars,
        error: r.error ?? '',
        updated_at: new Date().toISOString(),
      };
      const { error: upErr } = await supabaseAdmin
        .from('blog_audits')
        .upsert(row, { onConflict: 'project_id,url' });
      if (upErr) failed++;
      else audited++;
    }
  }

  const after = await getBlogAudits(projectId);
  return {
    success: true,
    audited,
    skipped,
    failed,
    coverage: after.coverage,
  };
}

export async function deleteBlogAudits(projectId: string) {
  const { project, error } = await ensureOwner(projectId);
  if (error || !project) return { success: false, error: error ?? 'Project not found' };
  const { error: dErr } = await supabaseAdmin
    .from('blog_audits')
    .delete()
    .eq('project_id', projectId);
  if (dErr) return { success: false, error: dErr.message };
  return { success: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 1 additions: page discovery + selective audit.
// ────────────────────────────────────────────────────────────────────────────

export interface SitemapPage {
  url: string;
  /** URL path segment used for grouping: /blog, /blogs, /hr-glossary, etc. */
  basePath: string;
  /** Whether this URL already has an audit row stored. */
  audited: boolean;
  /** Health score from existing audit (undefined when not yet audited). */
  healthScore?: number;
  severity?: 'high' | 'medium' | 'low';
  primaryKeyword?: string;
}

/**
 * Discover every content-like page from the project's sitemap.
 *
 * Returns the full list grouped by base path (e.g. "/blog", "/blogs",
 * "/hr-glossary"). The UI can then filter by base path and let the user
 * select individual pages to audit.
 *
 * @param basePath - Optional filter: only return pages whose path starts with
 *   this prefix (e.g. "/blogs"). When empty, return all content pages.
 */
export async function getAllSitemapPages(
  projectId: string,
  basePath?: string
): Promise<{
  success: boolean;
  error?: string;
  pages: SitemapPage[];
  /** Distinct base paths found in the sitemap (for the filter dropdown). */
  basePaths: string[];
  total: number;
}> {
  const { project, error } = await ensureOwner(projectId);
  if (error || !project)
    return { success: false, error: error ?? 'Project not found', pages: [], basePaths: [], total: 0 };

  const domain = (project as { domain?: string }).domain ?? '';
  if (!domain)
    return { success: false, error: 'No domain configured', pages: [], basePaths: [], total: 0 };

  // Fetch all sitemap URLs and filter to content-like pages.
  const allUrls = (await fetchSitemapUrls(domain, 2000)).filter(isContentUrl);
  if (!allUrls.length)
    return {
      success: false,
      error: 'No content pages found in your sitemap. Make sure sitemap.xml is reachable.',
      pages: [],
      basePaths: [],
      total: 0,
    };

  // Extract base paths for grouping.
  function getBasePath(url: string): string {
    try {
      const path = new URL(url).pathname;
      const segments = path.split('/').filter(Boolean);
      if (segments.length >= 2) return '/' + segments[0];
      return '/';
    } catch {
      return '/';
    }
  }

  const basePathCounts = new Map<string, number>();
  for (const url of allUrls) {
    const bp = getBasePath(url);
    basePathCounts.set(bp, (basePathCounts.get(bp) ?? 0) + 1);
  }
  const basePaths = [...basePathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([bp]) => bp);

  // Load existing audit rows to mark which pages are already audited.
  const { data: existingAudits } = await supabaseAdmin
    .from('blog_audits')
    .select('url, health_score, severity, primary_keyword')
    .eq('project_id', projectId);
  const auditMap = new Map(
    (existingAudits ?? []).map(a => [a.url, a])
  );

  // Filter by basePath if provided.
  let filtered = allUrls;
  if (basePath && basePath !== '/') {
    filtered = allUrls.filter(url => {
      try {
        return new URL(url).pathname.startsWith(basePath);
      } catch {
        return false;
      }
    });
  }

  const pages: SitemapPage[] = filtered.map(url => {
    const audit = auditMap.get(url);
    return {
      url,
      basePath: getBasePath(url),
      audited: Boolean(audit),
      healthScore: audit ? (audit.health_score as number) ?? undefined : undefined,
      severity: audit
        ? ((audit.severity as string) === 'high' || (audit.severity as string) === 'medium' || (audit.severity as string) === 'low'
          ? (audit.severity as 'high' | 'medium' | 'low')
          : undefined)
        : undefined,
      primaryKeyword: audit ? (audit.primary_keyword as string) ?? undefined : undefined,
    };
  });

  return { success: true, pages, basePaths, total: allUrls.length };
}

/**
 * Audit a specific set of URLs (max 5). Used when the user selects
 * individual pages from the page listing.
 *
 * Falls back to the existing `auditBlogUrl` pipeline which runs Ahrefs
 * signals + optional Jina scrape + Gemini diagnosis.
 */
export async function auditSelectedUrls(
  projectId: string,
  urls: string[]
): Promise<{
  success: boolean;
  error?: string;
  audited: number;
  failed: number;
  results: PersistedBlogAudit[];
}> {
  const MAX = 5;
  if (urls.length > MAX)
    return { success: false, error: `Maximum ${MAX} pages at once`, audited: 0, failed: 0, results: [] };
  if (!urls.length)
    return { success: false, error: 'No URLs provided', audited: 0, failed: 0, results: [] };

  const { project, error } = await ensureOwner(projectId);
  if (error || !project)
    return { success: false, error: error ?? 'Project not found', audited: 0, failed: 0, results: [] };

  let brief = await fetchCachedBrief(projectId);
  if (!brief) {
    const gen = await generateBusinessBrief(projectId, { force: false });
    if (gen.success && gen.brief) brief = gen.brief;
  }

  const domain = (project as { domain?: string }).domain ?? '';
  const blogUrls = (await fetchBlogUrls(domain, 500)).filter(isContentUrl);
  const region = (project as { target_region?: string }).target_region || 'us';
  const language = (project as { target_language?: string }).target_language || 'en';

  let audited = 0;
  let failed = 0;
  const results: PersistedBlogAudit[] = [];

  // Run sequentially to limit external API pressure.
  for (const url of urls) {
    try {
      const r = await auditBlogUrl({ url, brief, sitePeerUrls: blogUrls, region, language });
      const row = {
        project_id: projectId,
        url: r.url,
        title: r.title,
        word_count: r.word_count,
        health_score: r.health_score,
        severity: r.severity,
        primary_keyword: r.primary_keyword,
        analysis: r.analysis,
        scraped_chars: r.scraped_chars,
        error: r.error ?? '',
        updated_at: new Date().toISOString(),
      };
      const { error: upErr } = await supabaseAdmin
        .from('blog_audits')
        .upsert(row, { onConflict: 'project_id,url' });
      if (upErr) {
        failed++;
      } else {
        audited++;
        results.push({ ...r, updated_at: row.updated_at });
      }
    } catch (e) {
      failed++;
    }
  }

  return { success: true, audited, failed, results };
}

function emptyCoverage(): AuditCoverage {
  return {
    blogs_found: 0,
    blogs_audited: 0,
    last_updated_at: null,
    avg_health: 0,
    high_severity: 0,
  };
}

interface AuditRow {
  url: string;
  title: string | null;
  word_count: number | null;
  health_score: number | null;
  severity: string | null;
  primary_keyword: string | null;
  analysis: Record<string, unknown> | null;
  scraped_chars: number | null;
  error: string | null;
  updated_at: string | null;
}

function rowToRecord(row: AuditRow): PersistedBlogAudit {
  return {
    url: row.url,
    title: row.title ?? '',
    word_count: row.word_count ?? 0,
    scraped_chars: row.scraped_chars ?? 0,
    health_score: row.health_score ?? 0,
    severity:
      row.severity === 'high' || row.severity === 'medium' || row.severity === 'low'
        ? row.severity
        : 'low',
    primary_keyword: row.primary_keyword ?? '',
    analysis: (row.analysis as unknown as BlogAuditAnalysis) ?? {
      summary: '',
      primary_keyword: '',
      secondary_keywords: [],
      issues: [],
      content_gaps: [],
      internal_link_opportunities: [],
      suggested_funnel_stage: '',
      keyword_demand: null,
      plain_language_verdict: '',
      page_status: 'ok',
      quality_rubric: [],
    },
    error: row.error || undefined,
    updated_at: row.updated_at ?? undefined,
  };
}
