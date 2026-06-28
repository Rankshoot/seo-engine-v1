'use server';

import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { getActiveJobs } from '@/lib/jobs/service';
import type { ContentAuditJobPayload } from '@/lib/jobs/types';

interface OwnedProject {
  id: string;
  domain: string;
  target_region?: string;
  target_language?: string;
}

async function ensureOwner(
  projectId: string
): Promise<{ ok: true; userId: string; project: OwnedProject } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: 'Not authenticated' };
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, domain, target_region, target_language')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (error || !data) return { ok: false, error: 'Project not found' };
  return { ok: true, userId: user.id, project: data as OwnedProject };
}

/** Canonical URL form for the idempotency key (drop hash + trailing slash). */
function normalizeAuditUrl(raw: string): string {
  let s = raw.trim().replace(/#.*$/, '');
  s = s.replace(/\/+$/, '');
  return s;
}

export interface StartAuditResult {
  success: boolean;
  error?: string;
  jobId?: string;
  url?: string;
  /** True when an in-flight audit for this URL already existed (no new paid work). */
  deduped?: boolean;
}

/**
 * Start a resilient single-URL audit. Returns immediately with a jobId; the
 * worker runs the audit to completion regardless of whether the client stays
 * on the page. Idempotent per (project, url) so double-clicks / quick re-runs
 * reuse the in-flight job instead of paying twice.
 */
export async function startUrlAudit(
  projectId: string,
  rawUrl: string,
  opts?: { focusKeyword?: string }
): Promise<StartAuditResult> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok) return { success: false, error: owner.error };

  const url = normalizeAuditUrl(rawUrl);
  if (!/^https?:\/\/.+/i.test(url)) {
    return { success: false, error: 'Please provide a valid URL starting with http:// or https://' };
  }

  const payload: ContentAuditJobPayload = {
    url,
    projectId,
    projectDomain: owner.project.domain,
    region: owner.project.target_region ?? 'us',
    language: owner.project.target_language ?? 'en',
    focusKeyword: opts?.focusKeyword,
    origin: 'url',
  };

  try {
    const { job, created } = await enqueueJob({
      type: 'content_audit',
      projectId,
      userId: owner.userId,
      payload: payload as unknown as Record<string, unknown>,
      idempotencyKey: `audit:${projectId}:${url}`,
    });
    return { success: true, jobId: job.id, url, deduped: !created };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Could not start audit' };
  }
}

export interface ActiveAuditJob {
  jobId: string;
  url: string;
  status: string;
}

/**
 * Active (pending/running) audit jobs for a project — drives the in-progress
 * skeletons and lets the page resume polling after a refresh/tab-switch.
 */
export async function getActiveAuditJobs(projectId: string): Promise<{
  success: boolean;
  jobs: ActiveAuditJob[];
}> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok) return { success: false, jobs: [] };
  const jobs = await getActiveJobs(projectId, ['content_audit']);
  return {
    success: true,
    jobs: jobs.map(j => ({
      jobId: j.id,
      url: typeof j.payload?.url === 'string' ? (j.payload.url as string) : '',
      status: j.status,
    })),
  };
}
