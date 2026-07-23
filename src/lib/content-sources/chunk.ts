/**
 * Split extracted source markdown/text into retrievable chunks.
 *
 * Chunks are sized for embedding + later prompt injection: roughly ~800 tokens
 * each with a small overlap so a fact that straddles a boundary still lands
 * whole in at least one chunk. A hard cap keeps a very large document (up to the
 * 100 MB upload limit) bounded — we embed and store at most `maxChunks`.
 */

/** Rough token estimate — ~4 chars/token is close enough for budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface SourceChunk {
  index: number;
  content: string;
  tokenEstimate: number;
}

export interface ChunkOptions {
  /** Target characters per chunk (~800 tokens ≈ 3200 chars). */
  targetChars?: number;
  /** Overlap characters carried into the next chunk. */
  overlapChars?: number;
  /** Hard cap on number of chunks produced. */
  maxChunks?: number;
}

/**
 * Paragraph-aware splitter: packs whole paragraphs into a chunk until the target
 * size, then starts a new one (carrying a short overlap). Paragraphs larger than
 * the target are hard-split so no single chunk blows the budget.
 */
export function chunkSourceText(raw: string, opts: ChunkOptions = {}): SourceChunk[] {
  const targetChars = opts.targetChars ?? 3200;
  const overlapChars = opts.overlapChars ?? 300;
  const maxChunks = opts.maxChunks ?? 400;

  const text = raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];

  // Split into paragraphs, then hard-split any paragraph longer than the target.
  const paragraphs: string[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= targetChars) {
      paragraphs.push(p);
    } else {
      for (let i = 0; i < p.length; i += targetChars) {
        paragraphs.push(p.slice(i, i + targetChars));
      }
    }
  }

  const chunks: SourceChunk[] = [];
  let buf = "";
  const flush = () => {
    const content = buf.trim();
    if (content) {
      chunks.push({ index: chunks.length, content, tokenEstimate: estimateTokens(content) });
    }
    // Carry a short tail as overlap into the next chunk.
    buf = content.length > overlapChars ? content.slice(-overlapChars) + "\n\n" : "";
  };

  for (const para of paragraphs) {
    if (chunks.length >= maxChunks) break;
    if (buf.length + para.length > targetChars && buf.trim().length > 0) {
      flush();
      if (chunks.length >= maxChunks) break;
    }
    buf += (buf ? "\n\n" : "") + para;
  }
  if (chunks.length < maxChunks && buf.trim()) flush();

  return chunks.slice(0, maxChunks);
}
