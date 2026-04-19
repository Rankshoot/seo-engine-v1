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

    const entries = calendar.map(entry => {
      const match = keywords.find(k => k.keyword === entry.keyword);
      return {
        project_id: projectId,
        keyword_id: match?.id ?? null,
        scheduled_date: entry.date,
        title: entry.title,
        article_type: entry.article_type,
        slug: entry.slug,
        focus_keyword: entry.keyword,
        secondary_keywords: entry.secondary_keywords ?? [],
        status: 'scheduled',
      };
    });

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

  const { data, error } = await supabaseAdmin
    .from('calendar_entries')
    .select('*')
    .eq('project_id', projectId)
    .order('scheduled_date', { ascending: true });

  if (error) return { success: false, error: error.message, data: [] as CalendarEntry[] };
  return { success: true, data: data as CalendarEntry[] };
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
