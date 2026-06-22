import { currentUser } from '@clerk/nextjs/server';
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
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: 'Not authenticated', items: [] }, { status: 401 });

  const { projectId } = await params;
  const owns = await ensureOwner(projectId, user.id);
  if (!owns) return apiJson({ success: false, error: 'Project not found', items: [] }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('blog_audits')
    .select('url, title, primary_keyword, word_count, health_score, severity, analysis, updated_at')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    return apiJson({ success: false, error: error.message, items: [] }, { status: 500 });
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

  return apiJson({ success: true, items });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: 'Not authenticated' }, { status: 401 });

  const { projectId } = await params;
  const owns = await ensureOwner(projectId, user.id);
  if (!owns) return apiJson({ success: false, error: 'Project not found' }, { status: 404 });

  const { error } = await supabaseAdmin
    .from('blog_audits')
    .delete()
    .eq('project_id', projectId);

  if (error) return apiJson({ success: false, error: error.message }, { status: 500 });
  return apiJson({ success: true });
}
