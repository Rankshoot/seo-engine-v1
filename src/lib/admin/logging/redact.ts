const API_KEY_PATTERNS: RegExp[] = [
  /\b(sk|pk)_[a-zA-Z0-9_-]{8,}\b/gi,
  /\bAIza[a-zA-Z0-9_-]{20,}\b/g,
  /\bBearer\s+[a-zA-Z0-9._-]+\b/gi,
  /\b(api[_-]?key|apikey|secret|token)\s*[:=]\s*["']?[\w.-]+["']?/gi,
  /\bGEMINI_API_KEY\s*=\s*\S+/gi,
  /\bAHREFS_API_KEY\s*=\s*\S+/gi,
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export interface RedactTextOptions {
  /** When false, mask email addresses in output. Default true in summaries. */
  redactEmails?: boolean;
  maxLength?: number;
}

/**
 * Strip secrets and optionally emails from log text before persistence.
 */
export function redactText(
  text: string,
  options: RedactTextOptions = {}
): string {
  const { redactEmails = true, maxLength = 2000 } = options;
  let out = text;

  for (const pattern of API_KEY_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }

  if (redactEmails) {
    out = out.replace(EMAIL_PATTERN, "[email]");
  }

  if (maxLength > 0 && out.length > maxLength) {
    out = `${out.slice(0, maxLength)}…`;
  }

  return out;
}

/** Short preview for `prompt_summary` (always redacted, no full prompt). */
export function summarizeForAiLog(prompt: string, maxLength = 200): string {
  const cleaned = redactText(prompt, { redactEmails: true, maxLength: 0 });
  const collapsed = cleaned.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength)}…`;
}

/** Sanitize JSON metadata objects before insert. */
export function redactMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!metadata || Object.keys(metadata).length === 0) return {};

  try {
    const json = JSON.stringify(metadata);
    const redacted = redactText(json, { redactEmails: true, maxLength: 8000 });
    return JSON.parse(redacted) as Record<string, unknown>;
  } catch {
    return { note: "metadata_redaction_failed" };
  }
}
