import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { stripEmptyFragmentAnchorTags } from '@/lib/blog-content';

const TEXT_LIKE = new Set(['md', 'markdown', 'txt', 'text']);

export function extensionOf(filename: string): string {
  const base = filename.trim().toLowerCase();
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i + 1) : '';
}

/**
 * Convert upload bytes to Markdown (server-only). Supports .md/.markdown/.txt and .docx.
 */
export async function bytesToMarkdown(buffer: Buffer, filename: string): Promise<string> {
  const ext = extensionOf(filename);
  if (TEXT_LIKE.has(ext)) {
    const text = buffer.toString('utf8');
    return stripEmptyFragmentAnchorTags(text).replace(/\r\n/g, '\n').trim();
  }
  if (ext === 'docx') {
    const { value: html } = await mammoth.convertToHtml({ buffer });
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    td.remove(['script', 'style']);
    const md = td.turndown(html).replace(/\n{3,}/g, '\n\n').trim();
    return stripEmptyFragmentAnchorTags(md);
  }
  throw new Error(`Unsupported format ".${ext}". Upload Markdown (.md), plain text (.txt), or Word (.docx).`);
}

export function extractTitleFromMarkdown(markdown: string, filename: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  if (m) return m[1].replace(/\*+/g, '').trim();
  const stem = filename.replace(/\.[^.]+$/i, '').replace(/[-_]+/g, ' ').trim();
  return stem || 'Imported article';
}

export function slugFromTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 72) || 'imported-article'
  );
}
