'use server';

import { after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveJobs, getJob, requeueStale } from '@/lib/jobs/service';
import { runJob } from '@/lib/jobs/runner';
import type { JobRecord } from '@/lib/jobs/types';

/**
 * Generic task feed for the notification center. One local-auth ownership check,
 * one query for ALL active background jobs of a project (any type), and a
 * best-effort self-heal of pending jobs — so a single lightweight poll drives
 * notifications for every long-running operation (content generation, audits,
 * site scans, …) instead of a bespoke watcher per feature.
 */
async function ensureOwner(
  projectId: string,
): Promise<{ ok: true; userId: string } | { ok: false }> {
  const { userId } = await auth();
  if (!userId) return { ok: false };
  const { data } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();
  if (!data) return { ok: false };
  return { ok: true, userId };
}

/** Short, human label for a job derived from its payload (no PII beyond URLs). */
function taskLabel(job: JobRecord): string {
  const p = (job.payload ?? {}) as Record<string, unknown>;
  if (typeof p.label === 'string' && p.label.trim()) return p.label.trim();
  if (typeof p.topic === 'string' && p.topic.trim()) return p.topic.trim();
  if (typeof p.keyword === 'string' && p.keyword.trim()) return p.keyword.trim();
  if (typeof p.url === 'string' && p.url) {
    try { return new URL(p.url).pathname.slice(1) || new URL(p.url).hostname; } catch { return p.url; }
  }
  if (Array.isArray(p.urls)) return `${p.urls.length} page${p.urls.length === 1 ? '' : 's'}`;
  return '';
}

export interface ActiveTask {
  jobId: string;
  type: string;
  status: string;
  label: string;
}

export async function getActiveProjectTasks(
  projectId: string,
): Promise<{ success: boolean; tasks: ActiveTask[] }> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok) return { success: false, tasks: [] };

  const jobs = await getActiveJobs(projectId); // all types, pending+running

  // Self-heal pending jobs without depending on the cron drain (runs after the
  // response so it never slows the poll; atomic claiming prevents double work).
  if (jobs.length > 0) {
    try {
      after(async () => {
        try {
          await requeueStale();
          for (const j of jobs) {
            if (j.status === 'pending') {
              try { await runJob(j.id); } catch { /* retried next poll */ }
            }
          }
        } catch { /* best-effort */ }
      });
    } catch { /* not in a request scope */ }
  }

  return {
    success: true,
    tasks: jobs.map((j) => ({ jobId: j.id, type: j.type, status: j.status, label: taskLabel(j) })),
  };
}

export interface TaskOutcome {
  success: boolean;
  status: 'pending' | 'running' | 'done' | 'failed' | 'unknown';
  type: string;
  label: string;
  result: Record<string, unknown>;
  error?: string;
}

export async function getProjectTaskOutcome(
  projectId: string,
  jobId: string,
): Promise<TaskOutcome> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok) return { success: false, status: 'unknown', type: '', label: '', result: {} };
  const job = await getJob(jobId);
  if (!job || job.project_id !== projectId) {
    return { success: false, status: 'unknown', type: '', label: '', result: {} };
  }
  return {
    success: true,
    status: job.status as TaskOutcome['status'],
    type: job.type,
    label: taskLabel(job),
    result: (job.result ?? {}) as Record<string, unknown>,
    error: job.error || undefined,
  };
}
