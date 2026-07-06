'use server';

import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizeDomain } from '@/lib/jina';
import {
  fetchProjectSitemap,
  type SitemapTraceEntry,
  type SitemapUrlRecord,
} from '@/lib/sitemap';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SitemapSettings {
  sitemapUrl: string;
  source: '' | 'auto' | 'manual';
  status: 'pending' | 'found' | 'empty' | 'failed';
  syncedAt: string | null;
  urlCount: number;
  promptDismissed: boolean;
  /** True when the DB hasn't had the sitemap migration applied yet. */
  needsMigration?: boolean;
}

export interface SitemapLinkItem {
  url: string;
  title: string;
  kind: string;
}

type SitemapActionResult =
  | { success: true; settings: SitemapSettings; trace: SitemapTraceEntry[] }
  | { success: false; error: string; trace: SitemapTraceEntry[] };

const DEFAULT_SETTINGS: SitemapSettings = {
  sitemapUrl: '',
  source: '',
  status: 'pending',
  syncedAt: null,
  urlCount: 0,
  promptDismissed: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadOwnedProject(projectId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, domain, sitemap_url, sitemap_source, sitemap_status, sitemap_synced_at, sitemap_url_count, sitemap_prompt_dismissed_at')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Migration not applied yet — fall back to the bare project row.
    if (/sitemap_|schema cache|column/i.test(error.message)) {
      const { data: bare, error: bareErr } = await supabaseAdmin
        .from('projects')
        .select('id, domain')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle();
      if (bareErr || !bare) return { ok: false as const, needsMigration: true, project: null };
      return { ok: true as const, needsMigration: true, project: bare as Record<string, unknown> & { id: string; domain: string } };
    }
    return { ok: false as const, needsMigration: false, project: null };
  }
  if (!data) return { ok: false as const, needsMigration: false, project: null };
  return { ok: true as const, needsMigration: false, project: data as Record<string, unknown> & { id: string; domain: string } };
}

function toSettings(row: Record<string, unknown>, needsMigration = false): SitemapSettings {
  return {
    sitemapUrl: (row.sitemap_url as string) ?? '',
    source: ((row.sitemap_source as string) ?? '') as SitemapSettings['source'],
    status: ((row.sitemap_status as string) ?? 'pending') as SitemapSettings['status'],
    syncedAt: (row.sitemap_synced_at as string) ?? null,
    urlCount: (row.sitemap_url_count as number) ?? 0,
    promptDismissed: Boolean(row.sitemap_prompt_dismissed_at),
    needsMigration,
  };
}

