/**
 * Ingest a content source: extract text → chunk → embed → persist chunks.
 *
 * Runs inside the durable `content_source_ingest` background job so a large
 * upload (up to 100 MB) survives request timeouts. Idempotent: re-running clears
 * the source's existing chunks first, so a retried job converges.
 */

import { supabaseAdmin } from "@/lib/supabase";
import { bytesToMarkdown } from "@/lib/import-content";
import { getContentSourceFile } from "@/lib/server/content-source-storage";
import { embedBatch } from "@/lib/relevance";
import { chunkSourceText } from "@/lib/content-sources/chunk";

/** Gemini batchEmbedContents caps ~100 texts per request (see relevance.ts). */
const EMBED_BATCH = 100;
/** Never feed the extractor/embedder an unbounded blob. */
const MAX_EXTRACTED_CHARS = 1_500_000;
/** How much full text we retain for wholesale injection (~200k tokens ceiling). */
const MAX_STORED_TEXT_CHARS = 800_000;

interface ContentSourceRow {
  id: string;
  project_id: string;
  kind: string;
  storage_path: string | null;
  original_filename: string | null;
  source_url: string | null;
}

async function markFailed(sourceId: string, message: string): Promise<void> {
  await supabaseAdmin
    .from("content_sources")
    .update({ status: "failed", error: message.slice(0, 2000), updated_at: new Date().toISOString() })
    .eq("id", sourceId);
}

/**
 * Extract a source to markdown/text: uploaded files via `bytesToMarkdown`,
 * links via the hybrid scraper (Jina/Playwright). Throws with a user-facing
 * message on unreadable input.
 */
async function extractSource(row: ContentSourceRow): Promise<string> {
  if (row.kind === "link") {
    if (!row.source_url) throw new Error("Link source has no URL.");
    const { hybridReadUrl } = await import("@/services/hybridScraper");
    const res = await hybridReadUrl(row.source_url, { timeoutMs: 30_000 });
    if (!res.ok || res.markdown.trim().length < 200) {
      throw new Error("Could not read enough text from that link. Try a different URL or upload the file.");
    }
    return res.markdown;
  }
  // file kind
  if (!row.storage_path) throw new Error("File source has no stored file.");
  const buffer = await getContentSourceFile(row.storage_path);
  return bytesToMarkdown(buffer, row.original_filename || "upload");
}

/**
 * Full ingestion for one source id. Loads the row, extracts, chunks, embeds in
 * batches, replaces chunks, and flips status to 'ready' (or 'failed').
 */
export async function ingestContentSource(sourceId: string): Promise<{ chunkCount: number; charCount: number }> {
  const { data: row, error } = await supabaseAdmin
    .from("content_sources")
    .select("id, project_id, kind, storage_path, original_filename, source_url")
    .eq("id", sourceId)
    .single();

  if (error || !row) throw new Error(`content source ${sourceId} not found`);
  const source = row as ContentSourceRow;

  await supabaseAdmin
    .from("content_sources")
    .update({ status: "processing", error: "", updated_at: new Date().toISOString() })
    .eq("id", sourceId);

  try {
    let markdown = (await extractSource(source)).trim();
    if (!markdown) throw new Error("No extractable text found in this source.");
    if (markdown.length > MAX_EXTRACTED_CHARS) markdown = markdown.slice(0, MAX_EXTRACTED_CHARS);

    const chunks = chunkSourceText(markdown);
    if (!chunks.length) throw new Error("Source produced no usable text chunks.");

    // Embed in batches, then persist chunk rows with their vectors.
    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const slice = chunks.slice(i, i + EMBED_BATCH).map((c) => c.content);
      const vecs = await embedBatch(slice, "RETRIEVAL_DOCUMENT");
      vectors.push(...vecs);
    }

    // Idempotent replace: clear any prior chunks from a previous run.
    await supabaseAdmin.from("content_source_chunks").delete().eq("source_id", sourceId);

    const rows = chunks.map((c, i) => ({
      source_id: sourceId,
      project_id: source.project_id,
      chunk_index: c.index,
      content: c.content,
      embedding: vectors[i] ?? null,
      token_estimate: c.tokenEstimate,
    }));
    // Insert in pages to keep payloads reasonable.
    for (let i = 0; i < rows.length; i += 200) {
      const { error: insErr } = await supabaseAdmin
        .from("content_source_chunks")
        .insert(rows.slice(i, i + 200));
      if (insErr) throw new Error(`persist chunks failed: ${insErr.message}`);
    }

    const charCount = markdown.length;
    await supabaseAdmin
      .from("content_sources")
      .update({
        status: "ready",
        error: "",
        char_count: charCount,
        chunk_count: chunks.length,
        // Keep the full text so the writer can be fed the whole report when it
        // fits the context budget (retrieval is only a fallback for huge docs).
        extracted_text: markdown.slice(0, MAX_STORED_TEXT_CHARS),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceId);

    return { chunkCount: chunks.length, charCount };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markFailed(sourceId, msg);
    throw new Error(msg);
  }
}
