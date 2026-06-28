'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { criticalityFromScore } from '@/lib/audit-criticality';
import {
  auditBlogUrl,
  type BlogAuditAnalysis,
  type BlogAuditRecord,
  type ContentAuditVendorTrace,
} from '@/lib/content-audit';
import { fetchBlogUrls, isContentUrl, BLOG_URL_INVENTORY_MAX } from '@/lib/jina';
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
  /** Row counts by Content Health criticality (full project, not just the current page). */
  severity_counts: { high: number; medium: number; low: number };
}

/** `page_status` for stats — read from JSON so we never require the denormalized DB column. */
function pageStatusFromStoredAnalysis(analysis: unknown): BlogAuditAnalysis['page_status'] {
  const a = analysis as { page_status?: unknown } | null | undefined;
  const ps = a?.page_status;
  return ps === 'broken' || ps === 'redirected' || ps === 'empty' || ps === 'ok' ? ps : 'ok';
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

export type GetBlogAuditsOpts = {
  /** When true, only coverage stats — no row payloads (fast for sidebar stats). */
  summaryOnly?: boolean;
  limit?: number;
  offset?: number;
};

export async function getBlogAudits(
  projectId: string,
  opts?: GetBlogAuditsOpts
): Promise<{
  success: boolean;
  error?: string;
  data: PersistedBlogAudit[];
  coverage: AuditCoverage;
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}> {
  const { project, error } = await ensureOwner(projectId);
  if (error || !project) {
    return {
      success: false,
      error: error ?? 'Project not found',
      data: [],
      coverage: emptyCoverage(),
      total: 0,
      hasMore: false,
      limit: 0,
      offset: 0,
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

  const { count: totalCount, error: countErr } = await supabaseAdmin
    .from('blog_audits')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  if (countErr) {
    return {
      success: false,
      error: countErr.message,
      data: [],
      coverage: { ...emptyCoverage(), blogs_found },
      total: 0,
      hasMore: false,
      limit: 0,
      offset: 0,
    };
  }

  const total = totalCount ?? 0;

  const { data: statRows, error: statErr } = await supabaseAdmin
    .from('blog_audits')
    .select('health_score, updated_at, analysis')
    .eq('project_id', projectId);

  if (statErr) {
    return {
      success: false,
      error: statErr.message,
      data: [],
      coverage: { ...emptyCoverage(), blogs_found },
      total,
      hasMore: false,
      limit: 0,
      offset: 0,
    };
  }

  const stats = statRows ?? [];

  let last_updated_at: string | null = null;
  for (const r of stats) {
    const u = r.updated_at as string | null;
    if (u && (!last_updated_at || u > last_updated_at)) last_updated_at = u;
  }

  const severity_counts = { high: 0, medium: 0, low: 0 };
  for (const r of stats) {
    const c = criticalityFromScore(r.health_score as number, pageStatusFromStoredAnalysis(r.analysis));
    severity_counts[c]++;
  }

  const coverage: AuditCoverage = {
    blogs_found,
    blogs_audited: stats.length,
    last_updated_at,
    avg_health: stats.length
      ? Math.round(stats.reduce((s, r) => s + (r.health_score as number), 0) / stats.length)
      : 0,
    high_severity: severity_counts.high,
    severity_counts,
  };

  if (opts?.summaryOnly) {
    return {
      success: true,
      data: [],
      coverage,
      total,
      hasMore: false,
      limit: 0,
      offset: 0,
    };
  }

  const limit = opts?.limit;
  const offset = opts?.offset ?? 0;

  if (limit == null) {
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
        coverage,
        total,
        hasMore: false,
        limit: 0,
        offset: 0,
      };
    }

    const rows = (data ?? []).map(rowToRecord);
    return {
      success: true,
      data: rows,
      coverage,
      total,
      hasMore: false,
      limit: rows.length,
      offset: 0,
    };
  }

  const { data, error: dbErr } = await supabaseAdmin
    .from('blog_audits')
    .select('*')
    .eq('project_id', projectId)
    .order('health_score', { ascending: true })
    .range(offset, offset + limit - 1);

  if (dbErr) {
    return {
      success: false,
      error: dbErr.message,
      data: [],
      coverage,
      total,
      hasMore: false,
      limit,
      offset,
    };
  }

  const rows = (data ?? []).map(rowToRecord);
  return {
    success: true,
    data: rows,
    coverage,
    total,
    hasMore: offset + rows.length < total,
    limit,
    offset,
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

function normalizeExternalAuditUrl(raw: string): { ok: true; href: string } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: false, error: 'Enter a URL.' };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return { ok: false, error: 'That does not look like a valid URL.' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: 'Only http(s) links are supported.' };
  }
  const hn = u.hostname.toLowerCase();
  if (hn === 'localhost' || hn === '127.0.0.1' || hn === '0.0.0.0' || hn.endsWith('.local')) {
    return { ok: false, error: 'Local URLs are not supported.' };
  }
  const href = u.href.replace(/#.*$/, '');
  if (href.length > 2048) return { ok: false, error: 'URL is too long.' };
  if (!isContentUrl(href)) {
    return {
      ok: false,
      error:
        'That URL looks like a listing page, media file, or sitemap — paste a single article or blog post URL.',
    };
  }
  return { ok: true, href };
}

/**
 * Scrape + audit any public article URL (competitor or reference), persist to `blog_audits`,
 * and return the same payload shape as batch audits (for Content Health + debugging traces).
 */
export async function auditExternalBlogUrl(
  projectId: string,
  rawUrl: string
): Promise<{
  success: boolean;
  error?: string;
  record?: PersistedBlogAudit;
  trace?: ContentAuditVendorTrace[];
}> {
  const parsed = normalizeExternalAuditUrl(rawUrl);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const { project, error } = await ensureOwner(projectId);
  if (error || !project) return { success: false, error: error ?? 'Project not found' };

  const region = (project as { target_region?: string }).target_region || 'us';
  const language = (project as { target_language?: string }).target_language || 'en';

  let sitePeerUrls: string[] = [];
  try {
    const host = new URL(parsed.href).hostname.replace(/^www\./i, '');
    sitePeerUrls = (await fetchBlogUrls(host, 300)).filter(u => u !== parsed.href);
  } catch {
    sitePeerUrls = [];
  }

  const { record: r, trace } = await auditBlogUrl({
    url: parsed.href,
    brief: null,
    sitePeerUrls,
    region,
    language,
    projectId,
  });

  const { data: prevRow } = await supabaseAdmin
    .from('blog_audits')
    .select('analysis')
    .eq('project_id', projectId)
    .eq('url', r.url)
    .maybeSingle();
  const prevMeta = (prevRow?.analysis as BlogAuditAnalysis | null | undefined)?.analyze_page_meta;
  // Always preserve the analyze_page_meta marker so this row is discoverable
  // by getExternalBlogAuditsForAnalyzePage regardless of whether the URL is
  // on the project domain or an external site.
  const analysisMerged: BlogAuditAnalysis = {
    ...r.analysis,
    analyze_page_meta: {
      ...prevMeta,
      sourced_from_analyze_page: true,
    },
  };

  const row = {
    project_id: projectId,
    url: r.url,
    title: r.title,
    word_count: r.word_count,
    health_score: r.health_score,
    severity: r.severity,
    primary_keyword: r.primary_keyword,
    analysis: analysisMerged,
    scraped_chars: r.scraped_chars,
    scraped_markdown: r.scraped_markdown ?? null,
    error: r.error ?? '',
    page_status: analysisMerged.page_status ?? 'ok',
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabaseAdmin.from('blog_audits').upsert(row, { onConflict: 'project_id,url' });
  if (upErr) return { success: false, error: upErr.message, trace };

  const debugDir = process.env.AUDIT_SCRAPE_DEBUG_DIR?.trim();
  if (debugDir && r.scraped_markdown) {
    void writeAuditScrapeDebugFile(debugDir, r.url, r.scraped_markdown);
  }

  return {
    success: true,
    record: { ...r, analysis: analysisMerged, scraped_markdown: r.scraped_markdown, updated_at: row.updated_at },
    trace,
  };
}

async function writeAuditScrapeDebugFile(dir: string, url: string, markdown: string): Promise<void> {
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    await fs.mkdir(dir, { recursive: true });
    const host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
    const fn = path.join(dir, `${host}-${Date.now()}.md`);
    await fs.writeFile(fn, `# Source: ${url}\n\n${markdown}`, 'utf8');
    console.log(`[audit] AUDIT_SCRAPE_DEBUG_DIR wrote ${fn}`);
  } catch (e) {
    console.warn('[audit] AUDIT_SCRAPE_DEBUG_DIR write failed:', e instanceof Error ? e.message : e);
  }
}

/** Maps audited article URL → calendar row + blog id for Content Health scheduled repairs (Analyze content). */
export type ContentHealthCalendarLinkRow = {
  entryId: string;
  status: string;
  blogId: string | null;
  /** ISO-10 date string (YYYY-MM-DD) from `calendar_entries.scheduled_date`, if present. */
  scheduledDate: string | null;
};

function snapshotAuditUrlFromContentHealthJson(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { version?: number; url?: string };
  if (o.version !== 1 && o.version !== 2) return null;
  const u = typeof o.url === 'string' ? o.url.trim() : '';
  return u || null;
}

/**
 * For each calendar row with a v1/v2 `content_health_audit` snapshot, index by `url`
 * so the Analyze content UI can offer Generate / View blog without scanning all entries client-side.
 */
export async function getContentHealthCalendarLinksByAuditUrl(projectId: string): Promise<{
  success: boolean;
  error?: string;
  byAuditUrl: Record<string, ContentHealthCalendarLinkRow>;
}> {
  const { project, error } = await ensureOwner(projectId);
  if (error || !project) return { success: false, error: error ?? 'Project not found', byAuditUrl: {} };

  const { data: entries, error: eErr } = await supabaseAdmin
    .from('calendar_entries')
    .select('id, status, content_health_audit, scheduled_date, created_at')
    .eq('project_id', projectId)
    .not('content_health_audit', 'is', null)
    .order('created_at', { ascending: false });

  if (eErr) return { success: false, error: eErr.message, byAuditUrl: {} };

  const { data: blogs, error: bErr } = await supabaseAdmin
    .from('blogs')
    .select('id, entry_id')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });

  if (bErr) return { success: false, error: bErr.message, byAuditUrl: {} };

  const blogByEntry = new Map<string, string>();
  for (const b of blogs ?? []) {
    const eid = b.entry_id as string | null | undefined;
    if (eid && !blogByEntry.has(eid)) {
      blogByEntry.set(eid, b.id as string);
    }
  }

  const byAuditUrl: Record<string, ContentHealthCalendarLinkRow> = {};
  for (const row of entries ?? []) {
    const url = snapshotAuditUrlFromContentHealthJson(row.content_health_audit);
    if (!url || byAuditUrl[url]) continue;
    const eid = row.id as string;
    const rawDate = row.scheduled_date as string | null | undefined;
    const scheduledDate = rawDate ? String(rawDate).slice(0, 10) : null;
    byAuditUrl[url] = {
      entryId: eid,
      status: (row.status as string) ?? 'scheduled',
      blogId: blogByEntry.get(eid) ?? null,
      scheduledDate,
    };
  }

  return { success: true, byAuditUrl };
}

