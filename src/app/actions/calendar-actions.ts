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

  const { data, error } = await supabaseAdmin
    .from('calendar_entries')
    .select('*, keywords(source_type, gap_competitor, volume, kd)')
    .eq('project_id', projectId)
    .order('scheduled_date', { ascending: true });

  if (error) return { success: false, error: error.message, data: [] as CalendarEntry[] };
  return { success: true, data: data as CalendarEntry[] };
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
  date: string
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

  // RESCHEDULE: keyword already has an entry → just move it to the new date
  if (existingKw) {
    const { data, error } = await supabaseAdmin
      .from('calendar_entries')
      .update({ scheduled_date: date })
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
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
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
