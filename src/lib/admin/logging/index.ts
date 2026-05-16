export {
  logApiUsage,
  logAiUsage,
  logSystemError,
} from "@/lib/admin/logging/usage-logger";

export {
  runWithUsageLogContext,
  getUsageLogContext,
  mergeUsageLogContext,
  type UsageLogContext,
} from "@/lib/admin/logging/log-context";

export {
  recordDataForSeoCall,
  recordAhrefsCall,
  recordSerperCall,
  recordJinaCall,
  recordScraperCall,
  recordGeminiCall,
  recordApiCacheHit,
  extractGeminiTokenUsage,
} from "@/lib/admin/logging/record-provider-call";

export {
  logAdminAudit,
  AdminAuditAction,
  type AdminAuditActionType,
} from "@/lib/admin/logging/admin-audit-logger";

export {
  redactText,
  summarizeForAiLog,
  redactMetadata,
} from "@/lib/admin/logging/redact";

export {
  estimateApiCallCostUsd,
  estimateDataForSeoCostUsd,
  estimateGeminiCostUsd,
} from "@/lib/admin/logging/cost-estimates";

export {
  isAiDebugLoggingEnabled,
  invalidatePlatformSettingsCache,
} from "@/lib/admin/logging/platform-settings-cache";

export type {
  LogApiUsageInput,
  LogAiUsageInput,
  LogSystemErrorInput,
  LogAdminAuditInput,
} from "@/types/admin-logging";

export {
  API_USAGE_PROVIDERS,
  API_USAGE_STATUSES,
  AI_USAGE_STATUSES,
  ERROR_SEVERITIES,
  type ApiUsageProvider,
  type ApiUsageStatus,
  type AiUsageStatus,
  type ErrorSeverity,
} from "@/constants/enums/usage-provider";
