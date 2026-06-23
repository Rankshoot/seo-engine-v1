import { Blog, ExportFormat } from './types';
import { EXPORT_FILE_INFO, safeFilename } from './blog-content';
import { buildBlogSchemas, type ProjectMeta } from './schema';
import { displayDomain } from './studio-brand';

export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/\/embed\/([^/?#]+)/);
      if (m) return m[1];
      const shorts = u.pathname.match(/\/shorts\/([^/?#]+)/);
      if (shorts) return shorts[1];
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id || null;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

function cleanMarkdownForExport(markdown: string): string {
  return markdown.replace(/!\[([^\]]*)\]\(data:image\/([a-zA-Z+]+);base64,([^)]+)\)/g, (match, alt, mimeSubtype) => {
    const ext = mimeSubtype === 'jpeg' ? 'jpg' : mimeSubtype;
    const safeName = alt ? safeFilename(alt) : 'image';
    return `![${alt}](${safeName}.${ext})`;
  });
}

// ─── Public API ────────────────────────────────────────────────────────────

export function exportToMarkdown(blog: Blog, projectMeta?: ProjectMeta): Blob {
  const orgBlock =
    projectMeta?.company?.trim() ?
      `organization: "${escapeYaml(projectMeta.company.trim())}"
publisher_domain: "${escapeYaml(displayDomain(projectMeta.domain ?? ''))}"
`
    : '';
  const frontmatter = `---
title: "${escapeYaml(blog.title)}"
slug: "${blog.slug}"
target_keyword: "${escapeYaml(blog.target_keyword)}"
meta_description: "${escapeYaml(blog.meta_description)}"
article_type: "${escapeYaml(blog.article_type)}"
word_count: ${blog.word_count}
date: "${blog.created_at.split('T')[0]}"
${orgBlock}---

`;

  const { article, faq } = buildBlogSchemas(blog, projectMeta);
  const schemaBlock = [
    `\n\n<!-- STRUCTURED DATA — paste into your CMS template's <head> -->`,
    `<!-- Article Schema -->`,
    `<!-- <script type="application/ld+json">`,
    JSON.stringify(article, null, 2),
    `</script> -->`,
    faq
      ? [
          `<!-- FAQPage Schema -->`,
          `<!-- <script type="application/ld+json">`,
          JSON.stringify(faq, null, 2),
          `</script> -->`,
        ].join('\n')
      : '',
    `<!-- END STRUCTURED DATA -->`,
  ]
    .filter(Boolean)
    .join('\n');

  return new Blob([frontmatter + cleanMarkdownForExport(blog.content) + schemaBlock], {
    type: EXPORT_FILE_INFO.markdown.mime,
  });
}

export function exportToHTML(blog: Blog, projectMeta?: ProjectMeta): Blob {
  const body = renderMarkdownToHtml(blog.content);

  const { article, faq } = buildBlogSchemas(blog, projectMeta);
  const articleScript = `<script type="application/ld+json">\n${JSON.stringify(article, null, 2)}\n</script>`;
  const faqScript = faq ? `<script type="application/ld+json">\n${JSON.stringify(faq, null, 2)}\n</script>` : '';

  const publisherRow =
    projectMeta?.company?.trim() ?
      `<div><strong>Publisher:</strong> ${escapeHTML(projectMeta.company.trim())}${
        projectMeta.domain?.trim()
          ? ` &nbsp;|&nbsp; <a href="${escapeHTML(`https://${displayDomain(projectMeta.domain)}`)}">${escapeHTML(displayDomain(projectMeta.domain))}</a>`
          : ''
      }</div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(blog.title)}</title>
  <meta name="description" content="${escapeHTML(blog.meta_description)}">
  ${articleScript}
  ${faqScript}
  <style>
    body{font-family:Georgia,'Times New Roman',serif;max-width:800px;margin:0 auto;padding:40px 20px;line-height:1.75;color:#1a1a1a;background:#fff}
    h1{font-size:2.2em;line-height:1.25;margin-bottom:.5em}
    h2{font-size:1.55em;margin-top:2.25em;margin-bottom:.6em;border-bottom:1px solid #eee;padding-bottom:.25em}
    h3{font-size:1.25em;margin-top:1.6em}
    h4{font-size:1.05em;margin-top:1.2em}
    p{margin:1em 0}
    a{color:#1863dc;text-decoration:underline}
    a:hover{color:#0c4eb4}
    ul,ol{margin:1em 0;padding-left:2em}
    li{margin:.5em 0}
    strong{font-weight:700}
    em{font-style:italic}
    img{max-width:100%;height:auto;display:block;margin:1.5em auto;border-radius:8px}
    figure{margin:1.75em 0;text-align:center}
    figcaption{font-size:.85em;color:#666;margin-top:.5em}
    blockquote{border-left:3px solid #ccc;margin:1.5em 0;padding:.25em 1em;color:#555;font-style:italic}
    code{background:#f3f3f3;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:.92em}
    pre{background:#f3f3f3;border-radius:6px;padding:1em;overflow:auto;font-family:monospace;font-size:.92em}
    pre code{background:transparent;padding:0}
    hr{border:none;border-top:1px solid #e0e0e0;margin:2.5em 0}
    table{width:100%;border-collapse:collapse;margin:1.5em 0;font-size:.95em}
    th,td{border:1px solid #e0e0e0;padding:.5em .75em;text-align:left;vertical-align:top}
    th{background:#f8f8f8;font-weight:600}
    .meta-bar{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;margin-bottom:2em;font-size:.85em;color:#555;font-family:system-ui,sans-serif}
  </style>
</head>
<body>
  <div class="meta-bar">
    <strong>Keyword:</strong> ${escapeHTML(blog.target_keyword)} &nbsp;|&nbsp;
    <strong>Type:</strong> ${escapeHTML(blog.article_type)} &nbsp;|&nbsp;
    <strong>Words:</strong> ${blog.word_count} &nbsp;|&nbsp;
    <strong>Slug:</strong> /${escapeHTML(blog.slug)}
    ${publisherRow}
  </div>
${body}
</body>
</html>`;

  return new Blob([html], { type: EXPORT_FILE_INFO.html.mime });
}

export function exportToText(
  blog: Blog,
  opts?: { publisherLine?: string },
): Blob {
  const stripped = blog.content
    // Drop image markdown — they make no sense in plain text.
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    // Inline links → "text (url)" so the URL is still readable.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
    // Internal/relative links → just the text.
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^- /gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lines = [
    `TITLE: ${blog.title}`,
    `KEYWORD: ${blog.target_keyword}`,
    `TYPE: ${blog.article_type}`,
    `SLUG: ${blog.slug}`,
    `META: ${blog.meta_description}`,
    `WORDS: ${blog.word_count}`,
  ];
  if (opts?.publisherLine?.trim()) {
    lines.push(opts.publisherLine.trim());
  }
  lines.push("=".repeat(60), "", "");
  const header = lines.join("\n");

  return new Blob([header + stripped], { type: EXPORT_FILE_INFO.txt.mime });
}

export async function exportToDocx(blog: Blog): Promise<Blob> {
  const {
    Document, Packer, Paragraph, TextRun, ImageRun,
    HeadingLevel, ExternalHyperlink, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle,
  } = await import('docx');

  type ParagraphInstance = InstanceType<typeof Paragraph>;
  type TableInstance = InstanceType<typeof Table>;
  const children: Array<ParagraphInstance | TableInstance> = [];

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Keyword: ${blog.target_keyword}  |  Type: ${blog.article_type}  |  Words: ${blog.word_count}`,
          color: '777777',
          size: 18,
        }),
      ],
    }),
    new Paragraph({ text: '' })
  );

  // Cache image fetches so the same data: URL doesn't get decoded twice.
  const imageCache = new Map<string, Uint8Array>();

  const lines = blog.content.split('\n');
  let i = 0;
  let inYoutubeBlock = false;
  let youtubeUrl = '';

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      children.push(new Paragraph({ text: '' }));
      i++;
      continue;
    }

    // YouTube block detector: ```youtube
    if (line === '```youtube') {
      inYoutubeBlock = true;
      youtubeUrl = '';
      i++;
      continue;
    }

    if (inYoutubeBlock) {
      if (line === '```') {
        inYoutubeBlock = false;
        // Emit YouTube block in DOCX
        if (youtubeUrl) {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "📺 YouTube Video: ", bold: true, color: "FF0000" }),
                new ExternalHyperlink({
                  link: youtubeUrl,
                  children: [new TextRun({ text: youtubeUrl, color: "1863DC", underline: {} })],
                })
              ],
            })
          );
          children.push(new Paragraph({ text: '' }));
        }
        i++;
        continue;
      }
      youtubeUrl = line;
      i++;
      continue;
    }

    // Fenced code block detector (other than youtube)
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      // Render code block in DOCX with Consolas font and background shading
      for (const codeLine of codeLines) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: codeLine,
                font: 'Consolas',
                size: 18,
                color: '333333',
              }),
            ],
            shading: {
              fill: 'F5F5F5',
            },
          })
        );
      }
      children.push(new Paragraph({ text: '' }));
      continue;
    }

    // Horizontal Rule: ---, ***, ___
    if (/^(---|\*\*\*|___)$/.test(line)) {
      children.push(
        new Paragraph({
          border: {
            bottom: {
              color: 'D3D3D3',
              space: 4,
              style: BorderStyle.SINGLE,
              size: 6,
            },
          },
        })
      );
      i++;
      continue;
    }

    // Pipe table — at least 2 lines (header + separator).
    if (
      line.startsWith('|') &&
      i + 1 < lines.length &&
      /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1].trim())
    ) {
      const headerCells = splitPipes(line);
      const rowsData: string[][] = [];
      i += 2; // skip header and separator
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rowsData.push(splitPipes(lines[i].trim()));
        i++;
      }

      // Build the docx Table
      const tableRows: InstanceType<typeof TableRow>[] = [];

      // 1. Header row
      tableRows.push(
        new TableRow({
          children: headerCells.map(cellText => {
            return new TableCell({
              children: [
                new Paragraph({
                  children: buildInlineRuns(cellText, TextRun, ExternalHyperlink),
                }),
              ],
              shading: {
                fill: 'F2F2F2', // subtle gray header background
              },
              margins: {
                top: 120, // 6pt cell padding
                bottom: 120,
                left: 150, // 7.5pt cell padding
                right: 150,
              },
            });
          }),
        })
      );

      // 2. Data rows
      for (const rowData of rowsData) {
        tableRows.push(
          new TableRow({
            children: rowData.map(cellText => {
              return new TableCell({
                children: [
                  new Paragraph({
                    children: buildInlineRuns(cellText, TextRun, ExternalHyperlink),
                  }),
                ],
                margins: {
                  top: 120,
                  bottom: 120,
                  left: 150,
                  right: 150,
                },
              });
            }),
          })
        );
      }

      const docxTable = new Table({
        rows: tableRows,
        width: {
          size: 100,
          type: WidthType.PERCENTAGE,
        },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: 'D3D3D3' },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D3D3D3' },
          left: { style: BorderStyle.SINGLE, size: 4, color: 'D3D3D3' },
          right: { style: BorderStyle.SINGLE, size: 4, color: 'D3D3D3' },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E6E6E6' },
          insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E6E6E6' },
        },
      });

      children.push(docxTable as any);
      children.push(new Paragraph({ text: '' })); // Spacer after table
      continue;
    }

    // Image-only line — embed as a centered ImageRun if we can decode it.
    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      const alt = imageMatch[1];
      const url = imageMatch[2].trim();
      const bytes = await loadImageBytes(url, imageCache);
      if (bytes) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                type: detectImageType(url),
                data: bytes,
                transformation: { width: 600, height: 338 },
              }),
            ],
          })
        );
        if (alt) {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: alt, italics: true, color: '777777', size: 18 }),
              ],
            })
          );
        }
      }
      i++;
      continue;
    }

    const headingMap: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
      '# ': HeadingLevel.HEADING_1,
      '## ': HeadingLevel.HEADING_2,
      '### ': HeadingLevel.HEADING_3,
      '#### ': HeadingLevel.HEADING_4,
    };

    let matchedHeading = false;
    for (const [prefix, level] of Object.entries(headingMap)) {
      if (line.startsWith(prefix)) {
        children.push(
          new Paragraph({
            heading: level,
            children: buildInlineRuns(line.slice(prefix.length), TextRun, ExternalHyperlink),
          })
        );
        matchedHeading = true;
        break;
      }
    }
    if (matchedHeading) {
      i++;
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('• ') || /^\d+\.\s/.test(line)) {
      const stripped = line.replace(/^(?:[-•]\s|\d+\.\s)/, '');
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: buildInlineRuns(stripped, TextRun, ExternalHyperlink),
        })
      );
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line.slice(2), italics: true, color: '555555' })],
        })
      );
      i++;
      continue;
    }

    children.push(
      new Paragraph({
        children: buildInlineRuns(line, TextRun, ExternalHyperlink),
      })
    );
    i++;
  }

  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: `Meta: ${blog.meta_description}`, italics: true, color: '777777', size: 18 }),
      ],
    })
  );

  const doc = new Document({
    styles: {
      default: {
        heading1: {
          run: {
            font: "Arial",
            size: 32, // 16pt
            bold: true,
            color: "111111",
          },
          paragraph: {
            spacing: { before: 360, after: 120 },
          },
        },
        heading2: {
          run: {
            font: "Arial",
            size: 26, // 13pt
            bold: true,
            color: "222222",
          },
          paragraph: {
            spacing: { before: 300, after: 100 },
          },
        },
        heading3: {
          run: {
            font: "Arial",
            size: 22, // 11pt
            bold: true,
            color: "333333",
          },
          paragraph: {
            spacing: { before: 240, after: 80 },
          },
        },
        heading4: {
          run: {
            font: "Arial",
            size: 20, // 10pt
            bold: true,
            color: "444444",
          },
          paragraph: {
            spacing: { before: 180, after: 60 },
          },
        },
        document: {
          run: {
            font: "Arial",
            size: 22, // 11pt
            color: "2A2A2A",
          },
          paragraph: {
            spacing: { line: 280, after: 140 }, // 1.15 line spacing, 7pt space after paragraphs
          },
        },
      },
    },
    sections: [{ properties: {}, children }],
  });

  return Packer.toBlob(doc);
}

