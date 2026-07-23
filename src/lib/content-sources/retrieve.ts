/**
 * Assemble the knowledge-source material to feed the writer for a given blog.
 *
 * Strategy: feed the FULL report when it fits the budget (so the writer sees all
 * of it and can pull whatever is relevant to the article's industry/topic).
 * Only when a report is too large for the context window do we fall back to
 * embedding retrieval over its chunks and inject just the most relevant
 * passages. Fully best-effort: any failure returns `[]` so generation is never
 * blocked by this.
 */

import { supabaseAdmin } from "@/lib/supabase";
import { embedBatch, cosine } from "@/lib/relevance";
import { estimateTokens } from "@/lib/content-sources/chunk";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ~4 chars per token. */
const TOKENS_TO_CHARS = 4;
/** Total budget for ALL sources injected into one blog. */
const DEFAULT_GLOBAL_TOKEN_BUDGET = 60_000;
/** A single source may be fed wholesale up to this size; larger → retrieval. */
const FULL_SOURCE_MAX_TOKENS = 45_000;
/** Cap for the retrieval-fallback excerpts of one oversized source. */
const RETRIEVAL_PER_SOURCE_TOKENS = 18_000;
/** Weak floor so clearly-irrelevant passages don't get pulled in fallback mode. */
const RETRIEVAL_MIN_SCORE = 0.15;

export interface RetrievedSource {
  sourceId: string;
  title: string;
  citeUrl: string | null;
  /** The material to inject (whole report, or concatenated top passages). */
  text: string;
  /** 'full' = entire report; 'excerpts' = retrieval fallback for a huge report. */
  mode: "full" | "excerpts";
  tokenEstimate: number;
}

export interface RetrieveParams {
  projectId: string;
  /** Optional-scope sources the user selected for this blog. */
  sourceIds?: string[];
  /** What the article is about — focus keyword + title + secondary keywords. */
  query: string;
  /** Total token budget across all sources. */
  tokenBudget?: number;
}

interface SourceRow {
  id: string;
  title: string;
  cite_url: string | null;
  scope: string;
  char_count: number | null;
  extracted_text: string | null;
}

interface ChunkRow {
  content: string;
  embedding: number[] | null;
  token_estimate: number;
}

/** Retrieval fallback: rank one source's chunks by relevance, pack to a budget. */
async function retrieveExcerptsForSource(
  sourceId: string,
  queryVec: number[],
  budgetTokens: number,
): Promise<{ text: string; tokens: number }> {
  const { data } = await supabaseAdmin
    .from("content_source_chunks")
    .select("content, embedding, token_estimate")
    .eq("source_id", sourceId)
    .limit(3000);

  const chunks = ((data as ChunkRow[] | null) ?? []).filter(
    (c) => Array.isArray(c.embedding) && c.embedding.length > 0,
  );
  if (!chunks.length) return { text: "", tokens: 0 };

  const ranked = chunks
    .map((c) => ({ c, score: cosine(queryVec, c.embedding as number[]) }))
    .sort((a, b) => b.score - a.score);

  const picked: string[] = [];
  let used = 0;
  for (const { c, score } of ranked) {
    if (score < RETRIEVAL_MIN_SCORE) break;
    const t = c.token_estimate || estimateTokens(c.content);
    if (used + t > budgetTokens && picked.length > 0) break;
    picked.push(c.content.trim());
    used += t;
    if (used >= budgetTokens) break;
  }
  return { text: picked.join("\n\n…\n\n"), tokens: used };
}

/**
 * Returns the assembled material per eligible source (always-scope + explicitly
 * selected), capped to the global token budget. Empty array when there are no
 * eligible sources or on any error.
 */
export async function retrieveRelevantSourceExcerpts(
  params: RetrieveParams,
): Promise<RetrievedSource[]> {
  const { projectId, sourceIds = [], query } = params;
  const globalBudget = params.tokenBudget ?? DEFAULT_GLOBAL_TOKEN_BUDGET;

  try {
    // Eligible = ready sources that are always-on OR explicitly selected.
    // Client-supplied ids are validated as UUIDs before going into the filter.
    const selected = sourceIds.filter((id) => UUID_RE.test(id));
    let q = supabaseAdmin
      .from("content_sources")
      .select("id, title, cite_url, scope, char_count, extracted_text")
      .eq("project_id", projectId)
      .eq("status", "ready");
    q = selected.length
      ? q.or(`scope.eq.always,id.in.(${selected.join(",")})`)
      : q.eq("scope", "always");

    const { data: sourceData } = await q;
    const sources = (sourceData as SourceRow[] | null) ?? [];
    if (!sources.length) return [];

    // Lazily embed the query only if a retrieval fallback is actually needed.
    let queryVec: number[] | null = null;
    const getQueryVec = async (): Promise<number[] | null> => {
      if (queryVec) return queryVec;
      if (!query.trim()) return null;
      try {
        const [vec] = await embedBatch([query.slice(0, 2000)], "RETRIEVAL_QUERY");
        queryVec = vec?.length ? vec : null;
      } catch {
        queryVec = null;
      }
      return queryVec;
    };

    const results: RetrievedSource[] = [];
    let remaining = globalBudget;

    for (const s of sources) {
      if (remaining < 800) break;
      const fullText = (s.extracted_text ?? "").trim();
      const fullTokens = fullText ? estimateTokens(fullText) : 0;

      // Prefer feeding the whole report when it fits.
      if (fullText && fullTokens <= Math.min(FULL_SOURCE_MAX_TOKENS, remaining)) {
        results.push({
          sourceId: s.id,
          title: s.title,
          citeUrl: s.cite_url,
          text: fullText,
          mode: "full",
          tokenEstimate: fullTokens,
        });
        remaining -= fullTokens;
        continue;
      }

      // Otherwise (report too big, or no stored full text): retrieval fallback.
      const vec = await getQueryVec();
      if (!vec) {
        // No query vector: as a last resort, feed the head of the report so the
        // source still contributes something rather than nothing.
        if (fullText) {
          const budgetChars = Math.min(remaining, RETRIEVAL_PER_SOURCE_TOKENS) * TOKENS_TO_CHARS;
          const head = fullText.slice(0, budgetChars);
          const tokens = estimateTokens(head);
          results.push({ sourceId: s.id, title: s.title, citeUrl: s.cite_url, text: head, mode: "excerpts", tokenEstimate: tokens });
          remaining -= tokens;
        }
        continue;
      }
      const perSource = Math.min(RETRIEVAL_PER_SOURCE_TOKENS, remaining);
      const { text, tokens } = await retrieveExcerptsForSource(s.id, vec, perSource);
      if (text) {
        results.push({ sourceId: s.id, title: s.title, citeUrl: s.cite_url, text, mode: "excerpts", tokenEstimate: tokens });
        remaining -= tokens;
      }
    }

    return results;
  } catch (e) {
    console.warn("[content-sources] retrieval failed, continuing without:", e);
    return [];
  }
}
