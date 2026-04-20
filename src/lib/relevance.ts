/**
 * Embedding-based relevance filter for keyword discovery.
 *
 * Why: DataForSEO returns everything remotely close to the seed phrase, which
 * for generic niches means junk ("creator industry" → "ibm india pvt ltd"). We
 * embed the Business Brief once, embed the candidate keywords in a single
 * batched call, and drop anything below a cosine-similarity threshold.
 *
 * Uses Gemini `text-embedding-004` (free tier generous, 768-dim).
 */

import type { BusinessBrief } from './business-brief';

const EMBED_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents';

const MODEL_PATH = 'models/text-embedding-004';

const DEFAULT_THRESHOLD = 0.55;
/** How many strings to send per batchEmbedContents call. */
const BATCH_SIZE = 100;

export interface RelevanceScore {
  keyword: string;
  score: number;
  kept: boolean;
}

export interface FilterResult<T> {
  kept: T[];
  dropped: T[];
  scores: RelevanceScore[];
  /** True if the filter ran; false means we fell back to pass-through. */
  filtered: boolean;
  threshold: number;
  reason?: string;
}

/** Build a single "what this business is about" string to embed once. */
export function briefAnchorText(brief: BusinessBrief): string {
  const parts = [
    brief.summary,
    brief.products.join(', '),
    brief.entities.join(', '),
    brief.audiences.join(', '),
    brief.usps.join(', '),
    brief.seed_phrases.slice(0, 15).join(', '),
  ].filter(Boolean);
  return parts.join('\n').slice(0, 4000);
}

interface EmbedResponse {
  embeddings?: Array<{ values?: number[] }>;
  error?: { message?: string };
}

async function embedBatch(texts: string[], taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT'): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing in server env');

  const body = {
    requests: texts.map(text => ({
      model: MODEL_PATH,
      content: { parts: [{ text }] },
      taskType,
    })),
  };

  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Gemini embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as EmbedResponse;
  if (json.error?.message) throw new Error(`Gemini embed error: ${json.error.message}`);
  const rows = json.embeddings ?? [];
  return rows.map(r => r.values ?? []);
}

function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Filter a list of keyword objects by cosine similarity to the brief.
 * Generic over the row shape so this stays decoupled from DataForSEO types.
 */
export async function filterByRelevance<T extends { keyword: string }>(
  brief: BusinessBrief,
  rows: T[],
  opts: { threshold?: number; minKept?: number } = {}
): Promise<FilterResult<T>> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  // If we should never drop below this many rows, we soften the threshold at the end.
  const minKept = opts.minKept ?? Math.min(20, Math.ceil(rows.length * 0.3));

  if (!rows.length) {
    return { kept: [], dropped: [], scores: [], filtered: false, threshold };
  }

  // Short brief = not enough signal to filter reliably; skip.
  const anchor = briefAnchorText(brief);
  if (anchor.length < 80) {
    return {
      kept: rows,
      dropped: [],
      scores: [],
      filtered: false,
      threshold,
      reason: 'Brief too thin to filter by; kept everything.',
    };
  }

  let anchorVec: number[];
  try {
    const [vec] = await embedBatch([anchor], 'RETRIEVAL_QUERY');
    anchorVec = vec;
  } catch (e) {
    return {
      kept: rows,
      dropped: [],
      scores: [],
      filtered: false,
      threshold,
      reason: `Anchor embed failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Batch embed the candidate keywords.
  const allVecs: number[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE).map(r => r.keyword);
    try {
      const vecs = await embedBatch(slice, 'RETRIEVAL_DOCUMENT');
      allVecs.push(...vecs);
    } catch (e) {
      return {
        kept: rows,
        dropped: [],
        scores: [],
        filtered: false,
        threshold,
        reason: `Keyword embed failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  const scores: RelevanceScore[] = rows.map((row, i) => ({
    keyword: row.keyword,
    score: cosine(anchorVec, allVecs[i] ?? []),
    kept: false,
  }));

  const indexedSorted = scores
    .map((s, i) => ({ ...s, _i: i }))
    .sort((a, b) => b.score - a.score);

  // Decide effective threshold: never let it drop us below minKept rows.
  const effectiveThreshold =
    indexedSorted.length > minKept
      ? Math.min(threshold, indexedSorted[minKept - 1].score)
      : -1;

  const kept: T[] = [];
  const dropped: T[] = [];
  for (let i = 0; i < rows.length; i++) {
    const keep = scores[i].score >= effectiveThreshold;
    scores[i].kept = keep;
    if (keep) kept.push(rows[i]);
    else dropped.push(rows[i]);
  }

  return {
    kept,
    dropped,
    scores,
    filtered: true,
    threshold: effectiveThreshold,
  };
}