/**
 * Trigger a browser download for a blob. The filename is sanitized through
 * `safeFilename` so a Title with slashes/colons can't break the OS save
 * dialog. The extension is forced to match the format. Returns the final
 * filename for diagnostic logging.
 */
export function triggerBlogDownload(blob: Blob, blog: Blog, format: ExportFormat): string {
  const info = EXPORT_FILE_INFO[format];
  const base = safeFilename(blog.slug || blog.title || blog.target_keyword);
  const filename = `${base}.${info.ext}`;
  triggerDownload(blob, filename);
  return filename;
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Markdown → HTML ───────────────────────────────────────────────────────

/**
 * Conservative block-level Markdown → HTML converter. We don't pull in a
 * full markdown library because the generator already produces clean,
 * predictable subsets — we just need headings, paragraphs, lists, links,
 * images, blockquotes, code, hr, and tables to render properly in the
 * downloaded `.html` file.
 */
function renderMarkdownToHtml(markdown: string): string {
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
    const raw = lines[i];
    const line = raw.trim();

    // Blank line → flush lists.
    if (!line) {
      closeLists();
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^(---|\*\*\*|___)$/.test(line)) {
      closeLists();
      out.push('<hr>');
      i++;
      continue;
    }

    // Heading.
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    // Standalone image — render as a <figure> so the alt text becomes a
    // caption in the downloaded HTML.
    const standaloneImage = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (standaloneImage) {
      closeLists();
      const alt = escapeHTML(standaloneImage[1]);
      const src = escapeAttr(standaloneImage[2]);
      out.push(
        `<figure><img src="${src}" alt="${alt}" loading="lazy">${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`
      );
      i++;
      continue;
    }

    // Blockquote.
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

    // YouTube fenced block: ```youtube\nURL\n```
    if (line === '```youtube') {
      closeLists();
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
        out.push(`<p><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(url)}</a></p>`);
      }
      continue;
    }

    // Fenced code block.
    if (line.startsWith('```')) {
      closeLists();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push(`<pre><code>${escapeHTML(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // Unordered list item.
    const ulItem = line.match(/^[-*+]\s+(.+)$/);
    if (ulItem) {
      if (!inUl) { closeLists(); out.push('<ul>'); inUl = true; }
      out.push(`<li>${renderInline(ulItem[1])}</li>`);
      i++;
      continue;
    }

    // Ordered list item.
    const olItem = line.match(/^\d+\.\s+(.+)$/);
    if (olItem) {
      if (!inOl) { closeLists(); out.push('<ol>'); inOl = true; }
      out.push(`<li>${renderInline(olItem[1])}</li>`);
      i++;
      continue;
    }

    // Pipe table — at least 2 lines (header + separator).
    if (
      line.startsWith('|') &&
      i + 1 < lines.length &&
      /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1].trim())
    ) {
      closeLists();
      const headerCells = splitPipes(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitPipes(lines[i].trim()));
        i++;
      }
      out.push('<table><thead><tr>');
      for (const cell of headerCells) out.push(`<th>${renderInline(cell)}</th>`);
      out.push('</tr></thead><tbody>');
      for (const row of rows) {
        out.push('<tr>');
        for (const cell of row) out.push(`<td>${renderInline(cell)}</td>`);
        out.push('</tr>');
      }
      out.push('</tbody></table>');
      continue;
    }

    // Default — accumulate into a paragraph until blank line / block start.
    closeLists();
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|>\s|---|\*\*\*|___|```|[-*+]\s|\d+\.\s|\|)/.test(lines[i].trim()) &&
      !/^!\[/.test(lines[i].trim())
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    const paragraphText = buf.join(' ');
    const pdfMatch = paragraphText.trim().match(/^\[([^\]]+)\]\(([^)\s]+\.pdf(?:[?#]\S*)?)\)$/i);
    if (pdfMatch) {
      const label = pdfMatch[1];
      const href = pdfMatch[2];
      out.push(`<div class="pdf-preview-container" style="margin: 2.5em 0; border: 1px solid #d0d0dc; border-radius: 16px; overflow: hidden; background: #f4f4f8; font-family: system-ui, -apple-system, sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
  <iframe src="${href}#toolbar=0&navpanes=0" style="width: 100%; height: 600px; border: none; display: block; background: #ececf2;" allowfullscreen></iframe>
  <div class="pdf-download-bar" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background: #ffffff; border-top: 1px solid #d0d0dc; gap: 16px; flex-wrap: wrap;">
    <span class="pdf-title" style="font-size: 14px; font-weight: 700; color: #ff7759; word-break: break-word;">${escapeHTML(label)}</span>
    <a href="${href}" download style="display: inline-flex; align-items: center; justify-content: center; background: #22252a; color: #ffffff; border: 1px solid #ff7759; padding: 8px 20px; border-radius: 9999px; font-size: 13px; font-weight: 600; text-decoration: none; transition: opacity 0.15s ease;">Download</a>
  </div>
</div>`);
    } else {
      out.push(`<p>${renderInline(paragraphText)}</p>`);
    }
  }

  closeLists();
  return out.join('\n');
}

/**
 * Render inline markdown (links, images, bold, italic, code) inside a
 * block-level container. We carefully escape ranges that aren't matched as
 * markdown so user-provided text can't break out of attributes.
 */
function renderInline(text: string): string {
  const tokens: { html: string }[] = [];
  let cursor = 0;
  // Order matters: image > link > code > bold > italic.
  const inlineRegex = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|__([^_]+)__|_([^_]+)_/g;

  let m: RegExpExecArray | null;
  while ((m = inlineRegex.exec(text)) !== null) {
    if (m.index > cursor) tokens.push({ html: escapeHTML(text.slice(cursor, m.index)) });

    if (m[2] !== undefined) {
      // Image: ![alt](src)
      tokens.push({
        html: `<img src="${escapeAttr(m[2])}" alt="${escapeHTML(m[1] ?? '')}" loading="lazy">`,
      });
    } else if (m[4] !== undefined) {
      // Link: [text](href)
      const href = escapeAttr(m[4]);
      const isExternal = /^https?:\/\//i.test(m[4]);
      tokens.push({
        html: `<a href="${href}"${isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''}>${renderInline(m[3])}</a>`,
      });
    } else if (m[5] !== undefined) {
      tokens.push({ html: `<code>${escapeHTML(m[5])}</code>` });
    } else if (m[6] !== undefined) {
      tokens.push({ html: `<strong>${renderInline(m[6])}</strong>` });
    } else if (m[7] !== undefined) {
      tokens.push({ html: `<em>${renderInline(m[7])}</em>` });
    } else if (m[8] !== undefined) {
      tokens.push({ html: `<strong>${renderInline(m[8])}</strong>` });
    } else if (m[9] !== undefined) {
      tokens.push({ html: `<em>${renderInline(m[9])}</em>` });
    }

    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) tokens.push({ html: escapeHTML(text.slice(cursor)) });
  return tokens.map(t => t.html).join('');
}

function splitPipes(row: string): string[] {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(c => c.trim());
}

// ─── DOCX inline builders ─────────────────────────────────────────────────

type DocxClasses = typeof import('docx');

function buildInlineRuns(
  text: string,
  TextRun: DocxClasses['TextRun'],
  ExternalHyperlink: DocxClasses['ExternalHyperlink']
): Array<InstanceType<DocxClasses['TextRun']> | InstanceType<DocxClasses['ExternalHyperlink']>> {
  const runs: Array<InstanceType<DocxClasses['TextRun']> | InstanceType<DocxClasses['ExternalHyperlink']>> = [];

  // Strip image markdown — images are emitted on their own paragraphs above.
  const cleaned = text.replace(/!\[[^\]]*\]\([^)]+\)/g, '');

  const linkRegex = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = linkRegex.exec(cleaned)) !== null) {
    if (m.index > cursor) {
      runs.push(...buildBoldItalicRuns(cleaned.slice(cursor, m.index), TextRun));
    }
    const anchor = m[1];
    const href = m[2];
    if (/^https?:\/\//i.test(href)) {
      runs.push(
        new ExternalHyperlink({
          link: href,
          children: [new TextRun({ text: anchor, color: '1863DC', underline: {} })],
        })
      );
    } else {
      // Internal/relative URLs aren't clickable in DOCX without a real
      // target — render the anchor text only.
      runs.push(new TextRun({ text: anchor }));
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < cleaned.length) {
    runs.push(...buildBoldItalicRuns(cleaned.slice(cursor), TextRun));
  }
  return runs;
}

function buildBoldItalicRuns(
  text: string,
  TextRun: DocxClasses['TextRun']
): Array<InstanceType<DocxClasses['TextRun']>> {
  const out: Array<InstanceType<DocxClasses['TextRun']>> = [];
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > cursor) out.push(new TextRun({ text: text.slice(cursor, m.index) }));
    if (m[1] !== undefined) out.push(new TextRun({ text: m[1], bold: true }));
    else if (m[2] !== undefined) out.push(new TextRun({ text: m[2], italics: true }));
    else if (m[3] !== undefined) out.push(new TextRun({ text: m[3], font: 'Consolas' }));
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) out.push(new TextRun({ text: text.slice(cursor) }));
  return out;
}

