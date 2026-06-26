import { currentUser } from '@clerk/nextjs/server';
import { apiJson } from '@/server/http/json';
import { auditContentUrl, type PersistedContentAudit } from '@/lib/content-audit-studio';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function ensureOwner(projectId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, domain, target_region, target_language')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;
  return data;
}

async function upsertAudit(projectId: string, record: PersistedContentAudit, source: 'url' | 'upload' = 'url') {
  const { error } = await supabaseAdmin
    .from('blog_audits')
    .upsert(
      {
        project_id: projectId,
        url: record.url,
        title: record.title,
        primary_keyword: record.primary_keyword,
        word_count: record.word_count,
        health_score: record.health_score,
        severity: record.severity,
        analysis: { ...(record.analysis as unknown as Record<string, unknown>), _source: source },
        scraped_markdown: record.scraped_markdown ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,url' }
    );
  return error;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: 'Not authenticated' }, { status: 401 });

  const { projectId } = await params;
  const project = await ensureOwner(projectId, user.id);
  if (!project) return apiJson({ success: false, error: 'Project not found' }, { status: 404 });

  let url: string;
  let uploadedContent: string | undefined;
  let uploadedTitle: string | undefined;
  let focusKeyword: string | undefined;
  try {
    const body = await req.json() as { url?: unknown; uploadedContent?: unknown; uploadedTitle?: unknown; focusKeyword?: unknown };
    url = typeof body.url === 'string' ? body.url.trim() : '';
    uploadedContent = typeof body.uploadedContent === 'string' ? body.uploadedContent.trim() : undefined;
    uploadedTitle = typeof body.uploadedTitle === 'string' ? body.uploadedTitle.trim() : undefined;
    focusKeyword = typeof body.focusKeyword === 'string' ? body.focusKeyword.trim() : undefined;
  } catch {
    return apiJson({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (!url) {
    return apiJson({ success: false, error: 'Please provide a URL or upload content' }, { status: 400 });
  }
  // For uploaded content, URL can be a synthetic identifier; for URL-based audits, validate format
  if (!uploadedContent && !/^https?:\/\//i.test(url)) {
    return apiJson({ success: false, error: 'Please provide a valid URL starting with http:// or https://' }, { status: 400 });
  }

  const { record, trace } = await auditContentUrl({
    url,
    projectId,
    projectDomain: project.domain,
    region: (project.target_region as string) ?? 'us',
    language: (project.target_language as string) ?? 'en',
    uploadedContent,
    uploadedTitle,
    focusKeyword: focusKeyword || undefined,
  });

  const dbError = await upsertAudit(projectId, record, uploadedContent ? 'upload' : 'url');
  if (dbError) {
    console.error('[content-audit] Failed to save audit:', dbError);
  }

  return apiJson({
    success: true,
    report: record.analysis,
    record: {
      url: record.url,
      title: record.title,
      primary_keyword: record.primary_keyword,
      word_count: record.word_count,
      health_score: record.health_score,
      severity: record.severity,
      error: record.error,
    },
    trace,
  });
}
