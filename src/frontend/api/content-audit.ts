import { apiGet, apiPost, apiDelete } from './http';
import { V1Routes } from './routes';
import type { ContentAuditReport } from '@/lib/content-audit-studio';

export interface ContentAuditHistoryItem {
  url: string;
  title: string;
  primary_keyword: string;
  word_count: number;
  health_score: number;
  overall_score: number;
  severity: string;
  updated_at: string;
  version: number;
  plain_language_verdict: string;
  report: ContentAuditReport | null;
  source?: 'url' | 'upload';
  /** 'quick' = LLM-free site-scan tier (fixed parameters, no competitor data); 'deep' = full audit. */
  tier: 'quick' | 'deep';
}

export interface AnalyzeResponse {
  success: boolean;
  error?: string;
  report?: ContentAuditReport;
  record?: {
    url: string;
    title: string;
    primary_keyword: string;
    word_count: number;
    health_score: number;
    severity: string;
    error?: string;
  };
  trace?: { step: string; ok: boolean; detail?: string; ms?: number }[];
}

export const contentAuditApi = {
  analyze(projectId: string, url: string, opts?: { uploadedContent?: string; uploadedTitle?: string; focusKeyword?: string }): Promise<AnalyzeResponse> {
    return apiPost(V1Routes.contentAuditAnalyze(projectId), { url, ...opts });
  },

  history(
    projectId: string,
    opts?: { limit?: number; offset?: number }
  ): Promise<{ success: boolean; error?: string; items: ContentAuditHistoryItem[]; total: number; hasMore: boolean }> {
    const qs = new URLSearchParams();
    if (opts?.limit != null) qs.set('limit', String(opts.limit));
    if (opts?.offset != null) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    // Polled during site scans — always fetch fresh so newly-scanned pages appear.
    return apiGet(`${V1Routes.contentAuditHistory(projectId)}${q ? `?${q}` : ''}`, { noStore: true });
  },

  /** Map of audited URL → generated ("enhanced") blogId for this project. */
  generatedMap(projectId: string): Promise<{ map: Record<string, string>; error?: string }> {
    return apiGet(V1Routes.contentAuditGeneratedMap(projectId));
  },

  /** Map of audited URL → { entryId, scheduledDate } for this project. */
  scheduledMap(projectId: string): Promise<{ map: Record<string, { entryId: string; scheduledDate: string }>; error?: string }> {
    return apiGet(V1Routes.contentAuditScheduledMap(projectId));
  },

  clearHistory(projectId: string): Promise<{ success: boolean; error?: string }> {
    return apiDelete(V1Routes.contentAuditHistory(projectId));
  },
};
