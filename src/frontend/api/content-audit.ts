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

  history(projectId: string): Promise<{ success: boolean; error?: string; items: ContentAuditHistoryItem[] }> {
    return apiGet(V1Routes.contentAuditHistory(projectId));
  },

  clearHistory(projectId: string): Promise<{ success: boolean; error?: string }> {
    return apiDelete(V1Routes.contentAuditHistory(projectId));
  },
};
