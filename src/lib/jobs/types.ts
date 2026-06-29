/**
 * Background-job types. The framework is generic; `JobType` + the payload
 * interfaces below grow as we move more long-running ops onto it (keyword
 * discovery, content generation, in-content images). Audit is first.
 */

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export type JobType =
  | 'content_audit'
  // reserved for later phases:
  | 'keyword_discovery'
  | 'blog_generate'
  | 'content_image';

export interface JobRecord {
  id: string;
  project_id: string | null;
  user_id: string;
  type: string;
  status: JobStatus;
  idempotency_key: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

/** Payload for a `content_audit` job — mirrors AuditStudioInput. */
export interface ContentAuditJobPayload {
  url: string;
  projectId: string;
  projectDomain?: string;
  region?: string;
  language?: string;
  uploadedContent?: string;
  uploadedTitle?: string;
  focusKeyword?: string;
  /** How the audit was started — drives the persisted `_source`. */
  origin?: 'url' | 'batch' | 'upload';
}

export const JOB_SELECT =
  'id, project_id, user_id, type, status, idempotency_key, payload, result, error, attempts, max_attempts, run_after, locked_at, created_at, updated_at, finished_at';
