/** Third-party API providers tracked in `api_usage_logs`. */
export const API_USAGE_PROVIDERS = [
  "ahrefs",
  "dataforseo",
  "gemini",
  "serper",
  "perplexity",
  "jina",
  "scraper",
  "openai",
  "claude",
] as const;

export type ApiUsageProvider = (typeof API_USAGE_PROVIDERS)[number];

export const API_USAGE_STATUSES = ["success", "error", "cached"] as const;
export type ApiUsageStatus = (typeof API_USAGE_STATUSES)[number];

export const AI_USAGE_STATUSES = ["success", "error"] as const;
export type AiUsageStatus = (typeof AI_USAGE_STATUSES)[number];

export const ERROR_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type ErrorSeverity = (typeof ERROR_SEVERITIES)[number];

export const ERROR_LOG_STATUSES = ["open", "resolved"] as const;
export type ErrorLogStatus = (typeof ERROR_LOG_STATUSES)[number];
