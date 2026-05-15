import { bytesToMarkdown } from '@/lib/import-content';
import { readUrlViaJinaReader } from '@/lib/jina';

export type InstantCustomRefPayload =
  | { kind: 'file'; filename: string; mimeType: string; dataBase64: string }
  | { kind: 'link'; url: string };

const MAX_REFS = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_CHARS_PER_SOURCE = 50_000;

function clip(s: string, max: number): { text: string; clipped: boolean } {
  if (s.length <= max) return { text: s, clipped: false };
  return { text: `${s.slice(0, max)}\n\n[…truncated after ${max} characters for model context…]`, clipped: true };
}

function normalizeHttpUrl(raw: string): string | null {
  const u = raw.trim();
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Turns uploaded files + public URLs into one markdown block for the instant-article prompt.
 */
export async function ingestInstantArticleCustomSources(
  refs: InstantCustomRefPayload[],
  opts: { timeoutMs?: number } = {}
): Promise<{
  combinedBlock: string;
  okCount: number;
  details: string[];
}> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const details: string[] = [];
  const sections: string[] = [];

  const list = (refs ?? []).slice(0, MAX_REFS);
  if (!list.length) {
    return { combinedBlock: '', okCount: 0, details: ['no references supplied'] };
  }

  let okCount = 0;
  let idx = 0;
  for (const ref of list) {
    idx += 1;
    if (ref.kind === 'link') {
      const url = normalizeHttpUrl(ref.url);
      if (!url) {
        details.push(`link #${idx}: invalid URL (use http or https)`);
        continue;
      }
      const jina = await readUrlViaJinaReader(url, { timeoutMs });
      if (!jina.ok || !jina.markdown.trim()) {
        details.push(`link #${idx}: ${url.slice(0, 120)} — ${jina.error ?? 'empty'}`);
        continue;
      }
      const { text, clipped } = clip(jina.markdown.trim(), MAX_CHARS_PER_SOURCE);
      sections.push(`### Reference ${idx}: link\n**URL:** ${url}\n\n${text}`);
      okCount += 1;
      details.push(`link #${idx}: ok (${text.length} chars${clipped ? ', clipped' : ''})`);
      continue;
    }

    const name = ref.filename?.trim() || 'upload';
    let buf: Buffer;
    try {
      buf = Buffer.from(ref.dataBase64, 'base64');
    } catch {
      details.push(`file #${idx} (${name}): invalid base64`);
      continue;
    }
    if (!buf.length) {
      details.push(`file #${idx} (${name}): empty file`);
      continue;
    }
    if (buf.length > MAX_FILE_BYTES) {
      details.push(`file #${idx} (${name}): exceeds ${MAX_FILE_BYTES} bytes`);
      continue;
    }

    let md: string;
    try {
      md = await bytesToMarkdown(buf, name);
    } catch (e) {
      details.push(`file #${idx} (${name}): ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const { text, clipped } = clip(md.trim(), MAX_CHARS_PER_SOURCE);
    if (!text) {
      details.push(`file #${idx} (${name}): no text after conversion`);
      continue;
    }
    sections.push(`### Reference ${idx}: uploaded file\n**Filename:** ${name}\n\n${text}`);
    okCount += 1;
    details.push(`file #${idx} (${name}): ok (${text.length} chars${clipped ? ', clipped' : ''})`);
  }

  if (!sections.length) {
    return { combinedBlock: '', okCount: 0, details };
  }

  const combinedBlock = [
    '=== USER-PROVIDED REFERENCE MATERIAL (HIGHEST PRIORITY) ===',
    'The following excerpts come from files the user uploaded and/or URLs they supplied.',
    'Use them as the authoritative source for proprietary facts, product names, internal definitions, metrics, and tone.',
    'If anything in the LIVE RESEARCH CONTEXT below disagrees with this material on the user’s own business or offerings, trust this material.',
    '',
    ...sections,
    '',
    '=== END USER-PROVIDED REFERENCE MATERIAL ===',
  ].join('\n');

  return { combinedBlock, okCount, details };
}
