import { auth } from '@clerk/nextjs/server';
import { apiJson } from '@/server/http/json';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function ensureOwner(projectId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();
  return !error && !!data;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  // auth() reads the session locally (no Clerk API round-trip), so frequent
  // polling during a site scan can't trip Clerk's per-request rate limit.
  const { userId } = await auth();
  if (!userId) return apiJson({ success: false, error: 'Not authenticated', items: [], total: 0, hasMore: false }, { status: 401 });

  const { projectId } = await params;
  const owns = await ensureOwner(projectId, userId);
  if (!owns) return apiJson({ success: false, error: 'Project not found', items: [], total: 0, hasMore: false }, { status: 404 });

  // Pagination — the site scan can produce thousands of audit rows, so history
  // is paged (newest first) and the client loads more / merges new rows in.
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), 100);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  // Filter on the denormalized page_status column so pagination stays accurate
  // (only real, completed audits are ever shown — never non-article/broken pages).
  const { data, error, count } = await supabaseAdmin
    .from('blog_audits')
    .select('url, title, primary_keyword, word_count, health_score, severity, analysis, updated_at', { count: 'exact' })
    .eq('project_id', projectId)
    .eq('page_status', 'ok')
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return apiJson({ success: false, error: error.message, items: [], total: 0, hasMore: false }, { status: 500 });
  }

  const items = (data ?? []).map(row => {
    const analysis = row.analysis as Record<string, unknown> | null;
    return {
      url: row.url as string,
      title: row.title as string,
      primary_keyword: row.primary_keyword as string,
      word_count: row.word_count as number,
      health_score: row.health_score as number,
      severity: row.severity as string,
      updated_at: row.updated_at as string,
      version: (analysis?.version as number) ?? 1,
      overall_score: (analysis?.scores as Record<string, number> | undefined)?.overall ?? row.health_score,
      plain_language_verdict: (analysis?.plain_language_verdict as string) ?? '',
      report: analysis ?? null,
      source: ((analysis?._source as string) === 'upload' ? 'upload' : 'url') as 'url' | 'upload',
    };
  });

  const total = count ?? items.length;
  return apiJson({ success: true, items, total, hasMore: offset + items.length < total });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return apiJson({ success: false, error: 'Not authenticated' }, { status: 401 });

  const { projectId } = await params;
  const owns = await ensureOwner(projectId, userId);
  if (!owns) return apiJson({ success: false, error: 'Project not found' }, { status: 404 });

  const { error } = await supabaseAdmin
    .from('blog_audits')
    .delete()
    .eq('project_id', projectId);

  if (error) return apiJson({ success: false, error: error.message }, { status: 500 });
  return apiJson({ success: true });
}
