/**
 * Client-safe helpers for Content Health (no server-only imports).
 * Criticality is derived from the numeric health score so badges and filters
 * stay aligned with “how urgent is this to fix?”.
 */

export type ContentHealthCriticality = 'low' | 'medium' | 'high';

export type ContentHealthPageStatus = 'ok' | 'broken' | 'redirected' | 'empty';

export function criticalityFromScore(
  healthScore: number,
  pageStatus: ContentHealthPageStatus | undefined
): ContentHealthCriticality {
  const ps = pageStatus ?? 'ok';
  if (ps === 'broken' || ps === 'redirected' || ps === 'empty') return 'high';
  const s = Math.max(0, Math.min(100, Math.round(healthScore)));
  if (s < 45) return 'high';
  if (s < 72) return 'medium';
  return 'low';
}
