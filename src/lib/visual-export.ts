/**
 * Visual placeholder → export format conversions.
 *
 * Handles <!-- VISUAL_PLACEHOLDER type="..." title="..." desc="..." data="..." source="..." -->
 * comments in ebook/whitepaper markdown bodies for every export path:
 *
 *   PDF / HTML  →  inline SVG charts + HTML tables     (full fidelity)
 *   DOCX        →  markdown pipe tables (comparison) + styled text blocks (charts)
 *   Text / TXT  →  description text + raw data
 *   Markdown    →  unchanged (comments stay as-is, they're valid HTML comments)
 */

// ── Attribute parsing ────────────────────────────────────────────────────────

export interface VisualAttrs {
  type: string;
  title: string;
  desc: string;
  data: string;
  source: string;
}

function parseAttrs(attrStr: string): VisualAttrs {
  const get = (key: string) => {
    const m = new RegExp(`${key}="([^"]*)"`, 'i').exec(attrStr);
    return m ? m[1] : '';
  };
  return {
    type:   get('type')   || 'infographic',
    title:  get('title')  || '',
    desc:   get('desc')   || '',
    data:   get('data')   || '',
    source: get('source') || '',
  };
}

const PLACEHOLDER_RE = () => /<!--\s*VISUAL_PLACEHOLDER\s+([\s\S]*?)-->/g;

// ── Heuristic data parsers ────────────────────────────────────────────────────

/**
 * Parse "Header: val1 | val2 | val3. Header2: val1 | val2 | val3" format
 * into structured table data.
 */
function parseComparisonTable(raw: string): {
  columns: string[];
  rows: { label: string; values: string[] }[];
} | null {
  // Split on ". " followed by a capital letter (next group), or on "\n"
  const segments = raw.split(/(?:\.\s+)(?=[A-Z])|\n/).filter(Boolean);
  const entries: { header: string; values: string[] }[] = [];

  for (const seg of segments) {
    const colonIdx = seg.indexOf(':');
    if (colonIdx === -1) continue;
    const header = seg.slice(0, colonIdx).trim();
    const valStr  = seg.slice(colonIdx + 1);
    const values  = valStr.split('|').map(v => v.replace(/\.$/, '').trim()).filter(Boolean);
    if (header.length > 0 && header.length < 45 && values.length > 0) {
      entries.push({ header, values });
    }
  }

  if (entries.length < 2) return null;

  const [first, ...rest] = entries;
  const columns  = [first.header, ...rest.map(e => e.header)];
  const rowCount = first.values.length;
  const rows     = first.values.map((label, i) => ({
    label,
    values: rest.map(e => e.values[i] ?? '—'),
  }));

  return { columns, rows };
}

/** Extract simple numeric stat blocks from raw text. */
function parseInfographicStats(raw: string): { value: string; label: string }[] {
  const stats: { value: string; label: string }[] = [];
  // Pattern: "Nx" or "N%" or "N days" at the start of a segment
  const NUM_RE = /(\d+(?:\.\d+)?[xX%]|\d+(?:\.\d+)?\s*(?:days?|hrs?|hours?|times?|fold)?)\s+([^\n.,;]+)/g;
  let m: RegExpExecArray | null;
  while ((m = NUM_RE.exec(raw)) !== null) {
    const val   = m[1].trim();
    const label = m[2].trim().slice(0, 50);
    if (label.length > 3) stats.push({ value: val, label });
  }
  if (stats.length === 0) {
    // Fallback: use sentences as text items
    raw.split(/[.;]\s+/).slice(0, 6).forEach(s => {
      const trimmed = s.trim();
      if (trimmed.length > 6) stats.push({ value: '•', label: trimmed.slice(0, 60) });
    });
  }
  return stats.slice(0, 9);
}

