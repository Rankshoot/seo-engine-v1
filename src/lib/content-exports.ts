/**
 * Content Studio export formats.
 *
 * Wraps the existing blog `lib/export.ts` for shared formats (Markdown,
 * HTML, TXT, DOCX) and adds bespoke, copy-paste-ready formats for each
 * content type:
 *
 *   • Ebook       → print-ready PDF (browser dialog), EPUB-friendly chapters TXT
 *   • Whitepaper  → print-ready PDF, plain-text executive summary, references
 *   • LinkedIn    → plain post, formatted hashtags block, carousel JSON,
 *                   X/Twitter thread, Markdown
 *
 * All formats are optimised for "click → paste somewhere it'll be published".
 */

import {
  exportToDocx,
  exportToHTML,
  exportToMarkdown,
  exportToText,
  triggerBlogDownload,
  triggerDownload,
  extractYouTubeId,
} from './export';
import { safeFilename } from './blog-content';
import {
  preprocessMarkdownForHtmlExport,
  stripVisualPlaceholders,
} from './visual-export';
import type {
  Blog,
  EbookContentData,
  ExportFormat,
  LinkedInContentData,
  WhitepaperContentData,
} from './types';
import { brandFaviconUrl, brandSiteUrl, displayDomain } from './studio-brand';

// ─── Public format identifiers ─────────────────────────────────────────────

export type EbookExportFormat =
  | 'markdown'
  | 'html'
  | 'pdf'
  | 'docx'
  | 'txt'
  | 'chapters-txt';

export type WhitepaperExportFormat =
  | 'markdown'
  | 'html'
  | 'pdf'
  | 'docx'
  | 'txt'
  | 'executive-summary';

export type LinkedInExportFormat =
  | 'plain-post'
  | 'formatted-post'
  | 'markdown'
  | 'carousel-json'
  | 'x-thread'
  | 'docx';

export interface ExportOption<T extends string> {
  key: T;
  label: string;
  ext: string;
  /** Friendly description shown in the export menu. */
  hint: string;
}

export const EBOOK_EXPORT_OPTIONS: ExportOption<EbookExportFormat>[] = [
  { key: 'pdf', label: 'PDF (print-ready)', ext: '.pdf', hint: 'Opens print dialog — Save as PDF' },
  { key: 'docx', label: 'Word', ext: '.docx', hint: 'Editable Microsoft Word file' },
  { key: 'html', label: 'Web page', ext: '.html', hint: 'Standalone HTML with cover + ToC' },
  { key: 'markdown', label: 'Markdown', ext: '.md', hint: 'For your CMS / Notion / Obsidian' },
  { key: 'chapters-txt', label: 'Chapters (TXT)', ext: '.txt', hint: 'Plain text, one chapter per section' },
  { key: 'txt', label: 'Plain text', ext: '.txt', hint: 'Single-file text dump' },
];

export const WHITEPAPER_EXPORT_OPTIONS: ExportOption<WhitepaperExportFormat>[] = [
  { key: 'pdf', label: 'PDF (print-ready)', ext: '.pdf', hint: 'Opens print dialog — Save as PDF' },
  { key: 'docx', label: 'Word', ext: '.docx', hint: 'Editable Microsoft Word file' },
  { key: 'html', label: 'Web page', ext: '.html', hint: 'Standalone HTML with cover + summary' },
  { key: 'markdown', label: 'Markdown', ext: '.md', hint: 'For your CMS / docs site' },
  { key: 'executive-summary', label: 'Executive summary', ext: '.txt', hint: 'Just the TL;DR + recommendations' },
  { key: 'txt', label: 'Plain text', ext: '.txt', hint: 'Single-file text dump' },
];

