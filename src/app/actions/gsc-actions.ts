'use server';

import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getValidGSCToken,
  fetchGSCPageMetrics,
  fetchGSCSiteAggregate,
  type GSCConnection,
  type GSCSiteMetrics,
  type GSCUrlMetric,
} from '@/lib/gsc';

async function ensureOwner(projectId: string) {
  const user = await currentUser();
  if (!user) return { user: null, error: 'Not authenticated' as const };

  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('id, domain')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (error || !project) return { user, error: 'Project not found' as const };
  return { user, project, error: null };
}

/** Get GSC connection for a project (null if not connected). */
export async function getGSCConnection(projectId: string): Promise<{
  success: boolean;
  connected: boolean;
  siteUrl?: string;
  error?: string;
}> {
  try {
    const { error: ownerError } = await ensureOwner(projectId);
    if (ownerError) return { success: false, connected: false, error: ownerError };

    const { data, error } = await supabaseAdmin
      .from('gsc_connections')
      .select('site_url')
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) return { success: false, connected: false, error: error.message };
    if (!data) return { success: true, connected: false };

    return { success: true, connected: true, siteUrl: data.site_url };
  } catch (err) {
    return { success: false, connected: false, error: String(err) };
  }
}

/** Disconnect GSC — deletes connection and all cached metrics. */
export async function disconnectGSC(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: ownerError } = await ensureOwner(projectId);
    if (ownerError) return { success: false, error: ownerError };

    // Delete connection (cascades due to ON DELETE CASCADE not set here, so delete metrics too)
    await supabaseAdmin
      .from('gsc_url_metrics')
      .delete()
      .eq('project_id', projectId);

    await supabaseAdmin
      .from('gsc_site_metrics')
      .delete()
      .eq('project_id', projectId);

    const { error } = await supabaseAdmin
      .from('gsc_connections')
      .delete()
      .eq('project_id', projectId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** Sync GSC metrics — fetches from Google API and upserts to DB. */
export async function syncGSCMetrics(projectId: string): Promise<{
  success: boolean;
  urlsIndexed: number;
  siteMetrics?: GSCSiteMetrics;
  error?: string;
}> {
  try {
    const { error: ownerError } = await ensureOwner(projectId);
    if (ownerError) return { success: false, urlsIndexed: 0, error: ownerError };

    const { data: connectionRow, error: connError } = await supabaseAdmin
      .from('gsc_connections')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (connError || !connectionRow) {
      return { success: false, urlsIndexed: 0, error: 'GSC not connected' };
    }

    const connection = connectionRow as GSCConnection;
    const accessToken = await getValidGSCToken(connection);
    if (!accessToken) {
      return { success: false, urlsIndexed: 0, error: 'Failed to refresh GSC token' };
    }

    const [pageMetrics, siteAggregate] = await Promise.all([
      fetchGSCPageMetrics(accessToken, connection.site_url),
      fetchGSCSiteAggregate(accessToken, connection.site_url),
    ]);

    const now = new Date().toISOString();

    // Upsert URL metrics in batches of 100
    const BATCH = 100;
    for (let i = 0; i < pageMetrics.length; i += BATCH) {
      const batch = pageMetrics.slice(i, i + BATCH).map(m => ({
        project_id: projectId,
        url: m.url,
        clicks: m.clicks,
        impressions: m.impressions,
        ctr: m.ctr,
        position: m.position,
        top_query: m.top_query,
        top_query_impressions: m.top_query_impressions,
        synced_at: now,
        updated_at: now,
      }));

      await supabaseAdmin
        .from('gsc_url_metrics')
        .upsert(batch, { onConflict: 'project_id,url' });
    }

    // Upsert site-level aggregate
    await supabaseAdmin
      .from('gsc_site_metrics')
      .upsert(
        {
          project_id: projectId,
          total_clicks: siteAggregate.total_clicks,
          total_impressions: siteAggregate.total_impressions,
          avg_ctr: siteAggregate.avg_ctr,
          avg_position: siteAggregate.avg_position,
          date_range_days: 28,
          synced_at: now,
          updated_at: now,
        },
        { onConflict: 'project_id' }
      );

    return {
      success: true,
      urlsIndexed: pageMetrics.length,
      siteMetrics: { ...siteAggregate, synced_at: now },
    };
  } catch (err) {
    return { success: false, urlsIndexed: 0, error: String(err) };
  }
}

/** Get stored GSC site metrics (fast, from DB). */
export async function getGSCSiteMetrics(projectId: string): Promise<{
  success: boolean;
  metrics: GSCSiteMetrics | null;
  connected: boolean;
}> {
  try {
    const { error: ownerError } = await ensureOwner(projectId);
    if (ownerError) return { success: false, metrics: null, connected: false };

    // Check if connected
    const { data: conn } = await supabaseAdmin
      .from('gsc_connections')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle();

    if (!conn) return { success: true, metrics: null, connected: false };

    const { data, error } = await supabaseAdmin
      .from('gsc_site_metrics')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) return { success: false, metrics: null, connected: true };
    if (!data) return { success: true, metrics: null, connected: true };

    return {
      success: true,
      connected: true,
      metrics: {
        total_clicks: data.total_clicks,
        total_impressions: data.total_impressions,
        avg_ctr: Number(data.avg_ctr),
        avg_position: Number(data.avg_position),
        synced_at: data.synced_at,
      },
    };
  } catch (err) {
    return { success: false, metrics: null, connected: false };
  }
}