/** Extract label:value pairs for bar charts. */
function parseBarData(raw: string): { labels: string[]; values: number[]; unit: string } {
  const items: { label: string; value: number; unit: string }[] = [];
  // "label: Nx" or "label: N%" patterns
  const RE = /([^:,;.]+):\s*(\d+(?:\.\d+)?)\s*(%|x|X)?/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(raw)) !== null) {
    const label = m[1].trim();
    if (label.length > 40) continue;
    items.push({ label, value: parseFloat(m[2]), unit: m[3] ?? '' });
  }
  return {
    labels: items.map(it => it.label.slice(0, 18)),
    values: items.map(it => it.value),
    unit: items[0]?.unit ?? '',
  };
}

/** Extract steps from process descriptions. */
function parseProcessSteps(raw: string): { number: number; title: string; description: string }[] {
  const steps: { number: number; title: string; description: string }[] = [];
  // "1. Title: desc" or "Step 1: title - desc"
  const NUM_STEP = /(?:Step\s+)?(\d+)[.:]\s+([^\n:]+)(?:[:—-]\s*([^\n]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = NUM_STEP.exec(raw)) !== null) {
    steps.push({
      number: parseInt(m[1]),
      title: m[2].trim().slice(0, 60),
      description: (m[3] ?? '').trim().slice(0, 120),
    });
  }
  if (steps.length === 0) {
    // Fallback: sentences as steps
    raw.split(/[.;]\s+/).forEach((s, i) => {
      const trimmed = s.trim();
      if (trimmed.length > 6) steps.push({ number: i + 1, title: trimmed.slice(0, 60), description: '' });
    });
  }
  return steps.slice(0, 10);
}

// ── SVG chart generators (pure strings, print-safe) ───────────────────────────

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function niceMax(v: number) {
  if (v === 0) return 10;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / e) * e;
}

function svgBarChart(
  labels: string[],
  values: number[],
  unit: string,
  colors: string[],
): string {
  if (labels.length === 0) return '';
  const W = 500, H = 220;
  const PAD = { top: 20, right: 16, bottom: 50, left: 50 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...values, 1));
  const slot = cW / labels.length;
  const barW = Math.min(slot * 0.58, 44);
  let out = '';

  // Grid
  [0, 0.5, 1].forEach(t => {
    const y = PAD.top + cH * (1 - t);
    out += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + cW}" y2="${y}" stroke="#ccc" stroke-width="${t === 0 ? 1.5 : 0.5}"/>`;
    out += `<text x="${PAD.left - 4}" y="${y + 4}" font-size="9" text-anchor="end" fill="#666">${(max * t).toFixed(max < 10 ? 1 : 0)}${unit}</text>`;
  });

  // Bars
  labels.forEach((lbl, i) => {
    const v = values[i] ?? 0;
    const bh = Math.max((v / max) * cH, 1);
    const x  = PAD.left + slot * i + (slot - barW) / 2;
    const y  = PAD.top + cH - bh;
    const c  = colors[i % colors.length];
    const sl = lbl.length > 14 ? lbl.slice(0, 13) + '…' : lbl;
    out += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${c}" rx="2"/>`;
    out += `<text x="${x + barW / 2}" y="${y - 4}" font-size="9" text-anchor="middle" fill="#333" font-weight="600">${v}${unit}</text>`;
    out += `<text x="${x + barW / 2}" y="${PAD.top + cH + 14}" font-size="8" text-anchor="middle" fill="#555">${esc(sl)}</text>`;
  });

  // Axes
  out += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + cH}" stroke="#888" stroke-width="1.5"/>`;
  out += `<line x1="${PAD.left}" y1="${PAD.top + cH}" x2="${PAD.left + cW}" y2="${PAD.top + cH}" stroke="#888" stroke-width="1.5"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;display:block;" role="img" aria-label="${esc(labels.join(', '))}">${out}</svg>`;
}

