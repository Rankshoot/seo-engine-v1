/**
 * Competitor Benchmarking Engine.
 * Only exports types and trace entries now as scraping, Serper discovery,
 * and opportunity score calculations have been removed.
 */

export interface BenchmarkTraceEntry {
  label: string;
  url?: string;
  ok: boolean;
  ms?: number;
  info?: Record<string, unknown>;
  error?: string;
}
