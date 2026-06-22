import { currentUser } from '@clerk/nextjs/server';
import { apiJson } from '@/server/http/json';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await currentUser();
  if (!user) return apiJson({ blogId: null }, { status: 401 });

  const { projectId } = await params;

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (!project) return apiJson({ blogId: null }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  if (!url) return apiJson({ blogId: null });

  const { data } = await supabaseAdmin
    .from('blogs')
    .select('id')
    .eq('project_id', projectId)
    .eq('source_url', url)
    .eq('article_type', 'Repair')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return apiJson({ blogId: data?.id ?? null });
}
