'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { generateContentCalendar } from '@/lib/gemini';
import { CalendarEntry } from '@/lib/types';

export async function generateCalendar(projectId: string, startDate: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) return { success: false, error: 'Project not found' };

  const { data: keywords, error: kwErr } = await supabaseAdmin
    .from('keywords')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'approved')
    .order('ai_score', { ascending: false });

  if (kwErr) return { success: false, error: kwErr.message };
  if (!keywords?.length || keywords.length < 5) {
    return {
      success: false,
      error: `You need at least 5 approved keywords to generate a calendar. Currently approved: ${keywords?.length ?? 0}.`,
    };
  }

  try {
    const calendar = await generateContentCalendar(
      keywords.map(k => ({
        keyword: k.keyword,
        volume: k.volume,
        kd: k.kd,
        secondary_keywords: k.secondary_keywords ?? [],
      })),
      project,
      new Date(startDate),
      30
    );

    // Clear existing calendar for this project
    await supabaseAdmin.from('calendar_entries').delete().eq('project_id', projectId);

    // Build a lower-cased lookup so LLM keyword text matches regardless of case/whitespace
    const kwByNorm = new Map(
      keywords.map(k => [k.keyword.toLowerCase().trim(), k])
    );

    const entries = calendar
      .map(entry => {
        const norm = entry.keyword.toLowerCase().trim();
        const match = kwByNorm.get(norm);
        // Skip rows we can't tie to a real keyword — they would be orphans.
        if (!match) return null;
        return {
          project_id: projectId,
          keyword_id: match.id,
          scheduled_date: entry.date,
          title: entry.title,
          article_type: entry.article_type,
          slug: entry.slug,
          focus_keyword: match.keyword, // canonical DB string, never the LLM echo
          secondary_keywords: entry.secondary_keywords ?? [],
          status: 'scheduled',
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    const { data, error } = await supabaseAdmin
      .from('calendar_entries')
      .insert(entries)
      .select();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Calendar generation failed';
    return { success: false, error: message };
  }
}

export async function getCalendarEntries(projectId: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: [] as CalendarEntry[] };

  // Heal-on-read: any rows where keyword_id is NULL (older rows or LLM-rephrased
  // focus_keyword) get linked back to the right keyword. We try three match
  // strategies, in order of strictness, so even slightly rephrased keywords
  // are recovered. This runs on every fetch and is idempotent.
  const { data: orphans } = await supabaseAdmin
    .from('calendar_entries')
    .select('id, focus_keyword')
    .eq('project_id', projectId)
    .is('keyword_id', null);

  if (orphans && orphans.length) {
    const { data: kws } = await supabaseAdmin
      .from('keywords')
      .select('id, keyword')
      .eq('project_id', projectId);

    if (kws && kws.length) {
      const norm = (s: string) => (s ?? '').toLowerCase().trim();
      const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

      const byNorm = new Map(kws.map(k => [norm(k.keyword), k.id]));
      const bySlug = new Map(kws.map(k => [slug(k.keyword), k.id]));

      const findKeywordId = (focusRaw: string | null): string | null => {
        const focus = focusRaw ?? '';
        if (!focus) return null;
        // 1. Exact normalised match
        const exact = byNorm.get(norm(focus));
        if (exact) return exact;
        // 2. Slug match — handles capitalisation, punctuation, whitespace differences
        const slugged = bySlug.get(slug(focus));
        if (slugged) return slugged;
        // 3. Substring match — handles "in" / extra words from LLM rephrasing
        const focusSlug = slug(focus);
        for (const k of kws) {
          const kSlug = slug(k.keyword);
          if (focusSlug.includes(kSlug) || kSlug.includes(focusSlug)) return k.id;
        }
        return null;
      };

      let healed = 0;
      await Promise.all(
        orphans.map(async o => {
          const matchedId = findKeywordId(o.focus_keyword);
          if (matchedId) {
            await supabaseAdmin
              .from('calendar_entries')
              .update({ keyword_id: matchedId })
              .eq('id', o.id);
            healed++;
          }
        })
      );

      if (healed > 0) {
        console.log(
          `[calendar] healed ${healed}/${orphans.length} orphan calendar_entries for project ${projectId}`
        );
      }
    }
  }

  // Use `keywords(*)` so we get every column PostgREST knows about — avoids
  // referencing `source_type` explicitly (which crashes on older DBs that never
  // ran discovery-pipeline migrations) while still returning it once added.
  const { data, error } = await supabaseAdmin
    .from('calendar_entries')
    .select('*, keywords(*)')
    .eq('project_id', projectId)
    .order('scheduled_date', { ascending: true });

  if (error) return { success: false, error: error.message, data: [] as CalendarEntry[] };

  const rows = data as CalendarEntry[];
  const entryIds = rows.map(r => r.id).filter(Boolean);
  const titlesByEntry = new Map<string, string>();
  if (entryIds.length) {
    const { data: blogRows } = await supabaseAdmin
      .from('blogs')
      .select('entry_id, title')
      .eq('project_id', projectId)
      .in('entry_id', entryIds);
    for (const b of blogRows ?? []) {
      const eid = b.entry_id as string | undefined;
      const t = (b.title as string | undefined)?.trim();
      if (eid && t) titlesByEntry.set(eid, t);
    }
  }

  const enriched: CalendarEntry[] = rows.map(r => ({
    ...r,
    blog_title: titlesByEntry.get(r.id) ?? null,
  }));

  return { success: true, data: enriched };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function addKeywordToCalendarOnDate(
  keywordId: string,
  projectId: string,
  date: string,
  options?: { contentHealthAudit?: Record<string, unknown> | null }
) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) return { success: false, error: 'Project not found' };

  const { data: kw, error: kwErr } = await supabaseAdmin
    .from('keywords')
    .select('id, keyword, secondary_keywords')
    .eq('id', keywordId)
    .eq('project_id', projectId)
    .single();

  if (kwErr || !kw) return { success: false, error: 'Keyword not found' };

  // Look up this keyword's existing calendar entry (if any)
  const { data: existingKw } = await supabaseAdmin
    .from('calendar_entries')
    .select('id, scheduled_date')
    .eq('project_id', projectId)
    .eq('keyword_id', keywordId)
    .maybeSingle();

  // If already on the exact same date — no-op
  if (existingKw && existingKw.scheduled_date === date) {
    return { success: true, data: existingKw };
  }

  // Check if the target date is occupied by a DIFFERENT keyword
  const { data: dateTaken } = await supabaseAdmin
    .from('calendar_entries')
    .select('id, keyword_id')
    .eq('project_id', projectId)
    .eq('scheduled_date', date)
    .neq('keyword_id', keywordId)   // ignore own entry
    .maybeSingle();

  if (dateTaken) {
    return { success: false, error: 'Another keyword is already scheduled on this date' };
  }

  const auditPatch =
    options?.contentHealthAudit !== undefined && options?.contentHealthAudit !== null
      ? { content_health_audit: options.contentHealthAudit }
      : {};

  // RESCHEDULE: keyword already has an entry → just move it to the new date
  if (existingKw) {
    const { data, error } = await supabaseAdmin
      .from('calendar_entries')
      .update({ scheduled_date: date, ...auditPatch })
      .eq('id', existingKw.id)
      .select()
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data, rescheduled: true };
  }

  // CREATE: no existing entry
  const { data, error } = await supabaseAdmin
    .from('calendar_entries')
    .insert({
      project_id: projectId,
      keyword_id: keywordId,
      scheduled_date: date,
      title: '',
      article_type: 'Blog Post',
      slug: slugify(kw.keyword),
      focus_keyword: kw.keyword,
      secondary_keywords: kw.secondary_keywords ?? [],
      status: 'scheduled',
      ...auditPatch,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

async function nextOpenCalendarDate(projectId: string): Promise<string | null> {
  const { data: rows } = await supabaseAdmin
    .from('calendar_entries')
    .select('scheduled_date')
    .eq('project_id', projectId);
  const taken = new Set((rows ?? []).map(r => String(r.scheduled_date).slice(0, 10)));
  const anchor = new Date();
  for (let add = 1; add <= 400; add++) {
    const d = new Date(anchor.getTime());
    d.setUTCDate(anchor.getUTCDate() + add);
    const key = d.toISOString().slice(0, 10);
    if (!taken.has(key)) return key;
  }
  return null;
}

function normKw(s: string): string {
  return (s ?? '').toLowerCase().trim();
}

function slugKey(s: string): string {
  return normKw(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Schedule the audited blog's focus keyword on the next free calendar day.
 * If the phrase matches an existing `keywords` row, links `keyword_id`; otherwise
 * creates a calendar row with `keyword_id` null (healed on read when you add the keyword later).
 */
export async function addContentHealthKeywordToCalendar(
  projectId: string,
  opts: { focusKeyword: string; auditUrl?: string; contentHealthAudit?: Record<string, unknown> | null }
) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' as const };

  const focusRaw = opts.focusKeyword.trim();
  if (!focusRaw) return { success: false, error: 'No focus keyword for this audit row' as const };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) return { success: false, error: 'Project not found' as const };

  const { data: kws } = await supabaseAdmin
    .from('keywords')
    .select('id, keyword, secondary_keywords')
    .eq('project_id', projectId);

  let keywordId: string | null = null;
  let canonical = focusRaw;
  let secondary: string[] = [];

  if (kws?.length) {
    const byNorm = new Map(kws.map(k => [normKw(k.keyword), k]));
    const bySlug = new Map(kws.map(k => [slugKey(k.keyword), k]));
    const exact = byNorm.get(normKw(focusRaw));
    if (exact) {
      keywordId = exact.id;
      canonical = exact.keyword;
      secondary = (exact.secondary_keywords as string[]) ?? [];
    } else {
      const slugHit = bySlug.get(slugKey(focusRaw));
      if (slugHit) {
        keywordId = slugHit.id;
        canonical = slugHit.keyword;
        secondary = (slugHit.secondary_keywords as string[]) ?? [];
      } else {
        const fs = slugKey(focusRaw);
        for (const k of kws) {
          const ks = slugKey(k.keyword);
          if (fs && (fs.includes(ks) || ks.includes(fs))) {
            keywordId = k.id;
            canonical = k.keyword;
            secondary = (k.secondary_keywords as string[]) ?? [];
            break;
          }
        }
      }
    }
  }

  const { data: existingSame } = await supabaseAdmin
    .from('calendar_entries')
    .select('id, scheduled_date, focus_keyword, keyword_id')
    .eq('project_id', projectId);

  const dup = (existingSame ?? []).find(e => normKw(e.focus_keyword as string) === normKw(canonical));
  if (dup) {
    return {
      success: false,
      error: `Already on your calendar for ${String(dup.scheduled_date).slice(0, 10)} (${dup.focus_keyword}).`,
    };
  }

  if (keywordId) {
    const takenById = (existingSame ?? []).find(e => e.keyword_id === keywordId);
    if (takenById) {
      return {
        success: false,
        error: `That keyword is already scheduled on ${String(takenById.scheduled_date).slice(0, 10)}.`,
      };
    }
  }

  const scheduledDate = await nextOpenCalendarDate(projectId);
  if (!scheduledDate) return { success: false, error: 'No open calendar date found' as const };

  const auditPayload =
    opts.contentHealthAudit !== undefined && opts.contentHealthAudit !== null
      ? { content_health_audit: opts.contentHealthAudit }
      : {};

  if (keywordId) {
    return addKeywordToCalendarOnDate(keywordId, projectId, scheduledDate, {
      contentHealthAudit: opts.contentHealthAudit ?? null,
    });
  }

  const titleBase = canonical.slice(0, 120) || 'Content improvement';
  const title = opts.auditUrl ? `Refresh: ${titleBase}` : titleBase;

  const { data, error } = await supabaseAdmin
    .from('calendar_entries')
    .insert({
      project_id: projectId,
      keyword_id: null,
      scheduled_date: scheduledDate,
      title,
      article_type: 'Blog Post',
      slug: slugify(canonical),
      focus_keyword: canonical,
      secondary_keywords: secondary,
      status: 'scheduled',
      ...auditPayload,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data, scheduled_date: scheduledDate };
}

/**
 * Approve an AI-suggested keyword and schedule it in the content calendar.
 * Used by the chatbot's "Add to calendar" button on keyword suggestion cards.
 */
export async function approveAISuggestionToCalendar(params: {
  projectId: string;
  keyword: string;
  keywordId?: string;
  source: string;
  page: string;
  volume?: number;
  kd?: number;
  cpc?: number;
  intent?: string;
}): Promise<{ success: boolean; error?: string; scheduledDate?: string; alreadyExists?: boolean }> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { projectId, keyword, keywordId, page, volume = 0, kd = 0, cpc = 0, intent = '' } = params;

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!project) return { success: false, error: 'Project not found' };

  let resolvedKeywordId = keywordId;
  if (!resolvedKeywordId) {
    const { data: existing } = await supabaseAdmin
      .from('keywords')
      .select('id')
      .eq('project_id', projectId)
      .ilike('keyword', keyword.trim())
      .maybeSingle();

    if (existing) {
      resolvedKeywordId = existing.id;
    } else {
      const { data: newKw, error: kwErr } = await supabaseAdmin
        .from('keywords')
        .insert({
          project_id: projectId,
          keyword: keyword.trim(),
          volume,
          kd,
          cpc,
          intent: intent || null,
          status: 'approved',
          ai_score: 0,
          trend: '',
          monthly_searches: [],
          secondary_keywords: [],
        })
        .select('id')
        .single();

      if (kwErr || !newKw) return { success: false, error: kwErr?.message ?? 'Failed to create keyword' };
      resolvedKeywordId = newKw.id;
    }
  }

  const { data: existingEntry } = await supabaseAdmin
    .from('calendar_entries')
    .select('id, scheduled_date')
    .eq('project_id', projectId)
    .eq('keyword_id', resolvedKeywordId)
    .maybeSingle();

  if (existingEntry) {
    return { success: false, error: `Already in calendar (${existingEntry.scheduled_date})`, alreadyExists: true };
  }

  const scheduledDate = await nextOpenCalendarDate(projectId);
  if (!scheduledDate) return { success: false, error: 'No open calendar date found' };

  const aiSource = `AI · ${page}`;
  const slug = keyword.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

  const { error } = await supabaseAdmin
    .from('calendar_entries')
    .insert({
      project_id: projectId,
      keyword_id: resolvedKeywordId,
      scheduled_date: scheduledDate,
      title: '',
      article_type: 'Blog Post',
      slug,
      focus_keyword: keyword.trim(),
      secondary_keywords: [],
      status: 'scheduled',
      ai_source: aiSource,
    });

  if (error) return { success: false, error: error.message };
  return { success: true, scheduledDate };
}

export async function updateCalendarEntry(
  entryId: string,
  updates: { title?: string; article_type?: string; slug?: string }
) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { error } = await supabaseAdmin
    .from('calendar_entries')
    .update(updates)
    .eq('id', entryId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Update the status of a calendar entry (and its linked blog if any).
 * Allowed transitions: scheduled → generating, scheduled → approved, etc.
 * The blog status is mirrored when present.
 */
export async function updateCalendarEntryStatus(
  entryId: string,
  status: 'scheduled' | 'generating' | 'generated' | 'downloaded' | 'approved' | 'published'
) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: entry } = await supabaseAdmin
    .from('calendar_entries')
    .select('id, project_id')
    .eq('id', entryId)
    .maybeSingle();
  if (!entry) return { success: false, error: 'Calendar entry not found' };

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', entry.project_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!project) return { success: false, error: 'Not authorized' };

  const { error } = await supabaseAdmin
    .from('calendar_entries')
    .update({ status })
    .eq('id', entryId);
  if (error) return { success: false, error: error.message };

  // Mirror to linked blog if applicable.
  if (status === 'approved' || status === 'published' || status === 'generated') {
    await supabaseAdmin
      .from('blogs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('entry_id', entryId);
  }
  return { success: true };
}

/**
 * Vacate a calendar slot — used by the AI assistant when the user asks
 * "free up April 3rd" or "remove this from the calendar".
 *
 * mode = 'delete'    → drop the entry entirely (default; safest)
 * mode = 'unschedule' → keep the entry but clear scheduled_date (not currently
 *                       supported by schema — falls back to delete)
 *
 * Identification: pass either `entryId` OR (`projectId` + `date`) OR
 * (`projectId` + `keyword`). First match wins.
 */
export async function vacateCalendarSlot(params: {
  entryId?: string;
  projectId?: string;
  date?: string;
  keyword?: string;
}): Promise<{ success: boolean; error?: string; removed: number }> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', removed: 0 };

  let query = supabaseAdmin.from('calendar_entries').select('id, project_id, focus_keyword, scheduled_date');

  if (params.entryId) {
    query = query.eq('id', params.entryId);
  } else if (params.projectId) {
    query = query.eq('project_id', params.projectId);
    if (params.date) query = query.eq('scheduled_date', params.date);
    if (params.keyword) query = query.ilike('focus_keyword', params.keyword.trim());
  } else {
    return { success: false, error: 'Must provide entryId or projectId+date/keyword', removed: 0 };
  }

  const { data: rows, error: selErr } = await query;
  if (selErr) return { success: false, error: selErr.message, removed: 0 };
  if (!rows?.length) return { success: false, error: 'No matching calendar entry found', removed: 0 };

  // Verify project ownership for all returned rows
  const projectIds = [...new Set(rows.map(r => r.project_id))];
  const { data: ownedProjects } = await supabaseAdmin
    .from('projects')
    .select('id')
    .in('id', projectIds)
    .eq('user_id', user.id);
  const ownedSet = new Set((ownedProjects ?? []).map(p => p.id));
  const removable = rows.filter(r => ownedSet.has(r.project_id));
  if (!removable.length) return { success: false, error: 'Not authorized', removed: 0 };

  const { error: delErr } = await supabaseAdmin
    .from('calendar_entries')
    .delete()
    .in(
      'id',
      removable.map(r => r.id)
    );
  if (delErr) return { success: false, error: delErr.message, removed: 0 };
  return { success: true, removed: removable.length };
}