/** Get stored GSC URL metrics with optional filters. */
export async function getGSCUrlMetrics(
  projectId: string,
  opts?: {
    minPosition?: number;
    maxPosition?: number;
    minImpressions?: number;
    limit?: number;
  }
): Promise<{ success: boolean; data: GSCUrlMetric[]; error?: string }> {
  try {
    const { error: ownerError } = await ensureOwner(projectId);
    if (ownerError) return { success: false, data: [], error: ownerError };

    let query = supabaseAdmin
      .from('gsc_url_metrics')
      .select('url, clicks, impressions, ctr, position, top_query, top_query_impressions')
      .eq('project_id', projectId)
      .order('position', { ascending: true });

    if (opts?.minPosition != null) query = query.gte('position', opts.minPosition);
    if (opts?.maxPosition != null) query = query.lte('position', opts.maxPosition);
    if (opts?.minImpressions != null) query = query.gte('impressions', opts.minImpressions);
    if (opts?.limit != null) query = query.limit(opts.limit);

    const { data, error } = await query;

    if (error) return { success: false, data: [], error: error.message };

    return {
      success: true,
      data: (data ?? []).map(row => ({
        url: row.url,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Number(row.ctr),
        position: Number(row.position),
        top_query: row.top_query,
        top_query_impressions: row.top_query_impressions,
      })),
    };
  } catch (err) {
    return { success: false, data: [], error: String(err) };
  }
}

/** Get opportunity pages: position 5–20, impressions > 100, classified by type. */
export async function getGSCOpportunities(projectId: string): Promise<{
  success: boolean;
  opportunities: Array<GSCUrlMetric & { opportunity_type: 'easy_win' | 'refresh' | 'ctr_fix' }>;
}> {
  try {
    const { error: ownerError } = await ensureOwner(projectId);
    if (ownerError) return { success: false, opportunities: [] };

    const { data, error } = await supabaseAdmin
      .from('gsc_url_metrics')
      .select('url, clicks, impressions, ctr, position, top_query, top_query_impressions')
      .eq('project_id', projectId)
      .gte('impressions', 100)
      .lte('position', 20)
      .order('impressions', { ascending: false });

    if (error) return { success: false, opportunities: [] };

    const opportunities: Array<GSCUrlMetric & { opportunity_type: 'easy_win' | 'refresh' | 'ctr_fix' }> = [];

    for (const row of data ?? []) {
      const metric: GSCUrlMetric = {
        url: row.url,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Number(row.ctr),
        position: Number(row.position),
        top_query: row.top_query,
        top_query_impressions: row.top_query_impressions,
      };

      const pos = metric.position;
      const imp = metric.impressions;
      const ctr = metric.ctr;

      if (pos >= 11 && pos <= 20 && imp > 200) {
        opportunities.push({ ...metric, opportunity_type: 'easy_win' });
      } else if (pos >= 5 && pos <= 10 && imp > 500 && ctr < 0.05) {
        opportunities.push({ ...metric, opportunity_type: 'refresh' });
      } else if (pos >= 1 && pos <= 10 && ctr < 0.03 && imp > 100) {
        opportunities.push({ ...metric, opportunity_type: 'ctr_fix' });
      }
    }

    return { success: true, opportunities };
  } catch {
    return { success: false, opportunities: [] };
  }
}
