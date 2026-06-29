import { currentUser } from '@clerk/nextjs/server';
import { apiJson } from '@/server/http/json';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 10;

async function ensureOwner(projectId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();
  return !error && !!data;
}

/**
 * Returns { map: { [auditUrl]: blogId } } for every enhanced ("Repair") blog
 * generated from an audited URL in this project. Drives the Audit History
 * "View Blog" vs "Generate Enhanced Blog" state via the auditGenerations slice.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await currentUser();
  if (!user) return apiJson({ map: {} }, { status: 401 });

  const { projectId } = await params;
  if (!(await ensureOwner(projectId, user.id))) {
    return apiJson({ map: {} }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('blogs')
    .select('id, source_url, created_at')
    .eq('project_id', projectId)
    .eq('article_type', 'Repair')
    .not('source_url', 'is', null)
    .order('created_at', { ascending: false });

  if (error) return apiJson({ map: {}, error: error.message }, { status: 500 });

  // Newest first → keep the most recent blog per source URL.
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const url = (row.source_url as string | null) ?? '';
    if (url && !map[url]) map[url] = row.id as string;
  }

  return apiJson({ map });
}