/** Replace the stored URL inventory and update the project's sitemap columns. */
async function persistSitemap(
  projectId: string,
  sitemapUrl: string,
  source: 'auto' | 'manual',
  status: SitemapSettings['status'],
  records: SitemapUrlRecord[],
  trace: SitemapTraceEntry[]
): Promise<void> {
  // Replace the inventory wholesale — simpler than diffing, and the table is
  // project-scoped + cheap to recreate.
  const { error: delErr } = await supabaseAdmin
    .from('project_sitemap_urls')
    .delete()
    .eq('project_id', projectId);
  if (delErr) trace.push({ step: 'db_clear', ok: false, detail: delErr.message });

  if (records.length) {
    // Insert in chunks to stay well under payload limits on large sites.
    const CHUNK = 500;
    for (let i = 0; i < records.length; i += CHUNK) {
      const slice = records.slice(i, i + CHUNK).map(r => ({
        project_id: projectId,
        url: r.url,
        path: r.path,
        kind: r.kind,
        title: r.title,
      }));
      const { error: insErr } = await supabaseAdmin.from('project_sitemap_urls').insert(slice);
      if (insErr) {
        trace.push({ step: 'db_insert', ok: false, detail: insErr.message });
        break;
      }
    }
    trace.push({ step: 'db_insert', ok: true, detail: `${records.length} rows` });
  }

  const { error: updErr } = await supabaseAdmin
    .from('projects')
    .update({
      sitemap_url: sitemapUrl,
      sitemap_source: source,
      sitemap_status: status,
      sitemap_synced_at: new Date().toISOString(),
      sitemap_url_count: records.length,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);
  if (updErr) trace.push({ step: 'db_update', ok: false, detail: updErr.message });
}

// ─── Read settings ────────────────────────────────────────────────────────────

export async function getSitemapSettings(
  projectId: string
): Promise<{ success: boolean; settings: SitemapSettings; error?: string }> {
  const user = await currentUser();
  if (!user) return { success: false, settings: DEFAULT_SETTINGS, error: 'Not authenticated' };

  const loaded = await loadOwnedProject(projectId, user.id);
  if (!loaded.ok || !loaded.project) {
    if (loaded.needsMigration) {
      return { success: true, settings: { ...DEFAULT_SETTINGS, needsMigration: true } };
    }
    return { success: false, settings: DEFAULT_SETTINGS, error: 'Project not found' };
  }
  if (loaded.needsMigration) {
    return { success: true, settings: { ...DEFAULT_SETTINGS, needsMigration: true } };
  }
  return { success: true, settings: toSettings(loaded.project) };
}

// ─── Auto-discovery (default path, runs once per project) ──────────────────────

/**
 * Attempt to auto-discover and store the project's sitemap from its domain.
 * Safe to call on project entry: it only does work when status is 'pending'
 * (never attempted) unless `force` is set. Caches the outcome so we never
 * re-probe on every page load.
 */
export async function autoDiscoverSitemap(
  projectId: string,
  opts: { force?: boolean } = {}
): Promise<SitemapActionResult> {
  const trace: SitemapTraceEntry[] = [];
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', trace };

  const loaded = await loadOwnedProject(projectId, user.id);
  if (!loaded.ok || !loaded.project) {
    return { success: false, error: loaded.needsMigration ? 'Run the sitemap migration first.' : 'Project not found', trace };
  }
  if (loaded.needsMigration) {
    return { success: false, error: 'Run the sitemap migration first.', trace };
  }

  const current = toSettings(loaded.project);

  // Respect an already-configured / already-attempted state unless forced.
  if (!opts.force && (current.sitemapUrl || current.status !== 'pending')) {
    trace.push({ step: 'skip', ok: true, detail: `status=${current.status} url=${current.sitemapUrl || '(none)'}` });
    return { success: true, settings: current, trace };
  }

  const domain = loaded.project.domain;
  const result = await fetchProjectSitemap({ domain });
  trace.push(...result.trace);

  await persistSitemap(projectId, result.sitemapUrl, 'auto', result.status, result.records, trace);

  return {
    success: true,
    settings: {
      ...current,
      sitemapUrl: result.sitemapUrl,
      source: 'auto',
      status: result.status,
      syncedAt: new Date().toISOString(),
      urlCount: result.records.length,
    },
    trace,
  };
}

// ─── Save / override a sitemap URL (manual) ────────────────────────────────────

export async function saveSitemapUrl(projectId: string, rawUrl: string): Promise<SitemapActionResult> {
  const trace: SitemapTraceEntry[] = [];
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', trace };

  const loaded = await loadOwnedProject(projectId, user.id);
  if (!loaded.ok || !loaded.project) {
    return { success: false, error: loaded.needsMigration ? 'Run the sitemap migration first.' : 'Project not found', trace };
  }
  if (loaded.needsMigration) {
    return { success: false, error: 'Run the sitemap migration first.', trace };
  }

  const url = normalizeDomain((rawUrl || '').trim());
  if (!/^https?:\/\/.+/i.test(url)) {
    return { success: false, error: 'Enter a valid sitemap URL (e.g. https://example.com/sitemap.xml).', trace };
  }

  const result = await fetchProjectSitemap({ domain: loaded.project.domain, sitemapUrl: url });
  trace.push(...result.trace);

  if (result.status === 'failed' || (result.status === 'empty' && result.records.length === 0)) {
    // Still record the attempt + URL so the UI reflects it, but flag the miss.
    await persistSitemap(projectId, url, 'manual', result.status === 'failed' ? 'failed' : 'empty', [], trace);
    return {
      success: false,
      error: 'That sitemap returned no usable page URLs. Check the URL and try again.',
      trace,
    };
  }

  await persistSitemap(projectId, url, 'manual', 'found', result.records, trace);

  return {
    success: true,
    settings: {
      ...toSettings(loaded.project),
      sitemapUrl: url,
      source: 'manual',
      status: 'found',
      syncedAt: new Date().toISOString(),
      urlCount: result.records.length,
    },
    trace,
  };
}

// ─── Refresh (re-fetch the configured sitemap, or re-discover) ─────────────────

export async function refreshSitemap(projectId: string): Promise<SitemapActionResult> {
  const trace: SitemapTraceEntry[] = [];
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', trace };

  const loaded = await loadOwnedProject(projectId, user.id);
  if (!loaded.ok || !loaded.project) {
    return { success: false, error: loaded.needsMigration ? 'Run the sitemap migration first.' : 'Project not found', trace };
  }
  if (loaded.needsMigration) {
    return { success: false, error: 'Run the sitemap migration first.', trace };
  }

  const current = toSettings(loaded.project);
  const result = await fetchProjectSitemap({
    domain: loaded.project.domain,
    sitemapUrl: current.sitemapUrl || undefined,
  });
  trace.push(...result.trace);

  const source: 'auto' | 'manual' = current.source === 'manual' ? 'manual' : 'auto';
  await persistSitemap(projectId, result.sitemapUrl || current.sitemapUrl, source, result.status, result.records, trace);

  return {
    success: true,
    settings: {
      ...current,
      sitemapUrl: result.sitemapUrl || current.sitemapUrl,
      source,
      status: result.status,
      syncedAt: new Date().toISOString(),
      urlCount: result.records.length,
    },
    trace,
  };
}

// ─── List stored links (for the view-only verify modal) ────────────────────────

export async function listSitemapLinks(
  projectId: string,
  opts: { limit?: number; offset?: number; search?: string } = {}
): Promise<{ success: boolean; items: SitemapLinkItem[]; total: number; error?: string }> {
  const user = await currentUser();
  if (!user) return { success: false, items: [], total: 0, error: 'Not authenticated' };

  const { data: owned } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!owned) return { success: false, items: [], total: 0, error: 'Project not found' };

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  let query = supabaseAdmin
    .from('project_sitemap_urls')
    .select('url, title, kind', { count: 'exact' })
    .eq('project_id', projectId);

  if (opts.search?.trim()) {
    const q = `%${opts.search.trim().replace(/[%_,]/g, '')}%`;
    query = query.or(`url.ilike.${q},title.ilike.${q}`);
  }

  const { data, error, count } = await query
    .order('kind', { ascending: true })
    .order('url', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) return { success: false, items: [], total: 0, error: error.message };

  return {
    success: true,
    items: (data ?? []) as SitemapLinkItem[],
    total: count ?? (data?.length ?? 0),
  };
}

// ─── Dismiss the onboarding prompt ─────────────────────────────────────────────

export async function dismissSitemapPrompt(projectId: string): Promise<{ success: boolean; error?: string }> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { error } = await supabaseAdmin
    .from('projects')
    .update({ sitemap_prompt_dismissed_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', user.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
