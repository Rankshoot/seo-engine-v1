import type {
  AiUsageStatus,
  ApiUsageProvider,
  ApiUsageStatus,
  ErrorSeverity,
} from "@/constants/enums/usage-provider";

export interface LogApiUsageInput {
  userId?: string | null;
  projectId?: string | null;
  provider: ApiUsageProvider;
  feature: string;
  endpoint?: string;
  status: ApiUsageStatus;
  latencyMs?: number | null;
  cached?: boolean;
  cacheHit?: boolean;
  creditsUsed?: number | null;
  estimatedCostUsd?: number | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export interface LogAiUsageInput {
  userId?: string | null;
  projectId?: string | null;
  feature: string;
  model: string;
  prompt: string;
  response?: string | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  tokensCachedRead?: number | null;
  tokensCachedWrite?: number | null;
  costSavingsUsd?: number | null;
  estimatedCostUsd?: number | null;
  status: AiUsageStatus;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export interface LogSystemErrorInput {
  userId?: string | null;
  projectId?: string | null;
  feature: string;
  provider?: string;
  errorMessage: string;
  severity?: ErrorSeverity;
  metadata?: Record<string, unknown>;
}

export interface LogAdminAuditInput {
  adminUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}
