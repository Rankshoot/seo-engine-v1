'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { Project } from '@/lib/types';

export async function createProject(data: {
  name: string;
  domain: string;
  company: string;
  niche: string;
  target_audience: string;
  target_region: string;
  target_language: string;
  description: string;
  competitors: string[];
  ahrefs_rank_tracker_project_id?: number | null;
}) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { competitors, ahrefs_rank_tracker_project_id, ...projectData } = data;

  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .insert({
      ...projectData,
      user_id: user.id,
      ahrefs_rank_tracker_project_id: ahrefs_rank_tracker_project_id ?? null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  const validCompetitors = competitors.filter(c => c.trim());
  if (validCompetitors.length > 0) {
    await supabaseAdmin.from('project_competitors').insert(
      validCompetitors.map(domain => ({ project_id: project.id, domain: domain.trim() }))
    );
  }

  return { success: true, data: project as Project };
}

export async function getProjects() {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: [] as Project[] };

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message, data: [] as Project[] };
  return { success: true, data: data as Project[] };
}

export async function getProject(id: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null };

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*, project_competitors(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) return { success: false, error: error.message, data: null };
  return { success: true, data: data as Project };
}

export async function deleteProject(id: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { error } = await supabaseAdmin
    .from('projects')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Update an existing project. When `competitors` is passed we replace the
 * project's competitor list wholesale (simpler than diffing — the list is
 * short and recreated cheaply). Omitting `competitors` leaves it untouched.
 */
export async function updateProject(
  id: string,
  data: {
    name: string;
    domain: string;
    company: string;
    niche: string;
    target_audience: string;
    target_region: string;
    description: string;
    competitors?: string[];
    ahrefs_rank_tracker_project_id?: number | null;
  }
) {
  const user = await currentUser();
  if (!user) return { success: false as const, error: 'Not authenticated' };

  // Ownership check — deny updates on projects the user doesn't own.
  const { data: existing, error: checkErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (checkErr || !existing) {
    return { success: false as const, error: 'Project not found' };
  }

  const { competitors, ahrefs_rank_tracker_project_id, ...patch } = data;

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('projects')
    .update({
      ...patch,
      ahrefs_rank_tracker_project_id: ahrefs_rank_tracker_project_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (updErr) return { success: false as const, error: updErr.message };

  if (Array.isArray(competitors)) {
    await supabaseAdmin.from('project_competitors').delete().eq('project_id', id);
    const cleaned = competitors.map(c => c.trim()).filter(Boolean);
    if (cleaned.length) {
      const { error: compErr } = await supabaseAdmin
        .from('project_competitors')
        .insert(cleaned.map(domain => ({ project_id: id, domain })));
      if (compErr) return { success: false as const, error: compErr.message };
    }
  }

  return { success: true as const, data: updated as Project };
}

export async function getProjectStats(projectId: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: null };

  const [kwResult, calResult, blogResult] = await Promise.all([
    supabaseAdmin.from('keywords').select('status').eq('project_id', projectId),
    supabaseAdmin.from('calendar_entries').select('status').eq('project_id', projectId),
    supabaseAdmin.from('blogs').select('status').eq('project_id', projectId),
  ]);

  const keywords = kwResult.data ?? [];
  const calendar = calResult.data ?? [];
  const blogs = blogResult.data ?? [];

  return {
    success: true,
    data: {
      totalKeywords: keywords.length,
      approvedKeywords: keywords.filter(k => k.status === 'approved').length,
      calendarEntries: calendar.length,
      blogsGenerated: blogs.filter(b => ['generated', 'approved', 'published'].includes(b.status)).length,
    },
  };
}
