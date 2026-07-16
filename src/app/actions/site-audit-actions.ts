'use server';

/**
 * Site-wide content audit (Tier 1: cheap, LLM-free).
 *
 * Auditing an entire site (potentially 1000s of pages) with the full LLM audit
 * would be far too slow and expensive. Instead this enqueues durable
 * `site_audit_scan` jobs — each quick-scans a chunk of URLs using only the
 * deterministic scorers (no Claude / DataForSEO / competitor scraping). Results
 * land in the same Audit History as full audits, so the user can then run a
 * deep (LLM) audit only on the weak pages the scan surfaces.
 *
 * Before scanning, the UI shows a plan (pages grouped by category) so the user
 * picks exactly what to audit — non-content pages (product/landing) are
 * de-suggested by default and can be skipped, keeping scans fast and focused.
 */

import { createHash } from 'crypto';
import { after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { getActiveJobs, requeueStale } from '@/lib/jobs/service';
import { runJob } from '@/lib/jobs/runner';
import { isContentUrl, looksLikeBlogPostUrl } from '@/lib/jina';
import type { SiteAuditScanJobPayload } from '@/lib/jobs/types';

/** URLs per scan job. Each job scans its chunk sequentially (network-bound). */
const CHUNK_SIZE = 15;
/** Hard cap so a giant site can't enqueue unbounded work in one click. */
const MAX_URLS = 3000;

/** Path segments that signal editorial/content pages worth auditing (pre-selected). */
const CONTENT_CATEGORY_KEYS = new Set([
  'blog', 'blogs', 'article', 'articles', 'post', 'posts', 'resource', 'resources',
  'guide', 'guides', 'glossary', 'hr-glossary', 'insight', 'insights', 'news',
  'story', 'stories', 'learn', 'tutorial', 'tutorials', 'help', 'knowledge', 'kb',
]);
/** Path segments that are clearly not blog content (de-selected by default). */
const NON_CONTENT_CATEGORY_KEYS = new Set([
  'functions', 'solutions', 'industries', 'pricing', 'about', 'about-us', 'contact',
  'contact-us', 'careers', 'product', 'products', 'features', 'partners', 'legal',
]);

async function ownedUserId(projectId: string): Promise<string | null> {
  // auth() reads the session locally (no Clerk API round-trip), so the frequent
  // progress polling during a scan can't trip Clerk's rate limit.
  const { userId } = await auth();
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from('projects').select('id').eq('id', projectId).eq('user_id', userId).single();
  return data ? userId : null;
}

/** Canonical key for matching a URL across sitemap + audit rows (drops hash/trailing slash). */
function urlKey(url: string): string {
  return url.trim().replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
}

/** Derives a category { key, label } from a URL's first path segment. */
function categoryOf(url: string): { key: string; label: string } {
  let seg = '';
  try {
    seg = new URL(url).pathname.split('/').filter(Boolean)[0] ?? '';
  } catch { /* leave empty */ }
  if (!seg) return { key: '_root', label: 'Top-level pages' };
  const label = seg.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { key: seg.toLowerCase(), label };
}

/** Whether a page should be pre-selected for auditing (content-like, not a product/landing page). */
function isSuggested(url: string, categoryKey: string): boolean {
  if (NON_CONTENT_CATEGORY_KEYS.has(categoryKey)) return false;
  if (CONTENT_CATEGORY_KEYS.has(categoryKey)) return true;
  return looksLikeBlogPostUrl(url);
}

interface SitemapRow { url: string; title: string | null }

/** All candidate content URLs from the sitemap inventory + brief blog list (deduped). */
async function collectCandidates(projectId: string): Promise<SitemapRow[]> {
  const [sitemap, brief] = await Promise.all([
    supabaseAdmin.from('project_sitemap_urls').select('url, title').eq('project_id', projectId).limit(MAX_URLS),
    supabaseAdmin.from('project_briefs').select('brief').eq('project_id', projectId).maybeSingle(),
  ]);

  const briefUrls = ((brief.data?.brief as { blog_urls?: string[] } | null)?.blog_urls) ?? [];
  const rows: SitemapRow[] = [
    ...(sitemap.data ?? []).map(r => ({ url: r.url as string, title: (r.title as string) ?? '' })),
    ...briefUrls.map(u => ({ url: u, title: '' })),
  ];

  const seen = new Set<string>();
  const out: SitemapRow[] = [];
  for (const row of rows) {
    if (typeof row.url !== 'string' || !/^https?:\/\//i.test(row.url) || !isContentUrl(row.url)) continue;
    const key = urlKey(row.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: row.url.trim(), title: row.title });
    if (out.length >= MAX_URLS) break;
  }
  return out;
}

// ── Plan (for the pre-scan modal) ─────────────────────────────────────────────

export interface ScanPlanPage {
  url: string;
  title: string;
  /** Already has an audit result — pre-checked and locked in the modal. */
  audited: boolean;
  /** Content-like page — pre-checked (but changeable). */
  suggested: boolean;
}
export interface ScanPlanCategory {
  key: string;
  label: string;
  pages: ScanPlanPage[];
}
export interface SiteAuditPlan {
  success: boolean;
  error?: string;
  categories: ScanPlanCategory[];
  totalPages: number;
  auditedCount: number;
}

/** Builds the pre-scan plan: candidate pages grouped by category, marking which are already audited. */
export async function getSiteAuditPlan(projectId: string): Promise<SiteAuditPlan> {
  const userId = await ownedUserId(projectId);
  if (!userId) return { success: false, error: 'Project not found', categories: [], totalPages: 0, auditedCount: 0 };

  const [candidates, auditedRes] = await Promise.all([
    collectCandidates(projectId),
    supabaseAdmin.from('blog_audits').select('url').eq('project_id', projectId).eq('page_status', 'ok').limit(MAX_URLS),
  ]);
  const auditedKeys = new Set((auditedRes.data ?? []).map(r => urlKey(r.url as string)));

  const byCat = new Map<string, ScanPlanCategory>();
  let auditedCount = 0;
  for (const c of candidates) {
    const cat = categoryOf(c.url);
    const audited = auditedKeys.has(urlKey(c.url));
    if (audited) auditedCount++;
    const page: ScanPlanPage = {
      url: c.url,
      title: c.title || c.url,
      audited,
      suggested: audited || isSuggested(c.url, cat.key),
    };
    const bucket = byCat.get(cat.key) ?? { key: cat.key, label: cat.label, pages: [] };
    bucket.pages.push(page);
    byCat.set(cat.key, bucket);
  }

  // Content categories first, then by page count.
  const categories = [...byCat.values()].sort((a, b) => {
    const aC = CONTENT_CATEGORY_KEYS.has(a.key) ? 0 : 1;
    const bC = CONTENT_CATEGORY_KEYS.has(b.key) ? 0 : 1;
    return aC !== bC ? aC - bC : b.pages.length - a.pages.length;
  });
  categories.forEach(c => c.pages.sort((a, b) => a.title.localeCompare(b.title)));

  return { success: true, categories, totalPages: candidates.length, auditedCount };
}

// ── Start scan ────────────────────────────────────────────────────────────────

export interface StartSiteAuditResult {
  success: boolean;
  error?: string;
  totalUrls?: number;
  jobsQueued?: number;
}

/**
 * Enqueues a quick scan for the given URLs (or every content URL when omitted).
 * Returns immediately; jobs drain in the background (resumable, idempotent per
 * chunk). Safe to call again — an in-flight identical chunk won't be re-queued,
 * but a completed one can be re-scanned.
 */
export async function startSiteAudit(projectId: string, urls?: string[]): Promise<StartSiteAuditResult> {
  const userId = await ownedUserId(projectId);
  if (!userId) return { success: false, error: 'Project not found' };

  let targets: string[];
  if (urls?.length) {
    const seen = new Set<string>();
    targets = [];
    for (const u of urls) {
      if (typeof u !== 'string' || !/^https?:\/\//i.test(u) || !isContentUrl(u)) continue;
      const key = urlKey(u);
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(u.trim());
      if (targets.length >= MAX_URLS) break;
    }
  } else {
    targets = (await collectCandidates(projectId)).map(c => c.url);
  }

  if (!targets.length) {
    return { success: false, error: 'No pages selected to scan.' };
  }

  let jobsQueued = 0;
  for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
    const chunk = targets.slice(i, i + CHUNK_SIZE);
    const payload: SiteAuditScanJobPayload = { projectId, urls: chunk };
    // Hash the chunk so an identical in-flight batch dedupes, but a re-scan
    // after completion (different or same selection) can enqueue fresh work.
    const chunkHash = createHash('sha1').update(chunk.map(urlKey).sort().join('|')).digest('hex').slice(0, 12);
    try {
      const { created } = await enqueueJob({
        type: 'site_audit_scan',
        projectId,
        userId,
        payload: payload as unknown as Record<string, unknown>,
        idempotencyKey: `site-scan:${projectId}:${chunkHash}`,
      });
      if (created) jobsQueued++;
    } catch {
      /* one chunk failing to enqueue shouldn't abort the rest */
    }
  }

  return { success: true, totalUrls: targets.length, jobsQueued };
}

// ── Progress ──────────────────────────────────────────────────────────────────

export interface SiteAuditProgress {
  success: boolean;
  active: number;
  scanned: number;
}

/**
 * Progress for the site scan: active scan jobs + how many URLs have been scanned
 * so far. Also nudges pending jobs after the response so the scan advances while
 * the user watches — the same cron-free self-heal pattern as single audits, so a
 * scan keeps running (and resumes) even across a page refresh.
 */
export async function getSiteAuditProgress(projectId: string): Promise<SiteAuditProgress> {
  const userId = await ownedUserId(projectId);
  if (!userId) return { success: false, active: 0, scanned: 0 };

  const [jobs, scannedRes] = await Promise.all([
    getActiveJobs(projectId, ['site_audit_scan']),
    supabaseAdmin
      .from('blog_audits')
      .select('url', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('analysis->>_source', 'site_scan'),
  ]);

  if (jobs.length > 0) {
    try {
      after(async () => {
        try {
          await requeueStale();
          for (const j of jobs) {
            if (j.status === 'pending') {
              try { await runJob(j.id); } catch { /* retried next poll */ }
            }
          }
        } catch { /* best-effort backstop */ }
      });
    } catch { /* not in a request scope */ }
  }

  return { success: true, active: jobs.length, scanned: scannedRes.count ?? 0 };
}
