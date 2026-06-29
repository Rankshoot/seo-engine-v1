import { supabaseAdmin } from '@/lib/supabase';

export interface GSCConnection {
  id: string;
  project_id: string;
  site_url: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface GSCSiteMetrics {
  total_clicks: number;
  total_impressions: number;
  avg_ctr: number;
  avg_position: number;
  synced_at: string | null;
}

export interface GSCUrlMetric {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  top_query: string | null;
  top_query_impressions: number | null;
}

const GSC_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GSC_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

/** Build Google OAuth URL — includes offline access so we get a refresh token. */
export function buildGSCAuthUrl(projectId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GSC_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: projectId,
  });
  return `${GSC_AUTH_URL}?${params.toString()}`;
}

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeGSCCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(GSC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GSC token exchange failed: ${res.status} ${body}`);
  }

  const json = await res.json();
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
  };
}

/** Refresh an expired access token using the stored refresh token. */
export async function refreshGSCToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(GSC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GSC token refresh failed: ${res.status} ${body}`);
  }

  const json = await res.json();
  return { access_token: json.access_token, expires_in: json.expires_in };
}

/**
 * Return a valid access token for the given connection.
 * If the token is expired (or within 60s of expiry), refreshes it and updates the DB row.
 * Returns null if refresh fails.
 */
export async function getValidGSCToken(connection: GSCConnection): Promise<string | null> {
  const expiresAt = new Date(connection.expires_at).getTime();
  const nowPlus60 = Date.now() + 60_000;

  if (expiresAt > nowPlus60) {
    return connection.access_token;
  }

  try {
    const { access_token, expires_in } = await refreshGSCToken(connection.refresh_token);
    const newExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    await supabaseAdmin
      .from('gsc_connections')
      .update({ access_token, expires_at: newExpiresAt, updated_at: new Date().toISOString() })
      .eq('id', connection.id);

    return access_token;
  } catch {
    return null;
  }
}

/** Fetch all GSC verified properties for the given access token. */
export async function listGSCSites(accessToken: string): Promise<string[]> {
  const res = await fetch(`${GSC_API_BASE}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`listGSCSites failed: ${res.status} ${body}`);
  }

  const json = await res.json();
  const entries: Array<{ siteUrl: string; permissionLevel: string }> = json.siteEntry ?? [];
  return entries.map(e => e.siteUrl);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch search analytics by page for the given site, over the last `days` days.
 * Also fetches per-page top queries and merges them.
 */
export async function fetchGSCPageMetrics(
  accessToken: string,
  siteUrl: string,
  days = 28
): Promise<GSCUrlMetric[]> {
  const endDate = isoDate(new Date());
  const startDateObj = new Date();
  startDateObj.setDate(startDateObj.getDate() - days);
  const startDate = isoDate(startDateObj);

  const encodedSite = encodeURIComponent(siteUrl);

  // Query 1: page-level aggregates
  const pageRes = await fetch(
    `${GSC_API_BASE}/sites/${encodedSite}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['page'],
        rowLimit: 1000,
      }),
    }
  );

  if (!pageRes.ok) {
    const body = await pageRes.text();
    throw new Error(`fetchGSCPageMetrics (page query) failed: ${pageRes.status} ${body}`);
  }

  const pageJson = await pageRes.json();
  const pageRows: Array<{
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }> = pageJson.rows ?? [];

  // Build initial map
  const metricsMap = new Map<string, GSCUrlMetric>();
  for (const row of pageRows) {
    const url = row.keys[0];
    metricsMap.set(url, {
      url,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      top_query: null,
      top_query_impressions: null,
    });
  }

  // Query 2: page + query to get top query per URL
  const queryRes = await fetch(
    `${GSC_API_BASE}/sites/${encodedSite}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['page', 'query'],
        rowLimit: 1000,
      }),
    }
  );

  if (queryRes.ok) {
    const queryJson = await queryRes.json();
    const queryRows: Array<{
      keys: string[];
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }> = queryJson.rows ?? [];

    // For each page, find the query with the most impressions
    const topQueryMap = new Map<string, { query: string; impressions: number }>();
    for (const row of queryRows) {
      const [page, query] = row.keys;
      const existing = topQueryMap.get(page);
      if (!existing || row.impressions > existing.impressions) {
        topQueryMap.set(page, { query, impressions: row.impressions });
      }
    }

    // Merge top queries into metrics
    for (const [url, top] of topQueryMap) {
      const metric = metricsMap.get(url);
      if (metric) {
        metric.top_query = top.query;
        metric.top_query_impressions = top.impressions;
      }
    }
  }

  return Array.from(metricsMap.values());
}

/** Fetch site-level aggregate (total clicks, impressions, CTR, avg position). */
export async function fetchGSCSiteAggregate(
  accessToken: string,
  siteUrl: string,
  days = 28
): Promise<GSCSiteMetrics> {
  const endDate = isoDate(new Date());
  const startDateObj = new Date();
  startDateObj.setDate(startDateObj.getDate() - days);
  const startDate = isoDate(startDateObj);

  const encodedSite = encodeURIComponent(siteUrl);

  const res = await fetch(
    `${GSC_API_BASE}/sites/${encodedSite}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ startDate, endDate, rowLimit: 1 }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`fetchGSCSiteAggregate failed: ${res.status} ${body}`);
  }

  const json = await res.json();
  // When no dimensions, totals come back as a single aggregate row
  const row = json.rows?.[0];

  return {
    total_clicks: row?.clicks ?? 0,
    total_impressions: row?.impressions ?? 0,
    avg_ctr: row?.ctr ?? 0,
    avg_position: row?.position ?? 0,
    synced_at: new Date().toISOString(),
  };
}
