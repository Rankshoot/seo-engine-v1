export interface AdminAiLogRow {
  id: string;
  userId: string | null;
  projectId: string | null;
  feature: string;
  model: string;
  promptSummary: string;
  hasFullPrompt: boolean;
  hasFullResponse: boolean;
  tokensInput: number | null;
  tokensOutput: number | null;
  estimatedCostUsd: number | null;
  status: string;
  errorMessage: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminAiLogDetail extends AdminAiLogRow {
  promptFull: string | null;
  responseFull: string | null;
}

export interface AdminAiLogsListResult {
  items: AdminAiLogRow[];
  total: number;
  page: number;
  pageSize: number;
}
