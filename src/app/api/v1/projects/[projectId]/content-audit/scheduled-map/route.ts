import { currentUser } from '@clerk/nextjs/server';
import { apiJson } from '@/server/http/json';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 10;

/**
 * Returns { map: { [auditUrl]: { entryId, scheduledDate } } } for every
 * calendar entry that was scheduled from a Content Audit Studio report in
 * this project. Drives the Audit page's "Schedule to Calendar" → "Scheduled
 * for <date>" state so it survives refresh / reopening from Audit History
 * instead of resetting to local component state each time.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await currentUser();
  if (!user) return apiJson({ map: {} }, { status: 401 });

  const { projectId } = await params;
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (!project) return apiJson({ map: {} }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('calendar_entries')
    .select('id, scheduled_date, content_health_audit, created_at')
    .eq('project_id', projectId)
    .not('content_health_audit', 'is', null)
    .order('created_at', { ascending: false });

  if (error) return apiJson({ map: {}, error: error.message }, { status: 500 });

  // Newest first → keep the most recent calendar entry per audited URL.
  const map: Record<string, { entryId: string; scheduledDate: string }> = {};
  for (const row of data ?? []) {
    const audit = row.content_health_audit as { url?: string } | null;
    const url = audit?.url;
    if (url && !map[url]) {
      map[url] = { entryId: row.id as string, scheduledDate: String(row.scheduled_date).slice(0, 10) };
    }
  }

  return apiJson({ map });
}
