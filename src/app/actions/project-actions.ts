'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import {
  ahrefsDomainOverview,
  ahrefsOrganicCompetitors,
  ahrefsTopPages,
  isAhrefsConfigured,
  type AhrefsCompetitor,
  type AhrefsDomainOverview,
  type AhrefsTopPage,
} from '@/lib/ahrefs';
import { normalizeDomain } from '@/lib/keyword-discovery';
import { Project } from '@/lib/types';
import { getBlogAudits } from '@/app/actions/audit-actions';
import { geminiGenerate } from '@/lib/gemini';

export type ProjectTargetingSuggestField = 'niche' | 'target_audience' | 'brand_voice' | 'brand_values' | 'brand_description';

export type ProjectTargetingSuggestTraceEntry = {
  step: string;
  ok: boolean;
  ms?: number;
  detail?: string;
};

function parseFourCommaSeparatedPhrases(raw: string): string {
  let s = raw
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();
  s = s.replace(/^["']|["']$/g, '');
  const parts = s
    .split(',')
    .map(p => p.replace(/^\s*\d+[\.)]\s*/, '').trim())
    .filter(Boolean);
  return parts.slice(0, 4).join(', ');
}

/**
 * Gemini-backed suggestions for the new-project modal when the user is unsure
 * about niche or target audience. Client should `console.log` the trace.
 */
export async function suggestProjectTargetingField(input: {
  field: ProjectTargetingSuggestField;
  company: string;
  domain: string;
  description: string;
}): Promise<
  | { success: true; value: string; trace: ProjectTargetingSuggestTraceEntry[] }
  | { success: false; error: string; trace: ProjectTargetingSuggestTraceEntry[] }
> {
  const trace: ProjectTargetingSuggestTraceEntry[] = [];
  const user = await currentUser();
  if (!user) {
    trace.push({ step: 'auth', ok: false, detail: 'not signed in' });
    return { success: false, error: 'Not authenticated', trace };
  }

  const company = input.company.trim();
  const domain = input.domain.trim();
  const description = input.description.trim();

  if (!company || !domain) {
    trace.push({ step: 'validate', ok: false, detail: 'company and domain required' });
    return {
      success: false,
      error: 'Add company name and website domain first so AI can infer niche, audience, and brand persona.',
      trace,
    };
  }

  const isNiche = input.field === 'niche';
  const isAudience = input.field === 'target_audience';
  const isVoice = input.field === 'brand_voice';
  const isValues = input.field === 'brand_values';
  const isDescription = input.field === 'brand_description';

  const t0 = Date.now();
  let prompt = '';
  if (isNiche) {
    prompt = `You help configure SEO projects. Infer concise industry / niche labels for keyword discovery (not generic fluff).

Company: ${company}
Website domain: ${domain}
Project notes (may be empty): ${description || '(none)'}

Reply with ONE line only: exactly 4 short niche or industry phrases, comma-separated, no numbering, bullets, quotes, or explanation. Each phrase: 2–4 words. Ground guesses in the company name and domain.`;
  } else if (isAudience) {
    prompt = `You help configure SEO projects. Infer plausible target reader / buyer segments for content marketing.

Company: ${company}
Website domain: ${domain}
Project notes (may be empty): ${description || '(none)'}

Reply with ONE line only: exactly 4 short audience descriptions, comma-separated, no numbering, bullets, quotes, or explanation. Each segment: 2-4 words (role + context, e.g. "HR directors at 200–2000 employee firms"). Ground guesses in the company name and domain.`;
  } else if (isVoice) {
    prompt = `You help configure SEO projects. Infer a concise brand voice or tone description (e.g. "professional, authoritative, and helpful" or "conversational, witty, and bold").

Company: ${company}
Website domain: ${domain}
Project notes (may be empty): ${description || '(none)'}

Reply with ONE line only: exactly 3-4 comma-separated adjectives describing the brand voice, no numbering, bullets, quotes, or explanation. Ground guesses in the company name and domain.`;
  } else if (isValues) {
    prompt = `You help configure SEO projects. Infer plausible core brand values or key messaging themes.

Company: ${company}
Website domain: ${domain}
Project notes (may be empty): ${description || '(none)'}

Reply with ONE line only: exactly 3 short values or message themes, comma-separated, no numbering, bullets, quotes, or explanation. Ground guesses in the company name and domain.`;
  } else {
    prompt = `You help configure SEO projects. Infer a brief brand persona description as if the brand were a person (e.g., "An expert advisor who explains complex topics simply and avoids corporate jargon").

Company: ${company}
Website domain: ${domain}
Project notes (may be empty): ${description || '(none)'}

Reply with ONE paragraph only: a brief 1-2 sentence description of the brand's personality. Do not include quotes, numbering, or bullet points. Ground guesses in the company name and domain.`;
  }

  try {
    const raw = (await geminiGenerate(prompt, 2)).trim();
    const value = isDescription
      ? raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim().replace(/^["']|["']$/g, '')
      : parseFourCommaSeparatedPhrases(raw);
    const ms = Date.now() - t0;
    if (!value) {
      trace.push({ step: 'gemini_targeting_suggest', ok: false, ms, detail: 'empty after parse' });
      return { success: false, error: 'AI returned no usable text. Try again.', trace };
    }
    trace.push({
      step: 'gemini_targeting_suggest',
      ok: true,
      ms,
      detail: `${input.field} chars=${value.length}`,
    });
    return { success: true, value, trace };
  } catch (e: unknown) {
    const ms = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    trace.push({ step: 'gemini_targeting_suggest', ok: false, ms, detail: msg.slice(0, 400) });
    return { success: false, error: msg || 'AI request failed', trace };
  }
}

export async function createProject(data: {
  name: string;
  domain: string;
  company: string;
  niche: string;
  target_audience: string;
  target_region: string;
  target_language: string;
  description: string;
  competitors: string[];
  ahrefs_rank_tracker_project_id?: number | null;
  brand_voice?: string;
  brand_values?: string;
  brand_description?: string;
}) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { competitors, ahrefs_rank_tracker_project_id, ...projectData } = data;

  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .insert({
      ...projectData,
      user_id: user.id,
      ahrefs_rank_tracker_project_id: ahrefs_rank_tracker_project_id ?? null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  const validCompetitors = competitors.filter(c => c.trim());
  if (validCompetitors.length > 0) {
    await supabaseAdmin.from('project_competitors').insert(
      validCompetitors.map(domain => ({ project_id: project.id, domain: domain.trim() }))
    );
  }

  // Fetch the full project with competitors populated before returning
  const fullProject = await getProject(project.id);
  if (fullProject.success && fullProject.data) {
    return { success: true, data: fullProject.data };
  }

  return { success: true, data: project as Project };
}

export async function getProjects() {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: [] as Project[] };

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*, project_competitors(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message, data: [] as Project[] };
  return { success: true, data: data as Project[] };
}

export async function getProject(id: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null };

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*, project_competitors(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) return { success: false, error: error.message, data: null };
  return { success: true, data: data as Project };
}

export async function deleteProject(id: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { error } = await supabaseAdmin
    .from('projects')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Update an existing project. When `competitors` is passed we replace the
 * project's competitor list wholesale (simpler than diffing — the list is
 * short and recreated cheaply). Omitting `competitors` leaves it untouched.
 */
export async function updateProject(
  id: string,
  data: {
    name: string;
    domain: string;
    company: string;
    niche: string;
    target_audience: string;
    target_region: string;
    description: string;
    competitors?: string[];
    ahrefs_rank_tracker_project_id?: number | null;
    brand_voice?: string;
    brand_values?: string;
    brand_description?: string;
  }
) {
  const user = await currentUser();
  if (!user) return { success: false as const, error: 'Not authenticated' };

  // Ownership check — deny updates on projects the user doesn't own.
  const { data: existing, error: checkErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (checkErr || !existing) {
    return { success: false as const, error: 'Project not found' };
  }

  const { competitors, ahrefs_rank_tracker_project_id, ...patch } = data;

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('projects')
    .update({
      ...patch,
      ahrefs_rank_tracker_project_id: ahrefs_rank_tracker_project_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (updErr) return { success: false as const, error: updErr.message };

  if (Array.isArray(competitors)) {
    await supabaseAdmin.from('project_competitors').delete().eq('project_id', id);
    const cleaned = competitors.map(c => c.trim()).filter(Boolean);
    if (cleaned.length) {
      const { error: compErr } = await supabaseAdmin
        .from('project_competitors')
        .insert(cleaned.map(domain => ({ project_id: id, domain })));
      if (compErr) return { success: false as const, error: compErr.message };
    }
  }

  // Fetch the full project with competitors populated before returning
  const fullProject = await getProject(id);
  if (fullProject.success && fullProject.data) {
    return { success: true as const, data: fullProject.data };
  }

  return { success: true as const, data: updated as Project };
}

export async function getProjectStats(projectId: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null };

  const [kwResult, calResult, auditRes] = await Promise.all([
    supabaseAdmin.from('keywords').select('status').eq('project_id', projectId),
    supabaseAdmin.from('calendar_entries').select('status').eq('project_id', projectId),
    getBlogAudits(projectId, { summaryOnly: true }),
  ]);

  const blogsFull = await supabaseAdmin
    .from('blogs')
    .select('status, in_articles_library')
    .eq('project_id', projectId);

  const blogs: { status: string; in_articles_library?: boolean }[] =
    blogsFull.error && /in_articles_library|schema cache/i.test(blogsFull.error.message)
      ? ((await supabaseAdmin.from('blogs').select('status').eq('project_id', projectId)).data ?? [])
      : (blogsFull.data ?? []);

  const keywords = kwResult.data ?? [];
  const calendar = calResult.data ?? [];
  const auditPending = auditRes.success ? Math.max(0, auditRes.coverage.blogs_found - auditRes.coverage.blogs_audited) : 0;

  return {
    success: true,
    data: {
      totalKeywords: keywords.length,
      approvedKeywords: keywords.filter(k => k.status === 'approved').length,
      calendarEntries: calendar.length,
      blogsGenerated: blogs.filter(b => ['generated', 'approved', 'published'].includes(b.status)).length,
      articlesInLibrary: blogs.filter(b => Boolean((b as { in_articles_library?: boolean }).in_articles_library)).length,
      auditPending,
    },
  };
}

/** Client can `console.log` this after paid Ahrefs calls (see AGENTS.md). */
export type SiteExplorerTraceEntry = { step: string; ok: boolean; detail?: string };

export type ProjectSiteExplorerData = {
  project: Project;
  /** Bare hostname passed to Ahrefs Site Explorer. */
  target: string;
  ahrefsConfigured: boolean;
  overview: AhrefsDomainOverview | null;
  competitors: AhrefsCompetitor[];
  topPages: AhrefsTopPage[];
  /** When the cached snapshot was last fetched from Ahrefs. Null = never. */
  lastFetchedAt: string | null;
  /** True if this response came from the Supabase cache (vs. a live Ahrefs call). */
  fromCache: boolean;
};

type SiteExplorerSnapshotRow = {
  target: string;
  region: string;
  overview: AhrefsDomainOverview | null;
  competitors: AhrefsCompetitor[];
  top_pages: AhrefsTopPage[];
  last_fetched_at: string;
};

/**
 * Hit Ahrefs for a fresh snapshot of (overview, organic competitors, top pages)
 * and persist it to `project_site_explorer`. Pure data layer — no auth.
 */
async function fetchAndPersistSiteExplorerSnapshot(
  projectId: string,
  target: string,
  region: string,
  trace: SiteExplorerTraceEntry[]
) {
  const overview: AhrefsDomainOverview | null = null;
  const topPages: AhrefsTopPage[] = [];
  const competitors = await ahrefsOrganicCompetitors(target, region, 40);

  trace.push({
    step: 'site_explorer_metrics',
    ok: false,
    detail: 'skipped — disabled endpoint',
  });
  trace.push({
    step: 'organic_competitors',
    ok: competitors.length > 0,
    detail: `${competitors.length} rows for ${target} (${region})`,
  });
  trace.push({
    step: 'top_pages',
    ok: false,
    detail: 'skipped — disabled endpoint',
  });

  const now = new Date().toISOString();
  const { error: upsertErr } = await supabaseAdmin.from('project_site_explorer').upsert(
    {
      project_id: projectId,
      target,
      region,
      overview,
      competitors,
      top_pages: topPages,
      last_fetched_at: now,
      updated_at: now,
    },
    { onConflict: 'project_id' }
  );
  if (upsertErr) {
    trace.push({ step: 'cache_persist', ok: false, detail: upsertErr.message });
  } else {
    trace.push({ step: 'cache_persist', ok: true, detail: `wrote at ${now}` });
  }

  return { overview, competitors, topPages, lastFetchedAt: now };
}

/**
 * Ahrefs Site Explorer snapshot for the project overview: domain metrics,
 * organic competitors (overlap + totals), and top pages.
 *
 * Caching strategy: reads from `project_site_explorer` by default. Only hits
 * Ahrefs when (a) no cached row exists, (b) the project's target domain or
 * region has changed since the last snapshot, or (c) `force: true`. The user
 * controls refreshes via the "Refresh data" button on the overview page.
 *
 * Safe when the API key is missing — returns empty metrics with
 * `ahrefsConfigured: false`.
 */
export async function getProjectSiteExplorerSnapshot(
  projectId: string,
  opts: { force?: boolean } = {}
): Promise<
  | { success: true; data: ProjectSiteExplorerData; trace: SiteExplorerTraceEntry[] }
  | { success: false; error: string; data: null; trace: SiteExplorerTraceEntry[] }
> {
  const trace: SiteExplorerTraceEntry[] = [];
  const user = await currentUser();
  if (!user) {
    return { success: false, error: 'Not authenticated', data: null, trace };
  }

  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('*, project_competitors(*)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (error || !project) {
    trace.push({ step: 'load_project', ok: false, detail: error?.message ?? 'not found' });
    return { success: false, error: 'Project not found', data: null, trace };
  }

  const p = project as Project;
  const target = normalizeDomain(p.domain);
  const region = p.target_region || 'us';

  trace.push({ step: 'normalize_domain', ok: Boolean(target), detail: target || '(empty)' });

  if (!isAhrefsConfigured()) {
    trace.push({ step: 'ahrefs_config', ok: false, detail: 'AHREFS_API_KEY not set' });
    return {
      success: true,
      data: {
        project: p,
        target: target || p.domain,
        ahrefsConfigured: false,
        overview: null,
        competitors: [],
        topPages: [],
        lastFetchedAt: null,
        fromCache: false,
      },
      trace,
    };
  }

  if (!target) {
    trace.push({ step: 'ahrefs_skip', ok: false, detail: 'No valid domain' });
    return {
      success: true,
      data: {
        project: p,
        target: '',
        ahrefsConfigured: true,
        overview: null,
        competitors: [],
        topPages: [],
        lastFetchedAt: null,
        fromCache: false,
      },
      trace,
    };
  }

  // Try the Supabase cache first unless caller asked to force-refresh.
  // We use ANY cached row for this project — even if the project's domain or
  // region has since changed — so we never auto-hit Ahrefs on a normal page
  // visit. The user controls freshness via the "Refresh data" button.
  const { data: cached, error: cacheErr } = await supabaseAdmin
    .from('project_site_explorer')
    .select('target, region, overview, competitors, top_pages, last_fetched_at')
    .eq('project_id', projectId)
    .maybeSingle<SiteExplorerSnapshotRow>();

  if (cacheErr) {
    trace.push({ step: 'cache_query', ok: false, detail: cacheErr.message });
  }

  // Return cached data on every normal page load. Only bypass when:
  //   a) opts.force = true  (explicit "Refresh data" button click), OR
  //   b) no row exists yet  (very first visit for this project)
  if (!opts.force && cached) {
    trace.push({
      step: 'cache_hit',
      ok: true,
      detail: `last_fetched_at=${cached.last_fetched_at} target=${cached.target} region=${cached.region}`,
    });
    return {
      success: true,
      data: {
        project: p,
        target: cached.target || target,
        ahrefsConfigured: true,
        overview: cached.overview,
        competitors: cached.competitors ?? [],
        topPages: cached.top_pages ?? [],
        lastFetchedAt: cached.last_fetched_at,
        fromCache: true,
      },
      trace,
    };
  }

  trace.push({
    step: 'cache_miss',
    ok: false,
    detail: opts.force ? 'force=true (manual refresh)' : 'no row — first fetch',
  });

  const fresh = await fetchAndPersistSiteExplorerSnapshot(projectId, target, region, trace);

  return {
    success: true,
    data: {
      project: p,
      target,
      ahrefsConfigured: true,
      overview: fresh.overview,
      competitors: fresh.competitors,
      topPages: fresh.topPages,
      lastFetchedAt: fresh.lastFetchedAt,
      fromCache: false,
    },
    trace,
  };
}

/**
 * Manual refresh of the Site Explorer snapshot. Always hits Ahrefs and
 * overwrites the cache. Wired to the "Refresh data" button on the overview.
 */
export async function refreshProjectSiteExplorerSnapshot(projectId: string) {
  return getProjectSiteExplorerSnapshot(projectId, { force: true });
}
