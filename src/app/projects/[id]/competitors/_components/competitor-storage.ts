import type { KeywordStatus } from "@/lib/types";

const GAP_APPROVED_PREFIX = "seo-engine-gap-approved:";
const GAP_REJECTED_PREFIX = "seo-engine-gap-rejected:";
const COMPETITOR_STATUS_PREFIX = "seo-engine:competitor-workspace:";

export function loadApprovedGapKeywords(projectId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(`${GAP_APPROVED_PREFIX}${projectId}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(String).map(s => s.toLowerCase()));
  } catch { return new Set(); }
}

export function persistApprovedGapKeywords(projectId: string, next: Set<string>) {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(`${GAP_APPROVED_PREFIX}${projectId}`, JSON.stringify([...next])); }
  catch { /* ignore quota / private mode */ }
}

export function loadRejectedGapKeywords(projectId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(`${GAP_REJECTED_PREFIX}${projectId}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(String).map(s => s.toLowerCase()));
  } catch { return new Set(); }
}

export function persistRejectedGapKeywords(projectId: string, next: Set<string>) {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(`${GAP_REJECTED_PREFIX}${projectId}`, JSON.stringify([...next])); }
  catch { /* ignore quota / private mode */ }
}

export function loadCompetitorStatuses(projectId: string): Record<string, KeywordStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`${COMPETITOR_STATUS_PREFIX}${projectId}`);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    const out: Record<string, KeywordStatus> = {};
    const allowed: KeywordStatus[] = ["pending", "approved", "rejected"];
    for (const [id, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "string" && (allowed as string[]).includes(v)) out[id] = v as KeywordStatus;
    }
    return out;
  } catch { return {}; }
}

export function persistCompetitorStatuses(projectId: string, next: Record<string, KeywordStatus>) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`${COMPETITOR_STATUS_PREFIX}${projectId}`, JSON.stringify(next)); }
  catch { /* ignore quota / private mode */ }
}
