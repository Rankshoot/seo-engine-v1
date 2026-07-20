/**
 * Background-job types. The framework is generic; `JobType` + the payload
 * interfaces below grow as we move more long-running ops onto it (keyword
 * discovery, content generation, in-content images). Audit is first.
 */

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export type JobType =
  | 'content_audit'
  // Site-wide LLM-free health scan — one job per chunk of URLs.
  | 'site_audit_scan'
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

/** Payload for a `site_audit_scan` job — one chunk of URLs to quick-scan. */
export interface SiteAuditScanJobPayload {
  projectId: string;
  urls: string[];
}

/**
 * Payload for a `blog_generate` job — mirrors the blog-generator form so the
 * durable job produces the same blog the streaming route would, but survives
 * the user refreshing or closing the tab.
 */
export interface BlogGenerateJobPayload {
  userId: string;
  entryId?: string;
  projectId?: string;
  keyword?: string;
  topic?: string;
  audience?: string;
  tone?: string;
  goal?: string;
  ctaObjective?: string;
  secondaryKeywords?: string[];
  wordCount?: number;
  writerNotes?: string;
  contentHealthAudit?: Record<string, unknown>;
  brandPersona?: string;
  useAhrefsData?: boolean;
  ahrefsH2s?: Array<{ keyword: string; volume: number; difficulty: number | null }>;
  ahrefsFaqs?: Array<{ keyword: string; volume: number; difficulty: number | null }>;
  useDeepAnalysis?: boolean;
  deepAnalysisPages?: Array<{ url: string; title: string; domain: string; position: number }>;
  customInstructions?: string;
  /** A human label (topic/keyword) surfaced by the client while polling. */
  label?: string;
  /**
   * When this generation is an "enhanced" rewrite launched from Content Audit
   * Studio, the audited page URL. Lets the audit page map active generation jobs
   * back to their audit row so the shared "Generating…" button state resolves.
   */
  auditUrl?: string;
}

export const JOB_SELECT =
  'id, project_id, user_id, type, status, idempotency_key, payload, result, error, attempts, max_attempts, run_after, locked_at, created_at, updated_at, finished_at';