/** Rows saved through the Analyze content page (newest first). Uses the
 * `analyze_page_meta.sourced_from_analyze_page` stamp set by `auditExternalBlogUrl`,
 * so it works for both own-domain and external URLs.
 */
export async function getExternalBlogAuditsForAnalyzePage(
  projectId: string,
  limit = 40
): Promise<{ success: boolean; error?: string; data: PersistedBlogAudit[] }> {
  const { project, error } = await ensureOwner(projectId);
  if (error || !project) return { success: false, error: error ?? 'Project not found', data: [] };

  // Filter at the DB level: only rows whose analysis JSONB contains the marker
  // set by auditExternalBlogUrl. This avoids mixing in regular site-audit rows.
  const { data: rows, error: qErr } = await supabaseAdmin
    .from('blog_audits')
    .select('*')
    .eq('project_id', projectId)
    .not('analysis->analyze_page_meta', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(Math.max(limit, 80));

  if (qErr) {
    // Fallback: if the JSONB filter is unsupported, fetch all and filter in JS
    const { data: fallback, error: fErr } = await supabaseAdmin
      .from('blog_audits')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(200);
    if (fErr) return { success: false, error: fErr.message, data: [] };
    const filtered = (fallback ?? [])
      .map(rowToRecord)
      .filter(r => (r.analysis as BlogAuditAnalysis).analyze_page_meta?.sourced_from_analyze_page === true)
      .slice(0, limit);
    return { success: true, data: filtered };
  }

  const out = (rows ?? [])
    .map(rowToRecord)
    .filter(r => (r.analysis as BlogAuditAnalysis).analyze_page_meta?.sourced_from_analyze_page === true)
    .slice(0, limit);

  return { success: true, data: out };
}

export async function markAnalyzePageAuditCalendarScheduled(
  projectId: string,
  auditUrl: string,
  scheduledDateIso: string
): Promise<{ success: boolean; error?: string }> {
  const { project, error } = await ensureOwner(projectId);
  if (error || !project) return { success: false, error: error ?? 'Project not found' };

  const { data: row, error: fErr } = await supabaseAdmin
    .from('blog_audits')
    .select('analysis')
    .eq('project_id', projectId)
    .eq('url', auditUrl)
    .maybeSingle();

  if (fErr) return { success: false, error: fErr.message };
  if (!row) return { success: false, error: 'Audit row not found' };

  const prev = (row.analysis as BlogAuditAnalysis) ?? ({} as BlogAuditAnalysis);
  const nextAnalysis: BlogAuditAnalysis = {
    ...prev,
    analyze_page_meta: {
      ...prev.analyze_page_meta,
      calendar_scheduled: true,
      calendar_scheduled_at: new Date().toISOString(),
      calendar_scheduled_date: scheduledDateIso.slice(0, 10),
    },
  };

  const { error: uErr } = await supabaseAdmin
    .from('blog_audits')
    .update({
      analysis: nextAnalysis as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq('project_id', projectId)
    .eq('url', auditUrl);

  if (uErr) return { success: false, error: uErr.message };
  return { success: true };
}

function emptyCoverage(): AuditCoverage {
  return {
    blogs_found: 0,
    blogs_audited: 0,
    last_updated_at: null,
    avg_health: 0,
    high_severity: 0,
    severity_counts: { high: 0, medium: 0, low: 0 },
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
  page_status?: string | null;
  scraped_chars: number | null;
  scraped_markdown?: string | null;
  error: string | null;
  updated_at: string | null;
}

function rowToRecord(row: AuditRow): PersistedBlogAudit {
  const rawAnalysis = (row.analysis as unknown as BlogAuditAnalysis) ?? {
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
  };
  const psRaw = row.page_status as string | null | undefined;
  const page_status: BlogAuditAnalysis['page_status'] =
    rawAnalysis.page_status === 'broken' ||
    rawAnalysis.page_status === 'redirected' ||
    rawAnalysis.page_status === 'empty' ||
    rawAnalysis.page_status === 'ok'
      ? rawAnalysis.page_status
      : psRaw === 'broken' || psRaw === 'redirected' || psRaw === 'empty' || psRaw === 'ok'
        ? psRaw
        : 'ok';

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
    analysis: { ...rawAnalysis, page_status },
    error: row.error || undefined,
    updated_at: row.updated_at ?? undefined,
    scraped_markdown: row.scraped_markdown?.trim() ? row.scraped_markdown : undefined,
  };
}

/**
 * Fetch a single full audit record by project + URL.
 * Used by the Discover pages modal to load full analysis on demand.
 */
export async function getAuditByUrl(
  projectId: string,
  url: string
): Promise<{ success: true; record: PersistedBlogAudit } | { success: false; error: string }> {
  const { project, error } = await ensureOwner(projectId);
  if (error || !project) return { success: false, error: error ?? 'Project not found' };

  const { data: row, error: qErr } = await supabaseAdmin
    .from('blog_audits')
    .select('*')
    .eq('project_id', projectId)
    .eq('url', url)
    .maybeSingle();

  if (qErr) return { success: false, error: qErr.message };
  if (!row) return { success: false, error: 'No audit found for this URL.' };

  return { success: true, record: rowToRecord(row as AuditRow) };
}
