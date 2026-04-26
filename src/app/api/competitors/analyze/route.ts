/**
 * POST /api/competitors/analyze
 *
 * Body: `{ "projectId": "<uuid>" }`
 *
 * Thin REST wrapper over the `runCompetitorBenchmark` server action so the
 * pipeline can be triggered from non-React clients (cron, webhooks, CLI).
 * Auth is enforced by Clerk middleware; the action itself re-checks
 * ownership of the project row.
 */

import { NextResponse } from 'next/server';
import { runCompetitorBenchmark } from '@/app/actions/competitor-actions';

export const runtime = 'nodejs';
// The pipeline calls Serper + Jina + Gemini + DataForSEO sequentially —
// takes a while. Next 15 defaults to 30s for server actions; REST routes
// are fine but long-running so we opt into a higher budget.
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: { projectId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  if (!projectId) {
    return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
  }

  const result = await runCompetitorBenchmark(projectId);
  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