async function loadImageBytes(
  url: string,
  cache: Map<string, Uint8Array>
): Promise<Uint8Array | null> {
  if (cache.has(url)) return cache.get(url)!;
  try {
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',');
      if (comma === -1) return null;
      const meta = url.slice(0, comma);
      const payload = url.slice(comma + 1);
      const isB64 = meta.includes(';base64');
      const bytes = isB64
        ? base64ToBytes(payload)
        : new TextEncoder().encode(decodeURIComponent(payload));
      cache.set(url, bytes);
      return bytes;
    }
    if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      cache.set(url, buf);
      return buf;
    }
    return null;
  } catch {
    return null;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/\s+/g, '');
  if (typeof atob === 'function') {
    const bin = atob(cleaned);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Server-side fallback (used only if the helper ever runs in Node).
  return new Uint8Array(Buffer.from(cleaned, 'base64'));
}

function detectImageType(url: string): 'png' | 'jpg' | 'gif' | 'bmp' {
  // docx@9 only accepts these four types for `ImageRun`. SVG would need a
  // raster fallback we don't carry, so we map it (and webp) to png — Word
  // can decode the bytes regardless of the declared marker.
  const lc = url.toLowerCase();
  if (lc.startsWith('data:image/jpeg') || lc.startsWith('data:image/jpg')) return 'jpg';
  if (lc.startsWith('data:image/gif')) return 'gif';
  if (lc.startsWith('data:image/bmp')) return 'bmp';
  if (lc.endsWith('.jpg') || lc.endsWith('.jpeg')) return 'jpg';
  if (lc.endsWith('.gif')) return 'gif';
  if (lc.endsWith('.bmp')) return 'bmp';
  return 'png';
}

// ─── Escape helpers ────────────────────────────────────────────────────────

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E');
}

function escapeYaml(str: string): string {
  return (str ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
