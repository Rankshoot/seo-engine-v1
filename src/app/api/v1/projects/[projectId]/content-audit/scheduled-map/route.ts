import { currentUser } from '@clerk/nextjs/server';
import { apiJson } from '@/server/http/json';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 10;

/**
 * Returns { map: { [auditUrl]: { entryId, scheduledDate } } } for every
 * calendar entry that traces back to a Content Audit Studio report in this
 * project. Drives the Audit page's "Schedule to Calendar" → "Scheduled for
 * <date>" state so it survives refresh / reopening from Audit History
 * instead of resetting to local component state each time.
 *
 * Two ways an audited URL ends up on the calendar, both counted here:
 *   1. Scheduled straight from the audit report (no blog generated yet) —
 *      `calendar_entries.content_health_audit.url` carries the audit URL.
 *   2. An enhanced blog was generated from the audit first, then scheduled
 *      via `scheduleExistingBlog` — that path creates a bare calendar entry
 *      with no `content_health_audit` payload, so the link back to the
 *      audited URL instead lives on `blogs.source_url` (+ `blogs.entry_id`).
 *   Missing case 2 is what made "Scheduled for <date>" revert to "Schedule"
 *   after a refresh even though the entry was genuinely still on the
 *   calendar.
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

  const [auditEntriesRes, generatedBlogsRes] = await Promise.all([
    supabaseAdmin
      .from('calendar_entries')
      .select('id, scheduled_date, content_health_audit, created_at')
      .eq('project_id', projectId)
      .not('content_health_audit', 'is', null)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('blogs')
      .select('source_url, entry_id, created_at')
      .eq('project_id', projectId)
      .not('source_url', 'is', null)
      .not('entry_id', 'is', null)
      .order('created_at', { ascending: false }),
  ]);

  if (auditEntriesRes.error) return apiJson({ map: {}, error: auditEntriesRes.error.message }, { status: 500 });
  if (generatedBlogsRes.error) return apiJson({ map: {}, error: generatedBlogsRes.error.message }, { status: 500 });

  const map: Record<string, { entryId: string; scheduledDate: string }> = {};

  // Case 1 — newest first → keep the most recent calendar entry per audited URL.
  for (const row of auditEntriesRes.data ?? []) {
    const audit = row.content_health_audit as { url?: string } | null;
    const url = audit?.url;
    if (url && !map[url]) {
      map[url] = { entryId: row.id as string, scheduledDate: String(row.scheduled_date).slice(0, 10) };
    }
  }

  // Case 2 — resolve the calendar entries linked from generated blogs and
  // fill in any audited URLs case 1 didn't already cover.
  const blogRows = (generatedBlogsRes.data ?? []).filter(row => !map[row.source_url as string]);
  if (blogRows.length > 0) {
    const entryIds = [...new Set(blogRows.map(row => row.entry_id as string))];
    const { data: linkedEntries, error: linkedErr } = await supabaseAdmin
      .from('calendar_entries')
      .select('id, scheduled_date')
      .in('id', entryIds);
    if (linkedErr) return apiJson({ map: {}, error: linkedErr.message }, { status: 500 });

    const entryById = new Map((linkedEntries ?? []).map(e => [e.id as string, e]));
    for (const row of blogRows) {
      const url = row.source_url as string;
      const entry = entryById.get(row.entry_id as string);
      if (url && entry && !map[url]) {
        map[url] = { entryId: entry.id as string, scheduledDate: String(entry.scheduled_date).slice(0, 10) };
      }
    }
  }

  return apiJson({ map });
}