/**
 * Bulk-schedule every approved keyword that is not yet on the calendar.
 * Used when the user says "schedule the rest" / "fill the calendar with my
 * approved keywords".
 *
 * - Skips dates already taken (one-keyword-per-day rule).
 * - Default cadence is 1 entry per `cadenceDays` days starting `startDate`
 *   (or tomorrow when omitted).
 */
export async function scheduleRemainingApprovedKeywords(params: {
  projectId: string;
  startDate?: string; // YYYY-MM-DD; defaults to tomorrow
  cadenceDays?: number; // gap between entries; default 3
  limit?: number; // safety cap; default 30
}): Promise<{ success: boolean; error?: string; scheduled: number; entries: Array<{ keyword: string; date: string }> }> {
  const user = await currentUser();
  if (!user)
    return { success: false, error: 'Not authenticated', scheduled: 0, entries: [] };

  const { projectId, cadenceDays = 3, limit = 30 } = params;

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!project) return { success: false, error: 'Project not found', scheduled: 0, entries: [] };

  const [{ data: approved }, { data: scheduled }] = await Promise.all([
    supabaseAdmin
      .from('keywords')
      .select('id, keyword, secondary_keywords')
      .eq('project_id', projectId)
      .eq('status', 'approved')
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('calendar_entries')
      .select('keyword_id, scheduled_date')
      .eq('project_id', projectId),
  ]);

  const scheduledIds = new Set((scheduled ?? []).map(s => s.keyword_id).filter(Boolean));
  const takenDates = new Set((scheduled ?? []).map(s => s.scheduled_date));

  const candidates = (approved ?? []).filter(k => !scheduledIds.has(k.id)).slice(0, limit);
  if (!candidates.length) {
    return { success: true, scheduled: 0, entries: [] };
  }

  const startBase = params.startDate ? new Date(params.startDate + 'T00:00:00') : (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  })();

  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

  const inserts: Array<{
    project_id: string;
    keyword_id: string;
    scheduled_date: string;
    title: string;
    article_type: string;
    slug: string;
    focus_keyword: string;
    secondary_keywords: string[];
    status: string;
    ai_source: string;
  }> = [];
  const used = new Set(takenDates);
  let cursor = new Date(startBase);

  for (const k of candidates) {
    while (used.has(cursor.toISOString().split('T')[0])) {
      cursor.setDate(cursor.getDate() + 1);
    }
    const iso = cursor.toISOString().split('T')[0];
    inserts.push({
      project_id: projectId,
      keyword_id: k.id,
      scheduled_date: iso,
      title: '',
      article_type: 'Blog Post',
      slug: slugify(k.keyword),
      focus_keyword: k.keyword,
      secondary_keywords: k.secondary_keywords ?? [],
      status: 'scheduled',
      ai_source: 'AI · calendar',
    });
    used.add(iso);
    cursor.setDate(cursor.getDate() + cadenceDays);
  }

  const { error } = await supabaseAdmin.from('calendar_entries').insert(inserts);
  if (error) return { success: false, error: error.message, scheduled: 0, entries: [] };

  return {
    success: true,
    scheduled: inserts.length,
    entries: inserts.map(i => ({ keyword: i.focus_keyword, date: i.scheduled_date })),
  };
}
