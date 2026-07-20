'use server';

/**
 * User-facing actions for the per-project AI memory (Settings → Project memory).
 * The user owns this memory outright: they can read all of it, edit any entry,
 * delete any entry, or clear everything. Deletes are REAL — removed entries are
 * never used again; memory only returns as fresh entries accumulate from new
 * work (clearing stamps `projects.memory_cleared_at` so the restart is explicit).
 *
 * The global heuristics layer is intentionally NOT reachable from here — it is
 * backend-only and surfaced solely in the admin panel.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import type { ProjectMemoryEntry } from '@/lib/ai-memory';

interface ActionResult {
  success: boolean;
  error?: string;
}

/** Verifies the caller owns the project; returns the user id or null. */
async function verifyProjectOwnership(projectId: string): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  return error || !data ? null : user.id;
}

export interface ProjectMemoryResult extends ActionResult {
  entries: ProjectMemoryEntry[];
  clearedAt: string | null;
}

/** Lists the project's full memory (newest first) + the last-cleared marker. */
export async function getProjectMemory(projectId: string): Promise<ProjectMemoryResult> {
  const userId = await verifyProjectOwnership(projectId);
  if (!userId) return { success: false, error: 'Project not found', entries: [], clearedAt: null };

  const [{ data: rows, error }, { data: project }] = await Promise.all([
    supabaseAdmin
      .from('project_content_memory')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('projects').select('memory_cleared_at').eq('id', projectId).single(),
  ]);

  if (error) return { success: false, error: error.message, entries: [], clearedAt: null };
  return {
    success: true,
    entries: (rows ?? []) as ProjectMemoryEntry[],
    clearedAt: (project?.memory_cleared_at as string | null) ?? null,
  };
}

/** Edits one memory entry's text. The edited version is what the AI uses from now on. */
export async function updateProjectMemoryEntry(
  projectId: string,
  entryId: string,
  content: string
): Promise<ActionResult> {
  const userId = await verifyProjectOwnership(projectId);
  if (!userId) return { success: false, error: 'Project not found' };

  const text = content.trim();
  if (!text) return { success: false, error: 'Memory text cannot be empty' };
  if (text.length > 500) return { success: false, error: 'Keep memory entries under 500 characters' };

  const { error } = await supabaseAdmin
    .from('project_content_memory')
    .update({ content: text, source: 'user', updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('project_id', projectId);

  return error ? { success: false, error: error.message } : { success: true };
}

/** Permanently deletes one memory entry. It will never be used again. */
export async function deleteProjectMemoryEntry(
  projectId: string,
  entryId: string
): Promise<ActionResult> {
  const userId = await verifyProjectOwnership(projectId);
  if (!userId) return { success: false, error: 'Project not found' };

  const { error } = await supabaseAdmin
    .from('project_content_memory')
    .delete()
    .eq('id', entryId)
    .eq('project_id', projectId);

  return error ? { success: false, error: error.message } : { success: true };
}

/**
 * Permanently deletes ALL memory for this project and stamps
 * `memory_cleared_at`. The AI starts from a blank slate — nothing cleared is
 * ever reused; memory rebuilds only from new work in this project.
 */
export async function clearProjectMemory(projectId: string): Promise<ActionResult> {
  const userId = await verifyProjectOwnership(projectId);
  if (!userId) return { success: false, error: 'Project not found' };

  const { error } = await supabaseAdmin
    .from('project_content_memory')
    .delete()
    .eq('project_id', projectId);
  if (error) return { success: false, error: error.message };

  await supabaseAdmin
    .from('projects')
    .update({ memory_cleared_at: new Date().toISOString() })
    .eq('id', projectId);

  return { success: true };
}