export const LINKEDIN_EXPORT_OPTIONS: ExportOption<LinkedInExportFormat>[] = [
  { key: 'plain-post', label: 'Plain post', ext: '.txt', hint: 'Paste straight into LinkedIn' },
  { key: 'formatted-post', label: 'Post + hashtags', ext: '.txt', hint: 'Hook · body · CTA · hashtags' },
  { key: 'markdown', label: 'Markdown', ext: '.md', hint: 'Repurpose into a blog or newsletter' },
  { key: 'carousel-json', label: 'Carousel slides (JSON)', ext: '.json', hint: 'For Canva / Buffer / scheduler' },
  { key: 'x-thread', label: 'X / Twitter thread', ext: '.txt', hint: '280-char chunks, numbered tweets' },
  { key: 'docx', label: 'Word', ext: '.docx', hint: 'Approval routing / printable copy' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

const SHARED_FORMATS: Record<string, ExportFormat> = {
  markdown: 'markdown',
  html: 'html',
  txt: 'txt',
  docx: 'docx',
};

function safeBase(blog: Blog, fallback: string): string {
  return safeFilename(blog.slug || blog.title || blog.target_keyword || fallback);
}

/**
 * Open a styled HTML payload in a new window and trigger the print dialog.
 * Cross-browser: the user picks "Save as PDF" from the OS print dialog.
 * No external dependency — works in dev mode without bundling jsPDF/html2canvas.
 */
function openPrintWindow(html: string) {
  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) {
    throw new Error('Browser blocked the print window. Allow pop-ups for this site.');
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Wait for the document (incl. fonts / images) to finish rendering before
  // showing the print dialog. `setTimeout` is the most reliable cross-browser
  // proxy here — the document has already painted at least once.
  win.addEventListener('load', () => setTimeout(() => win.print(), 250), { once: true });
}

// ─── EBOOK exports ─────────────────────────────────────────────────────────

export async function exportEbook(blog: Blog, format: EbookExportFormat, project?: { domain?: string; company?: string }) {
  const data = (blog.content_data ?? {}) as Partial<EbookContentData>;
  const base = safeBase(blog, 'ebook');

  if (format in SHARED_FORMATS) {
    const fmt = SHARED_FORMATS[format];
    let blob: Blob;
    if (fmt === 'markdown') blob = exportToMarkdown(blog, project);
    else if (fmt === 'html') blob = exportToHTML(blog, project);
    else if (fmt === 'txt')
      blob = exportToText(
        blog,
        project?.company?.trim()
          ? {
              publisherLine: `Publisher: ${project.company.trim()}${project.domain?.trim() ? ` · ${displayDomain(project.domain)}` : ''}`,
            }
          : undefined,
      );
    else blob = await exportToDocx(blog);
    triggerBlogDownload(blob, blog, fmt);
    return;
  }

  if (format === 'pdf') {
    openPrintWindow(buildEbookPrintHtml(blog, data, project));
    return;
  }

  if (format === 'chapters-txt') {
    const chapters = splitMarkdownByH2(stripVisualPlaceholders(blog.content));
    const out = chapters
      .map((c, i) => `CHAPTER ${i + 1}: ${c.title}\n${'='.repeat(60)}\n\n${stripMarkdown(c.body)}`)
      .join('\n\n\n');
    const headerLines = [
      `EBOOK: ${blog.title}`,
      data.cover_subtitle ? `SUBTITLE: ${data.cover_subtitle}` : '',
      `WORDS: ${blog.word_count.toLocaleString()}`,
    ].filter(Boolean);
    if (project?.company?.trim()) {
      headerLines.push(
        `Publisher: ${project.company.trim()}${project.domain?.trim() ? ` · ${displayDomain(project.domain)}` : ''}`,
      );
    }
    headerLines.push('='.repeat(60), '', '');
    const header = headerLines.join('\n');
    triggerDownload(new Blob([header + '\n' + out], { type: 'text/plain' }), `${base}-chapters.txt`);
    return;
  }
}

// ─── WHITEPAPER exports ────────────────────────────────────────────────────

export async function exportWhitepaper(
  blog: Blog,
  format: WhitepaperExportFormat,
  project?: { domain?: string; company?: string },
) {
  const data = (blog.content_data ?? {}) as Partial<WhitepaperContentData>;
  const base = safeBase(blog, 'whitepaper');

  if (format in SHARED_FORMATS) {
    const fmt = SHARED_FORMATS[format];
    let blob: Blob;
    if (fmt === 'markdown') blob = exportToMarkdown(blog, project);
    else if (fmt === 'html') blob = exportToHTML(blog, project);
    else if (fmt === 'txt')
      blob = exportToText(
        blog,
        project?.company?.trim()
          ? {
              publisherLine: `Publisher: ${project.company.trim()}${project.domain?.trim() ? ` · ${displayDomain(project.domain)}` : ''}`,
            }
          : undefined,
      );
    else blob = await exportToDocx(blog);
    triggerBlogDownload(blob, blog, fmt);
    return;
  }

  if (format === 'pdf') {
    openPrintWindow(buildWhitepaperPrintHtml(blog, data, project));
    return;
  }

  if (format === 'executive-summary') {
    const lines: string[] = [];
    lines.push(`${blog.title}`.toUpperCase());
    if (data.cover_subtitle) lines.push(data.cover_subtitle);
    lines.push('='.repeat(60));
    lines.push('');
    if (project?.company?.trim()) {
      lines.push(
        `Publisher: ${project.company.trim()}${project.domain?.trim() ? ` · ${displayDomain(project.domain)}` : ''}`,
      );
      lines.push('');
    }
    lines.push('EXECUTIVE SUMMARY');
    lines.push('-'.repeat(60));
    lines.push(data.executive_summary || extractExecSummary(blog.content) || '(no executive summary)');
    if (data.recommendations?.length) {
      lines.push('');
      lines.push('RECOMMENDATIONS');
      lines.push('-'.repeat(60));
      data.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    }
    if (data.references?.length) {
      lines.push('');
      lines.push('REFERENCES');
      lines.push('-'.repeat(60));
      data.references.forEach((u, i) => lines.push(`[${i + 1}] ${u}`));
    }
    triggerDownload(new Blob([lines.join('\n')], { type: 'text/plain' }), `${base}-summary.txt`);
    return;
  }
}

// ─── LINKEDIN exports ──────────────────────────────────────────────────────

export async function exportLinkedInPost(blog: Blog, format: LinkedInExportFormat) {
  const data = (blog.content_data ?? {}) as Partial<LinkedInContentData>;
  const base = safeBase(blog, 'linkedin-post');
  const hook = data.hook?.trim() ?? '';
  const body = data.body?.trim() ?? '';
  const cta = data.cta?.trim() ?? '';
  const hashtags = data.hashtags ?? [];
  const featuredImage = data.featured_image_url?.trim() ?? '';

  if (format === 'plain-post') {
    const parts = [hook, body, cta].filter(Boolean);
    if (featuredImage) {
      parts.push(`Featured image (attach in LinkedIn):\n${featuredImage}`);
    }
    const txt = parts.join('\n\n');
    triggerDownload(new Blob([txt], { type: 'text/plain' }), `${base}-post.txt`);
    return;
  }

  if (format === 'formatted-post') {
    const parts = [hook, body, cta, hashtags.join(' ')].filter(Boolean);
    if (featuredImage) {
      parts.push(`Featured image:\n${featuredImage}`);
    }
    const txt = parts.join('\n\n');
    triggerDownload(new Blob([txt], { type: 'text/plain' }), `${base}-formatted.txt`);
    return;
  }

  if (format === 'markdown') {
    let md = `# ${blog.title}\n\n## Hook\n${hook}\n\n## Body\n${body}\n\n## Call to Action\n${cta}\n\n## Hashtags\n${hashtags.join(' ')}\n`;
    if (featuredImage) {
      md += `\n## Featured image\n![Featured Image](${featuredImage})\n`;
    }
    triggerDownload(new Blob([md], { type: 'text/markdown' }), `${base}.md`);
    return;
  }

  if (format === 'carousel-json') {
    const slides = buildCarouselSlides(hook, body, cta, hashtags);
    const json = JSON.stringify(
      {
        title: blog.title,
        post_style: data.post_style ?? 'educational',
        audience: data.audience ?? '',
        tone: data.tone ?? '',
        primary_keyword: data.primary_keyword ?? blog.target_keyword,
        slides,
        hashtags,
        ...(featuredImage ? { featured_image_url: featuredImage } : {}),
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    );
    triggerDownload(new Blob([json], { type: 'application/json' }), `${base}-carousel.json`);
    return;
  }

  if (format === 'x-thread') {
    const thread = buildXThread(hook, body, cta, hashtags);
    const txt = thread.map((t, i) => `${i + 1}/${thread.length}\n${t}`).join('\n\n---\n\n');
    triggerDownload(new Blob([txt], { type: 'text/plain' }), `${base}-thread.txt`);
    return;
  }

  if (format === 'docx') {
    const patchedBlog = {
      ...blog,
      content: blog.content + (featuredImage ? `\n\n![Featured Image](${featuredImage})` : ''),
    };
    const blob = await exportToDocx(patchedBlog);
    triggerBlogDownload(blob, blog, 'docx');
    return;
  }
}

// ─── PDF/HTML builders ─────────────────────────────────────────────────────

function printPublisherRibbon(
  project?: { domain?: string; company?: string },
  variant: "ebook" | "paper" = "ebook",
): string {
  const company = project?.company?.trim();
  const domain = project?.domain?.trim();
  if (!company && !domain) return "";
  const host = domain ? displayDomain(domain) : "";
  const href = domain ? escapeAttr(brandSiteUrl(domain)) : "";
  const fav = domain ? brandFaviconUrl(domain) : null;
  const border = variant === "paper" ? "#d6dde8" : "#c1b59a";
  const img = fav
    ? `<img src="${escapeAttr(fav)}" width="44" height="44" alt="" style="border-radius:8px;border:1px solid ${border}" />`
    : "";
  const name = escapeHtml(company || host || "Publisher");
  const link = host && href ? `<a href="${href}">${escapeHtml(host)}</a>` : "";
  const titleColor = variant === "paper" ? "#101828" : "#1a120b";
  const subColor = variant === "paper" ? "#44546a" : "#534a3c";
  return `<div class="publisher-print" style="display:flex;align-items:center;justify-content:center;gap:14px;margin-top:18pt;padding-top:16pt;border-top:1px solid ${border};font-family:ui-sans-serif,system-ui,sans-serif;font-size:11pt;">
    ${img}
    <div style="text-align:left;line-height:1.35;">
      <div style="font-weight:700;color:${titleColor};">${name}</div>
      ${link ? `<div style="color:${subColor};margin-top:3pt;">${link}</div>` : ""}
    </div>
  </div>`;
}

function buildEbookPrintHtml(
  blog: Blog,
  data: Partial<EbookContentData>,
  project?: { domain?: string; company?: string },
): string {
  const cover = escapeHtml(data.cover_title || blog.title);
  const subtitle = escapeHtml(data.cover_subtitle ?? '');
  const audience = escapeHtml(data.audience ?? '');
  const tone = escapeHtml(data.tone ?? '');
  const toc = (data.table_of_contents ?? [])
    .map(c => `<li><span class="toc-num">${String(c.number).padStart(2, '0')}</span> ${escapeHtml(c.title)}</li>`)
    .join('');
  // Pre-process visual placeholders → inline HTML/SVG before line-by-line rendering
  const body = renderMarkdownToBookHtml(preprocessMarkdownForHtmlExport(blog.content, 'ebook'));
  const faqs = (data.faqs ?? [])
    .map(q => `<div class="faq"><h3>${escapeHtml(q.question)}</h3><p>${escapeHtml(q.answer)}</p></div>`)
    .join('');
  const refs = (data.references ?? [])
    .map(u => `<li><a href="${escapeAttr(u)}">${escapeHtml(u)}</a></li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>${escapeHtml(blog.title)}</title>
<style>
  @page { size: A4; margin: 22mm 18mm 22mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #111; line-height: 1.7; max-width: 720px; margin: 0 auto; padding: 32px; background: #faf7f2; }
  h1 { font-size: 28pt; line-height: 1.15; margin: 0 0 8pt 0; letter-spacing: -0.5px; }
  h2 { font-size: 18pt; margin: 32pt 0 8pt 0; page-break-after: avoid; }
  h3 { font-size: 13pt; margin: 18pt 0 6pt 0; page-break-after: avoid; }
  p { margin: 0 0 10pt 0; }
  a { color: #1863dc; text-decoration: underline; }
  blockquote { margin: 16pt 0; padding: 8pt 16pt; border-left: 3px solid #ccc; background: #f1ede5; font-style: italic; }
  ul, ol { margin: 10pt 0 10pt 20pt; }
  hr { border: none; border-top: 1px solid #ddd; margin: 18pt 0; }
  .cover { min-height: 70vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; padding: 48pt 24pt; border-bottom: 2px solid #c1b59a; }
  .cover .badge { font-family: ui-monospace, monospace; font-size: 10pt; letter-spacing: 0.16em; color: #6b6253; text-transform: uppercase; margin-bottom: 24pt; }
  .cover .subtitle { font-size: 13pt; color: #534a3c; margin-top: 8pt; max-width: 540px; }
  .cover .meta { font-family: ui-monospace, monospace; font-size: 9pt; letter-spacing: 0.12em; color: #807460; margin-top: 36pt; text-transform: uppercase; }
  .toc { page-break-after: always; }
  .toc h2 { border-bottom: 1px solid #c1b59a; padding-bottom: 6pt; }
  .toc ol { list-style: none; padding: 0; }
  .toc li { display: flex; gap: 10pt; padding: 6pt 0; border-bottom: 1px dotted #d8d0bf; }
  .toc-num { font-family: ui-monospace, monospace; font-size: 10pt; color: #6b6253; min-width: 28pt; }
  .faq { margin: 12pt 0; padding: 8pt 0; border-bottom: 1px dotted #d8d0bf; }
  .faq h3 { margin: 0 0 4pt 0; }
  .faq p { margin: 0; }
  .refs { font-size: 10pt; color: #4d4538; }
  .refs a { word-break: break-all; }
  @media print { a { color: #111; text-decoration: none; } .no-print { display: none; } }
</style>
</head><body>
  <section class="cover">
    <div class="badge">Ebook</div>
    <h1>${cover}</h1>
    ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
    <div class="meta">${audience ? `For ${audience}` : ''}${audience && tone ? ' · ' : ''}${tone ? `Tone · ${tone}` : ''}</div>
    ${printPublisherRibbon(project, "ebook")}
  </section>
  ${
    toc
      ? `<section class="toc"><h2>Table of contents</h2><ol>${toc}</ol></section>`
      : ''
  }
  <section class="body">${body}</section>
  ${
    faqs
      ? `<section><h2>Frequently asked questions</h2>${faqs}</section>`
      : ''
  }
  ${
    refs
      ? `<section class="refs"><h2>References</h2><ol>${refs}</ol></section>`
      : ''
  }
</body></html>`;
}

function buildWhitepaperPrintHtml(
  blog: Blog,
  data: Partial<WhitepaperContentData>,
  project?: { domain?: string; company?: string },
): string {
  const cover = escapeHtml(data.cover_title || blog.title);
  const subtitle = escapeHtml(data.cover_subtitle ?? blog.meta_description);
  const date = new Date(blog.created_at || Date.now()).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
  const company = escapeHtml(project?.company ?? '');
  const exec = escapeHtml(data.executive_summary ?? '');
  const sections = (data.sections ?? [])
    .map(s => `<li><span class="sec-num">${String(s.number).padStart(2, '0')}</span> ${escapeHtml(s.title)}</li>`)
    .join('');
  const recs = (data.recommendations ?? [])
    .map((r, i) => `<li><span class="rec-num">${i + 1}</span><span>${escapeHtml(r)}</span></li>`)
    .join('');
  const refs = (data.references ?? [])
    .map((u, i) => `<li><span>[${i + 1}]</span> <a href="${escapeAttr(u)}">${escapeHtml(u)}</a></li>`)
    .join('');
  // Pre-process visual placeholders → inline HTML/SVG before line-by-line rendering
  const body = renderMarkdownToBookHtml(preprocessMarkdownForHtmlExport(blog.content, 'paper'));

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>${escapeHtml(blog.title)}</title>
<style>
  @page { size: A4; margin: 22mm 20mm 22mm 20mm; }
  body { font-family: ui-sans-serif, "Helvetica Neue", Arial, sans-serif; color: #111; line-height: 1.65; max-width: 760px; margin: 0 auto; padding: 32px; }
  h1 { font-size: 28pt; line-height: 1.15; margin: 0 0 6pt 0; letter-spacing: -0.5px; }
  h2 { font-size: 16pt; margin: 28pt 0 6pt 0; padding-bottom: 4pt; border-bottom: 1px solid #d6dde8; }
  h3 { font-size: 12pt; margin: 16pt 0 4pt 0; }
  p { margin: 0 0 10pt 0; }
  a { color: #1257c1; text-decoration: underline; }
  ul, ol { margin: 10pt 0 10pt 20pt; }
  table { width: 100%; border-collapse: collapse; margin: 12pt 0; font-size: 10pt; }
  th, td { border: 1px solid #d6dde8; padding: 6pt 8pt; text-align: left; }
  th { background: #eef3fb; }
  .cover { min-height: 70vh; display: flex; flex-direction: column; justify-content: center; padding: 48pt 24pt; page-break-after: always; border-bottom: 1px solid #d6dde8; }
  .cover .badge { font-family: ui-monospace, monospace; font-size: 10pt; letter-spacing: 0.16em; color: #1257c1; text-transform: uppercase; margin-bottom: 24pt; }
  .cover .subtitle { font-size: 13pt; color: #44546a; margin-top: 12pt; max-width: 600px; }
  .cover .meta-row { display: flex; gap: 24pt; margin-top: 36pt; font-family: ui-monospace, monospace; font-size: 9pt; letter-spacing: 0.12em; color: #44546a; text-transform: uppercase; }
  .exec { background: #eef3fb; border-left: 4px solid #1257c1; padding: 16pt 18pt; margin: 24pt 0; }
  .exec h2 { margin: 0 0 8pt 0; border: none; padding: 0; font-size: 12pt; letter-spacing: 0.12em; text-transform: uppercase; color: #1257c1; }
  .toc-box { padding: 12pt 16pt; border: 1px solid #d6dde8; margin: 24pt 0; }
  .toc-box ol { list-style: none; padding: 0; margin: 0; }
  .toc-box li { display: flex; gap: 12pt; padding: 4pt 0; }
  .sec-num { font-family: ui-monospace, monospace; font-size: 10pt; color: #1257c1; min-width: 28pt; }
  .recs ol { list-style: none; padding: 0; }
  .recs li { display: flex; gap: 12pt; padding: 8pt 0; border-bottom: 1px dotted #d6dde8; }
  .rec-num { background: #1257c1; color: #fff; border-radius: 50%; width: 22pt; height: 22pt; min-width: 22pt; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10pt; }
  .refs { font-size: 10pt; color: #44546a; }
  .refs li { padding: 3pt 0; }
  .refs a { word-break: break-all; }
  @media print { a { color: #111; text-decoration: none; } }
</style>
</head><body>
  <section class="cover">
    <div class="badge">Whitepaper${company ? ` · ${company}` : ''}</div>
    <h1>${cover}</h1>
    ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
    <div class="meta-row">
      <span>Published · ${escapeHtml(date)}</span>
      ${data.industry ? `<span>Industry · ${escapeHtml(data.industry)}</span>` : ''}
      ${data.technical_depth ? `<span>Depth · ${escapeHtml(data.technical_depth)}</span>` : ''}
    </div>
    ${printPublisherRibbon(project, "paper")}
  </section>
  ${
    exec
      ? `<section class="exec"><h2>Executive summary</h2><p>${exec}</p></section>`
      : ''
  }
  ${
    sections
      ? `<section class="toc-box"><h2 style="border:none;padding:0;font-size:12pt;letter-spacing:.12em;text-transform:uppercase;color:#1257c1;">Sections</h2><ol>${sections}</ol></section>`
      : ''
  }
  <section class="body">${body}</section>
  ${
    recs
      ? `<section class="recs"><h2>Recommendations</h2><ol>${recs}</ol></section>`
      : ''
  }
  ${
    refs
      ? `<section class="refs"><h2>References</h2><ol>${refs}</ol></section>`
      : ''
  }
</body></html>`;
}

// ─── LinkedIn helpers ──────────────────────────────────────────────────────

function buildCarouselSlides(
  hook: string,
  body: string,
  cta: string,
  hashtags: string[],
): Array<{ index: number; type: string; heading: string; body: string }> {
  const slides: Array<{ index: number; type: string; heading: string; body: string }> = [];
  slides.push({ index: 1, type: 'cover', heading: hook || 'Untitled', body: '' });

  const paragraphs = body
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  paragraphs.forEach((p, i) => {
    // Pull a short heading from the paragraph's first sentence (≤ 8 words).
    const firstSentence = p.split(/(?<=\.|\?|!)\s/)[0] ?? p;
    const heading = firstSentence.split(/\s+/).slice(0, 8).join(' ');
    slides.push({ index: i + 2, type: 'content', heading, body: p });
  });

  if (cta) {
    slides.push({ index: slides.length + 1, type: 'cta', heading: 'Your move', body: cta });
  }
  if (hashtags.length) {
    slides.push({
      index: slides.length + 1,
      type: 'hashtags',
      heading: 'Tags',
      body: hashtags.join('  '),
    });
  }
  return slides;
}

function buildXThread(hook: string, body: string, cta: string, hashtags: string[]): string[] {
  const TWEET_LIMIT = 270; // leave room for the "i/N" prefix the exporter adds
  const tweets: string[] = [];

  // First tweet — hook + first body paragraph if it fits.
  const firstParagraph = body.split(/\n{2,}/)[0]?.trim() ?? '';
  const firstCandidate = `${hook}\n\n${firstParagraph}`.trim();
  tweets.push(...chunkText(firstCandidate || hook || 'Thread:', TWEET_LIMIT));

  // Remaining body, packed greedily.
  const rest = body.split(/\n{2,}/).slice(1).join('\n\n').trim();
  if (rest) tweets.push(...chunkText(rest, TWEET_LIMIT));

  if (cta) tweets.push(...chunkText(cta, TWEET_LIMIT));
  if (hashtags.length) tweets.push(hashtags.join(' '));
  return tweets;
}

function chunkText(text: string, limit: number): string[] {
  if (!text.trim()) return [];
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let buf = '';
  for (const w of words) {
    const next = buf ? `${buf} ${w}` : w;
    if (next.length > limit) {
      if (buf) chunks.push(buf);
      buf = w;
    } else {
      buf = next;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

// ─── Markdown utilities ────────────────────────────────────────────────────

function splitMarkdownByH2(markdown: string): Array<{ title: string; body: string }> {
  const lines = markdown.split('\n');
  const out: Array<{ title: string; body: string }> = [];
  let current: { title: string; body: string } | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (current) out.push(current);
      current = { title: m[1].replace(/^Chapter\s+\d+\s*[—-]\s*/i, ''), body: '' };
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  if (current) out.push(current);
  if (out.length === 0) {
    out.push({ title: 'Body', body: markdown });
  }
  return out;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractExecSummary(markdown: string): string | null {
  const match = markdown.match(/##\s*executive summary\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
  if (!match) return null;
  return stripMarkdown(match[1]).slice(0, 1500);
}

/**
 * Tiny block-level Markdown → HTML for the print windows. Reuses the same
 * conservative subset as `lib/export.ts#renderMarkdownToHtml` but inlined
 * here so the print doc stays self-contained.
 */
function renderMarkdownToBookHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  const closeLists = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { closeLists(); i++; continue; }

    // Fenced code block or YouTube block.
    if (line.startsWith('```')) {
      closeLists();
      if (line === '```youtube') {
        i++;
        let url = '';
        if (i < lines.length) {
          url = lines[i].trim();
          i++;
        }
        if (i < lines.length && lines[i].trim() === '```') {
          i++;
        }
        const videoId = extractYouTubeId(url);
        if (videoId) {
          out.push(
            `<div class="youtube-container" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1.55em 0;border-radius:8px;border:1px solid #eee;">` +
            `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>` +
            `</div>`
          );
        } else {
          out.push(`<p><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></p>`);
        }
        continue;
      } else {
        const buf: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          buf.push(lines[i]);
          i++;
        }
        i++;
        out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
        continue;
      }
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeLists();
      const level = Math.min(heading[1].length, 4);
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith('> ')) {
      closeLists();
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        buf.push(lines[i].trim().slice(2));
        i++;
      }
      out.push(`<blockquote>${renderInline(buf.join(' '))}</blockquote>`);
      continue;
    }
    const ulItem = line.match(/^[-*+]\s+(.+)$/);
    if (ulItem) {
      if (!inUl) { closeLists(); out.push('<ul>'); inUl = true; }
      out.push(`<li>${renderInline(ulItem[1])}</li>`);
      i++;
      continue;
    }
    const olItem = line.match(/^\d+\.\s+(.+)$/);
    if (olItem) {
      if (!inOl) { closeLists(); out.push('<ol>'); inOl = true; }
      out.push(`<li>${renderInline(olItem[1])}</li>`);
      i++;
      continue;
    }
    closeLists();
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>\s|[-*+]\s|\d+\.\s|```)/.test(lines[i].trim())) {
      buf.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${renderInline(buf.join(' '))}</p>`);
  }
  closeLists();
  return out.join('\n');
}

function renderInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, anchor, href) => `<a href="${escapeAttr(href)}">${escapeHtml(anchor)}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E');
}