function svgPieChart(
  slices: { label: string; value: number }[],
  unit: string,
  colors: string[],
): string {
  if (slices.length === 0) return '';
  const W = 400, H = 220, cx = 100, cy = 110, r = 88;

  function polar(deg: number) {
    const a = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }
  function arcPath(startDeg: number, endDeg: number) {
    const s = polar(endDeg);
    const e = polar(startDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M${cx},${cy} L${s.x.toFixed(1)},${s.y.toFixed(1)} A${r},${r} 0 ${large},0 ${e.x.toFixed(1)},${e.y.toFixed(1)} Z`;
  }

  const total = slices.reduce((s, sl) => s + sl.value, 0) || 1;
  let cursor = 0;
  let svgParts = '';

  slices.forEach((sl, i) => {
    const span = (sl.value / total) * 360;
    const path = arcPath(cursor, cursor + span);
    cursor += span;
    svgParts += `<path d="${path}" fill="${colors[i % colors.length]}" stroke="white" stroke-width="1.5"/>`;
  });

  // Legend
  slices.forEach((sl, i) => {
    const pct = ((sl.value / total) * 100).toFixed(0);
    const ly = 20 + i * 22;
    svgParts += `<rect x="${cx + r + 20}" y="${ly}" width="10" height="10" rx="2" fill="${colors[i % colors.length]}"/>`;
    svgParts += `<text x="${cx + r + 34}" y="${ly + 9}" font-size="10" fill="#333">${esc(sl.label.slice(0, 22))} (${pct}${unit || '%'})</text>`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;display:block;" role="img">${svgParts}</svg>`;
}

// ── HTML renderers ─────────────────────────────────────────────────────────────

function htmlComparisonTable(
  attrs: VisualAttrs,
  variant: 'ebook' | 'paper',
): string {
  const parsed = parseComparisonTable(attrs.data);
  const borderColor = variant === 'ebook' ? '#c1b59a' : '#d6dde8';
  const headBg      = variant === 'ebook' ? '#f1ede5' : '#eef3fb';
  const accentText  = variant === 'ebook' ? '#534a3c' : '#1257c1';
  const altBg       = variant === 'ebook' ? '#f8f4eb' : '#f7f9fc';

  if (!parsed || parsed.columns.length === 0) {
    // Fallback: render raw data as a quote block
    return `<div style="border-left:3px solid ${borderColor};padding:8pt 14pt;margin:14pt 0;background:${headBg};font-size:10pt;color:#444;font-style:italic">${esc(attrs.desc || attrs.data)}</div>`;
  }

  const colCount = parsed.columns.length;
  const colWidth = Math.floor(100 / colCount);

  let html = `<table style="width:100%;border-collapse:collapse;font-size:10pt;margin:12pt 0">`;

  // Header
  html += `<thead><tr>`;
  parsed.columns.forEach((col, ci) => {
    html += `<th style="border:1px solid ${borderColor};padding:5pt 8pt;text-align:left;background:${headBg};color:${ci === 0 ? accentText : '#111'};font-weight:700;width:${colWidth}%">${esc(col)}</th>`;
  });
  html += `</tr></thead>`;

  // Rows
  html += `<tbody>`;
  parsed.rows.forEach((row, ri) => {
    const bg = ri % 2 === 1 ? altBg : 'transparent';
    html += `<tr style="background:${bg}">`;
    html += `<td style="border:1px solid ${borderColor};padding:5pt 8pt;font-weight:600;color:${accentText}">${esc(row.label)}</td>`;
    row.values.forEach(val => {
      html += `<td style="border:1px solid ${borderColor};padding:5pt 8pt;color:#222">${esc(val)}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  return html;
}

function htmlBarChart(attrs: VisualAttrs, variant: 'ebook' | 'paper'): string {
  const parsed = parseBarData(attrs.data);
  const colors = variant === 'ebook'
    ? ['#8B5E3C', '#1E40AF', '#166534', '#6D28D9', '#9D174D']
    : ['#1257C1', '#15803D', '#92400E', '#7C3AED', '#BE185D'];

  if (parsed.labels.length < 2) {
    return htmlFallbackBox(attrs, variant);
  }
  return svgBarChart(parsed.labels, parsed.values, parsed.unit, colors);
}

function htmlPieChart(attrs: VisualAttrs, variant: 'ebook' | 'paper'): string {
  const parsed = parseBarData(attrs.data);
  const colors = variant === 'ebook'
    ? ['#8B5E3C', '#1E40AF', '#166534', '#6D28D9', '#9D174D']
    : ['#1257C1', '#15803D', '#92400E', '#7C3AED', '#BE185D'];

  if (parsed.labels.length < 2) {
    return htmlFallbackBox(attrs, variant);
  }
  const slices = parsed.labels.map((label, i) => ({ label, value: parsed.values[i] ?? 0 }));
  return svgPieChart(slices, parsed.unit, colors);
}

function htmlInfographic(attrs: VisualAttrs, variant: 'ebook' | 'paper'): string {
  const stats = parseInfographicStats(attrs.data || attrs.desc);
  if (stats.length === 0) return htmlFallbackBox(attrs, variant);

  const colors = variant === 'ebook'
    ? ['#8B5E3C', '#1E40AF', '#166534', '#6D28D9']
    : ['#1257C1', '#15803D', '#92400E', '#7C3AED'];

  const cols = stats.length <= 2 ? stats.length : stats.length <= 4 ? 2 : 3;
  const cellWidth = Math.floor(100 / cols);

  let html = `<table style="width:100%;border-collapse:separate;border-spacing:6pt;margin:10pt 0;table-layout:fixed">`;
  html += `<tbody><tr>`;

  stats.forEach((stat, i) => {
    if (i > 0 && i % cols === 0) html += `</tr><tr>`;
    const color = colors[i % colors.length];
    html += `<td style="text-align:center;padding:10pt;border:1px solid ${color}40;background:${color}10;border-radius:4pt;width:${cellWidth}%">`;
    html += `<div style="font-size:24pt;font-weight:800;color:${color};line-height:1">${esc(stat.value)}</div>`;
    html += `<div style="font-size:9pt;color:#444;margin-top:4pt;line-height:1.4">${esc(stat.label)}</div>`;
    html += `</td>`;
  });

  // Fill empty cells if needed
  const remainder = stats.length % cols;
  if (remainder !== 0) {
    for (let k = 0; k < cols - remainder; k++) {
      html += `<td style="width:${cellWidth}%"></td>`;
    }
  }

  html += `</tr></tbody></table>`;
  return html;
}

function htmlProcessDiagram(attrs: VisualAttrs, variant: 'ebook' | 'paper'): string {
  const steps = parseProcessSteps(attrs.data || attrs.desc);
  if (steps.length === 0) return htmlFallbackBox(attrs, variant);

  const accent = variant === 'ebook' ? '#8B5E3C' : '#1257C1';
  let html = `<div style="margin:10pt 0">`;

  steps.forEach((step, i) => {
    const isLast = i === steps.length - 1;
    html += `<div style="display:flex;gap:10pt;margin-bottom:${isLast ? '0' : '8pt'}">`;
    html += `<div style="flex-shrink:0;width:22pt;height:22pt;border-radius:50%;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-size:10pt;font-weight:700">${step.number}</div>`;
    html += `<div style="padding-top:3pt">`;
    html += `<div style="font-weight:700;font-size:10pt;color:#111">${esc(step.title)}</div>`;
    if (step.description) {
      html += `<div style="font-size:9pt;color:#555;margin-top:2pt">${esc(step.description)}</div>`;
    }
    html += `</div></div>`;
  });

  html += `</div>`;
  return html;
}

function htmlBenchmarkScorecard(attrs: VisualAttrs, variant: 'ebook' | 'paper'): string {
  const accent = variant === 'ebook' ? '#8B5E3C' : '#1257C1';
  const borderColor = variant === 'ebook' ? '#c1b59a' : '#d6dde8';

  // Parse "Metric: value" pairs (reuse bar parser as structure is similar)
  const parsed = parseBarData(attrs.data);
  if (parsed.labels.length === 0) return htmlFallbackBox(attrs, variant);

  const maxVal = Math.max(...parsed.values, 100);
  let html = `<div style="margin:10pt 0;border:1px solid ${borderColor};border-radius:4pt;overflow:hidden">`;

  parsed.labels.forEach((label, i) => {
    const v = parsed.values[i] ?? 0;
    const pct = Math.min(100, (v / maxVal) * 100);
    const bg = i % 2 === 0 ? '#fff' : (variant === 'ebook' ? '#faf7f2' : '#f7f9fc');
    html += `<div style="padding:7pt 10pt;border-bottom:1px solid ${borderColor};background:${bg}">`;
    html += `<div style="display:flex;justify-content:space-between;margin-bottom:4pt">`;
    html += `<span style="font-size:10pt;font-weight:600;color:#111">${esc(label)}</span>`;
    html += `<span style="font-size:10pt;font-weight:700;color:${accent}">${v}${parsed.unit}</span>`;
    html += `</div>`;
    html += `<div style="background:#e5e5e5;height:5pt;border-radius:3pt;overflow:hidden">`;
    html += `<div style="background:${accent};width:${pct}%;height:100%"></div>`;
    html += `</div></div>`;
  });

  html += `</div>`;
  return html;
}

function htmlRiskMatrix(attrs: VisualAttrs, variant: 'ebook' | 'paper'): string {
  const borderColor = variant === 'ebook' ? '#c1b59a' : '#d6dde8';
  const headBg      = variant === 'ebook' ? '#f1ede5' : '#eef3fb';
  const accentText  = variant === 'ebook' ? '#534a3c' : '#1257c1';

  // Try to extract risks from raw data
  const riskRE = /([^:]+):\s*(Low|Medium|High)\s+likelihood[,\s]+([^,.]+)/gi;
  const risks: { name: string; likelihood: string; impact: string }[] = [];
  let m: RegExpExecArray | null;

  // Fallback: treat as descriptive and render as table
  // Use simpler extraction — just find key:value pairs
  const lines = (attrs.data || attrs.desc).split(/[.;]\s+/);
  lines.forEach((line, i) => {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 40) {
      risks.push({
        name: line.slice(0, colonIdx).trim(),
        likelihood: 'Medium',
        impact: 'Medium',
      });
    } else if (line.trim().length > 6) {
      risks.push({
        name: line.trim().slice(0, 50),
        likelihood: 'Medium',
        impact: 'Medium',
      });
    }
  });

  if (risks.length === 0) return htmlFallbackBox(attrs, variant);

  let html = `<table style="width:100%;border-collapse:collapse;font-size:10pt;margin:10pt 0">`;
  html += `<thead><tr>`;
  html += `<th style="border:1px solid ${borderColor};padding:5pt 8pt;background:${headBg};color:${accentText}">Risk</th>`;
  html += `<th style="border:1px solid ${borderColor};padding:5pt 8pt;background:${headBg};color:${accentText};width:22%">Likelihood</th>`;
  html += `<th style="border:1px solid ${borderColor};padding:5pt 8pt;background:${headBg};color:${accentText};width:22%">Impact</th>`;
  html += `</tr></thead><tbody>`;

  risks.forEach((r, i) => {
    const bg = i % 2 === 1 ? (variant === 'ebook' ? '#faf7f2' : '#f7f9fc') : 'transparent';
    html += `<tr style="background:${bg}">`;
    html += `<td style="border:1px solid ${borderColor};padding:5pt 8pt;color:#222">${esc(r.name)}</td>`;
    html += `<td style="border:1px solid ${borderColor};padding:5pt 8pt;text-align:center;color:#555">${esc(r.likelihood)}</td>`;
    html += `<td style="border:1px solid ${borderColor};padding:5pt 8pt;text-align:center;color:#555">${esc(r.impact)}</td>`;
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  return html;
}

function htmlFallbackBox(attrs: VisualAttrs, variant: 'ebook' | 'paper'): string {
  const borderColor = variant === 'ebook' ? '#c1b59a' : '#d6dde8';
  const bg          = variant === 'ebook' ? '#faf7f2' : '#f0f4fa';
  const text        = attrs.desc || attrs.data || '';
  return `<div style="border:1px solid ${borderColor};background:${bg};padding:8pt 12pt;margin:10pt 0;border-radius:3pt;font-size:10pt;color:#444">${text ? esc(text) : '(Visual not available in this export)'}</div>`;
}

const VISUAL_TYPE_LABELS_EXPORT: Record<string, string> = {
  'infographic': 'Infographic',
  'bar-chart': 'Bar Chart',
  'line-chart': 'Line Chart',
  'pie-chart': 'Pie Chart',
  'process-diagram': 'Process Diagram',
  'comparison-table': 'Comparison Table',
  'benchmark-scorecard': 'Benchmark Scorecard',
  'risk-matrix': 'Risk Matrix',
};

// ── Main HTML renderer ────────────────────────────────────────────────────────

export function renderVisualToHtml(attrs: VisualAttrs, variant: 'ebook' | 'paper'): string {
  const typeLabel   = VISUAL_TYPE_LABELS_EXPORT[attrs.type] ?? attrs.type;
  const borderColor = variant === 'ebook' ? '#c1b59a' : '#d6dde8';
  const headBg      = variant === 'ebook' ? '#f1ede5' : '#eef3fb';
  const labelColor  = variant === 'ebook' ? '#6b6253' : '#44546a';
  const accentColor = variant === 'ebook' ? '#534a3c' : '#1257c1';

  let bodyHtml: string;
  switch (attrs.type) {
    case 'comparison-table':
      bodyHtml = htmlComparisonTable(attrs, variant);
      break;
    case 'bar-chart':
      bodyHtml = htmlBarChart(attrs, variant);
      break;
    case 'pie-chart':
      bodyHtml = htmlPieChart(attrs, variant);
      break;
    case 'infographic':
      bodyHtml = htmlInfographic(attrs, variant);
      break;
    case 'process-diagram':
      bodyHtml = htmlProcessDiagram(attrs, variant);
      break;
    case 'benchmark-scorecard':
      bodyHtml = htmlBenchmarkScorecard(attrs, variant);
      break;
    case 'risk-matrix':
      bodyHtml = htmlRiskMatrix(attrs, variant);
      break;
    default:
      bodyHtml = htmlFallbackBox(attrs, variant);
  }

  const titleBar = attrs.title
    ? `<div style="display:flex;align-items:center;gap:8pt;padding:6pt 10pt;border-bottom:1px solid ${borderColor};background:${headBg}">
        <span style="font-family:ui-monospace,monospace;font-size:8pt;letter-spacing:.1em;text-transform:uppercase;color:${labelColor};background:${borderColor};padding:1pt 5pt;border-radius:2pt">${esc(typeLabel)}</span>
        <span style="font-size:11pt;font-weight:700;color:#111">${esc(attrs.title)}</span>
       </div>`
    : '';

  const descBar = attrs.desc && attrs.type !== 'comparison-table'
    ? `<div style="font-size:9.5pt;color:#555;padding:5pt 10pt 0">${esc(attrs.desc)}</div>`
    : '';

  const sourceBar = attrs.source
    ? `<div style="font-family:ui-monospace,monospace;font-size:8pt;color:${labelColor};padding:4pt 10pt;border-top:1px solid ${borderColor}">Source: ${esc(attrs.source)}</div>`
    : '';

  return `<div style="border:1px solid ${borderColor};border-radius:4pt;margin:14pt 0;overflow:hidden;page-break-inside:avoid">
  ${titleBar}
  ${descBar}
  <div style="padding:8pt 10pt">${bodyHtml}</div>
  ${sourceBar}
</div>`;
}

// ── Pre-processors ────────────────────────────────────────────────────────────

/**
 * For PDF and HTML exports.
 * Replaces <!-- VISUAL_PLACEHOLDER --> comments with rendered HTML/SVG.
 * Works on the raw markdown string BEFORE line-by-line parsing so the
 * multi-line comments are replaced with single-line HTML blocks.
 */
export function preprocessMarkdownForHtmlExport(
  markdown: string,
  variant: 'ebook' | 'paper',
): string {
  return markdown.replace(PLACEHOLDER_RE(), (_match, attrStr) => {
    const attrs = parseAttrs(attrStr);
    // Insert rendered HTML wrapped in a sentinel div.
    // The line parser will emit this as-is once it hits the opening tag.
    return `\n\n${renderVisualToHtml(attrs, variant)}\n\n`;
  });
}

/**
 * For DOCX export.
 * - comparison-table  → markdown pipe table (docx parser renders natively)
 * - infographic       → bold header + bullet stats
 * - process-diagram   → numbered markdown list
 * - bar-chart/charts  → bold callout + raw data as blockquote
 * - others            → descriptive blockquote
 */
export function preprocessMarkdownForDocx(markdown: string): string {
  return markdown.replace(PLACEHOLDER_RE(), (_match, attrStr) => {
    const attrs = parseAttrs(attrStr);
    const typeLabel = VISUAL_TYPE_LABELS_EXPORT[attrs.type] ?? attrs.type;

    if (attrs.type === 'comparison-table') {
      const parsed = parseComparisonTable(attrs.data);
      if (parsed && parsed.columns.length >= 2) {
        const header = `| ${parsed.columns.join(' | ')} |`;
        const sep    = `| ${parsed.columns.map(() => '---').join(' | ')} |`;
        const rows   = parsed.rows
          .map(r => `| ${r.label} | ${r.values.join(' | ')} |`)
          .join('\n');
        return `\n\n**${attrs.title || typeLabel}**\n\n${header}\n${sep}\n${rows}\n\n`;
      }
    }

    if (attrs.type === 'infographic') {
      const stats = parseInfographicStats(attrs.data || attrs.desc);
      if (stats.length > 0) {
        const bullets = stats.map(s => `- **${s.value}** — ${s.label}`).join('\n');
        return `\n\n**${attrs.title || typeLabel}**\n\n${bullets}\n\n`;
      }
    }

    if (attrs.type === 'process-diagram') {
      const steps = parseProcessSteps(attrs.data || attrs.desc);
      if (steps.length > 0) {
        const lines = steps.map(s =>
          s.description ? `${s.number}. **${s.title}** — ${s.description}` : `${s.number}. ${s.title}`
        ).join('\n');
        return `\n\n**${attrs.title || typeLabel}**\n\n${lines}\n\n`;
      }
    }

    if (attrs.type === 'bar-chart' || attrs.type === 'line-chart' || attrs.type === 'pie-chart') {
      const parsed = parseBarData(attrs.data);
      if (parsed.labels.length > 0) {
        const bullets = parsed.labels
          .map((lbl, i) => `- ${lbl}: **${parsed.values[i]}${parsed.unit}**`)
          .join('\n');
        return `\n\n**${attrs.title || typeLabel}**${attrs.desc ? `\n\n*${attrs.desc}*` : ''}\n\n${bullets}\n\n`;
      }
    }

    if (attrs.type === 'benchmark-scorecard') {
      const parsed = parseBarData(attrs.data);
      if (parsed.labels.length > 0) {
        const bullets = parsed.labels
          .map((lbl, i) => `- ${lbl}: **${parsed.values[i]}${parsed.unit}**`)
          .join('\n');
        return `\n\n**${attrs.title || typeLabel}**\n\n${bullets}\n\n`;
      }
    }

    // Generic fallback: descriptive block
    const desc = attrs.desc || attrs.data || '';
    return desc
      ? `\n\n> **${attrs.title || typeLabel}**: ${desc}${attrs.source ? ` *(Source: ${attrs.source})*` : ''}\n\n`
      : '';
  });
}

/**
 * For plain text and chapters-txt exports.
 * Replaces placeholder comments with a brief text description.
 */
export function stripVisualPlaceholders(markdown: string): string {
  return markdown.replace(PLACEHOLDER_RE(), (_match, attrStr) => {
    const attrs = parseAttrs(attrStr);
    const typeLabel = VISUAL_TYPE_LABELS_EXPORT[attrs.type] ?? attrs.type;
    const parts = [
      `[${typeLabel.toUpperCase()}: ${attrs.title || '(visual)'}]`,
      attrs.desc || '',
      attrs.source ? `Source: ${attrs.source}` : '',
    ].filter(Boolean);
    return `\n\n${parts.join('\n')}\n\n`;
  });
}
