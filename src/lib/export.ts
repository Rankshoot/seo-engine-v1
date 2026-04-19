import { Blog } from './types';

export function exportToMarkdown(blog: Blog): Blob {
  const frontmatter = `---
title: "${blog.title}"
slug: "${blog.slug}"
target_keyword: "${blog.target_keyword}"
meta_description: "${blog.meta_description}"
article_type: "${blog.article_type}"
word_count: ${blog.word_count}
date: "${blog.created_at.split('T')[0]}"
---\n\n`;

  return new Blob([frontmatter + blog.content], { type: 'text/markdown' });
}

export function exportToHTML(blog: Blog): Blob {
  const md = blog.content;
  const body = md
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '\n')
    .split('\n')
    .map(line => {
      if (/^<(h[1-6]|li|ul|ol)/.test(line)) return line;
      if (line.trim() === '') return '';
      return `<p>${line}</p>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(blog.title)}</title>
  <meta name="description" content="${escapeHTML(blog.meta_description)}">
  <style>
    body{font-family:Georgia,'Times New Roman',serif;max-width:800px;margin:0 auto;padding:40px 20px;line-height:1.75;color:#1a1a1a;background:#fff}
    h1{font-size:2.2em;line-height:1.25;margin-bottom:.5em}
    h2{font-size:1.55em;margin-top:2.25em;margin-bottom:.6em;border-bottom:1px solid #eee;padding-bottom:.25em}
    h3{font-size:1.25em;margin-top:1.6em}
    h4{font-size:1.05em;margin-top:1.2em}
    p{margin:1em 0}
    ul,ol{margin:1em 0;padding-left:2em}
    li{margin:.5em 0}
    strong{font-weight:700}
    .meta-bar{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;margin-bottom:2em;font-size:.85em;color:#555;font-family:system-ui,sans-serif}
  </style>
</head>
<body>
  <div class="meta-bar">
    <strong>Keyword:</strong> ${escapeHTML(blog.target_keyword)} &nbsp;|&nbsp;
    <strong>Type:</strong> ${escapeHTML(blog.article_type)} &nbsp;|&nbsp;
    <strong>Words:</strong> ${blog.word_count} &nbsp;|&nbsp;
    <strong>Slug:</strong> /${escapeHTML(blog.slug)}
  </div>
  ${body}
</body>
</html>`;

  return new Blob([html], { type: 'text/html' });
}

export function exportToText(blog: Blog): Blob {
  const stripped = blog.content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^- /gm, '• ');

  const header = [
    `TITLE: ${blog.title}`,
    `KEYWORD: ${blog.target_keyword}`,
    `TYPE: ${blog.article_type}`,
    `SLUG: ${blog.slug}`,
    `META: ${blog.meta_description}`,
    `WORDS: ${blog.word_count}`,
    '='.repeat(60),
    '',
    '',
  ].join('\n');

  return new Blob([header + stripped], { type: 'text/plain' });
}

export async function exportToDocx(blog: Blog): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

  const children: InstanceType<typeof Paragraph>[] = [];

  // Meta header paragraph
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Keyword: ${blog.target_keyword}  |  Type: ${blog.article_type}  |  Words: ${blog.word_count}`, color: '777777', size: 18 }),
      ],
    }),
    new Paragraph({ text: '' })
  );

  for (const line of blog.content.split('\n')) {
    if (!line.trim()) {
      children.push(new Paragraph({ text: '' }));
      continue;
    }

    const headingMap: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
      '# ': HeadingLevel.HEADING_1,
      '## ': HeadingLevel.HEADING_2,
      '### ': HeadingLevel.HEADING_3,
      '#### ': HeadingLevel.HEADING_4,
    };

    let matched = false;
    for (const [prefix, level] of Object.entries(headingMap)) {
      if (line.startsWith(prefix)) {
        children.push(new Paragraph({ text: line.slice(prefix.length), heading: level }));
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (line.startsWith('- ') || line.startsWith('• ')) {
      const text = line.replace(/^[-•] /, '').replace(/\*\*(.+?)\*\*/g, '$1');
      children.push(new Paragraph({ text, bullet: { level: 0 } }));
      continue;
    }

    // Handle inline bold
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    if (parts.length > 1) {
      children.push(
        new Paragraph({
          children: parts.map(p =>
            p.startsWith('**') && p.endsWith('**')
              ? new TextRun({ text: p.slice(2, -2), bold: true })
              : new TextRun({ text: p })
          ),
        })
      );
    } else {
      children.push(new Paragraph({ text: line }));
    }
  }

  // Meta description footer
  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [new TextRun({ text: `Meta: ${blog.meta_description}`, italics: true, color: '777777', size: 18 })],
    })
  );

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBlob(doc);
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

function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
