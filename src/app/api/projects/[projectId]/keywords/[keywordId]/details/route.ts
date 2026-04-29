/**
 * GET /api/projects/:projectId/keywords/:keywordId/details
 *
 * Lazy-loaded payload for the keyword drilldown modal.
 *
 * Auth:    Clerk middleware enforces login on the route prefix; we additionally
 *          verify project ownership + that the keyword belongs to the project.
 * Caching: 7-day cache via `keyword_details.last_fetched_at`. Pass
 *          `?refresh=1` to bypass the cache.
 *
 * The response body is shaped exactly as the keywords-modal UI expects (see
 * `KeywordModalResponse` in `src/lib/keyword-modal.ts`).
 *
 * IMPORTANT: this route is intentionally **not** called for all 50 keywords
 * upfront — fire it lazily when the user opens the modal. Background warming
 * happens automatically when a keyword is approved (see
 * `enrichKeywordInBackground` wiring in `keyword-actions.ts`).
 */

import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getOrFetchKeywordModalDetails } from '@/lib/keyword-modal';

export const runtime = 'nodejs';
// Worst-case: 7-call Ahrefs fan-out (overview / history / by-country / 4 idea
// tabs / SERP overview) plus optional parent-topic lookup. ~25s per Ahrefs
// timeout × parallelized — give ourselves headroom.
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ projectId: string; keywordId: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { projectId, keywordId } = await params;

  if (!projectId || !keywordId) {
    return NextResponse.json(
      { success: false, error: 'projectId and keywordId are required' },
      { status: 400 }
    );
  }

  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  // Ownership check #1: project belongs to the user.
  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (pErr) {
    console.error('[keywords/details] project lookup failed:', pErr.message);
    return NextResponse.json(
      { success: false, error: pErr.message },
      { status: 500 }
    );
  }
  if (!project) {
    return NextResponse.json(
      { success: false, error: 'Project not found' },
      { status: 404 }
    );
  }

  // Ownership check #2: keyword belongs to the project.
  const { data: keyword, error: kErr } = await supabaseAdmin
    .from('keywords')
    .select('id')
    .eq('id', keywordId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (kErr) {
    console.error('[keywords/details] keyword lookup failed:', kErr.message);
    return NextResponse.json(
      { success: false, error: kErr.message },
      { status: 500 }
    );
  }
  if (!keyword) {
    return NextResponse.json(
      { success: false, error: 'Keyword not found' },
      { status: 404 }
    );
  }

  const url = new URL(req.url);
  const forceRefresh =
    url.searchParams.get('refresh') === '1' || url.searchParams.get('refresh') === 'true';

  try {
    const data = await getOrFetchKeywordModalDetails({
      projectId,
      keywordId,
      forceRefresh,
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[keywords/details] failed:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
