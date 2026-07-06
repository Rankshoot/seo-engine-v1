'use server';

import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { geminiGenerate } from '@/lib/gemini';
import {
  sanitizeBlogContent,
  stripEmptyFragmentAnchorTags,
  countWordsInMarkdown,
} from '@/lib/blog-content';
import {
  bytesToMarkdown,
  extractTitleFromMarkdown,
  slugFromTitle,
  extensionOf,
} from '@/lib/import-content';

export interface ImportContentTraceEntry {
  label: string;
  ok: boolean;
  detail?: string;
}

const IMPORT_MAX_BYTES = 4 * 1024 * 1024;

async function inferSeoFieldsFromContent(
  markdown: string,
  project: { company: string; niche: string; domain: string }
): Promise<{ target_keyword: string; meta_description: string }> {
  const head = markdown.slice(0, 4500);
  const prompt = `Read this article draft and return ONLY compact JSON (no markdown fences) with exactly two string keys:
"target_keyword": the single best 3–8 word Google search query this page should rank for (no quotes inside the value).
"meta_description": 150–165 characters, compelling SERP snippet, must include the target_keyword phrase naturally.

Company: ${project.company}
Niche: ${project.niche}
Site: ${project.domain}

ARTICLE (markdown, may start with # title):
${head}`;

  const raw = (await geminiGenerate(prompt, 2, false)).trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const j = JSON.parse(cleaned) as { target_keyword?: string; meta_description?: string };
    const target_keyword = (j.target_keyword ?? '').trim() || 'imported content';
    let meta_description = (j.meta_description ?? '').trim();
    if (meta_description.length > 165) meta_description = meta_description.slice(0, 162).trimEnd() + '…';
    if (meta_description.length < 120) {
      const plain = head.replace(/^#{1,6}\s+/gm, '').replace(/\[[^\]]+\]\([^)]+\)/g, '$1').slice(0, 300);
      meta_description = plain.replace(/\s+/g, ' ').trim().slice(0, 160);
    }
    return { target_keyword, meta_description };
  } catch {
    const plain = head.replace(/^#{1,6}\s+/gm, '').replace(/\[[^\]]+\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
    return {
      target_keyword: 'imported content',
      meta_description: plain.slice(0, 160),
    };
  }
}

async function persistImportedMarkdown(
  projectId: string,
  project: { company: string; niche: string; domain: string },
  rawMarkdown: string,
  titleFilenameHint: string,
  trace: ImportContentTraceEntry[],
  parseLabel: string,
  parseDetail: string
): Promise<{ success: boolean; error?: string; blogId?: string; trace: ImportContentTraceEntry[] }> {
  trace.push({ label: parseLabel, ok: true, detail: parseDetail });

  let markdown = stripEmptyFragmentAnchorTags(rawMarkdown.replace(/\r\n/g, '\n').trim());
  const title = extractTitleFromMarkdown(markdown, titleFilenameHint);

  const sanitized = await sanitizeBlogContent(markdown, { ownDomain: project.domain ?? '' });
  markdown = sanitized.content;
  trace.push({
    label: 'sanitize_blog_content',
    ok: true,
    detail: `external ${sanitized.externalLinks.length} · internal ${sanitized.internalLinks.length}`,
  });

  const { target_keyword, meta_description } = await inferSeoFieldsFromContent(markdown, {
    company: project.company ?? '',
    niche: project.niche ?? '',
    domain: project.domain ?? '',
  });
  trace.push({ label: 'gemini_import_meta', ok: true, detail: `kw: ${target_keyword.slice(0, 40)}` });

  const slug = slugFromTitle(title);
  const wc = countWordsInMarkdown(markdown);

  const { data: row, error: insErr } = await supabaseAdmin
    .from('blogs')
    .insert({
      entry_id: null,
      project_id: projectId,
      title,
      content: markdown,
      meta_description,
      word_count: wc,
      target_keyword,
      article_type: 'Import',
      slug,
      status: 'generated',
      research_sources: 0,
      external_links: sanitized.externalLinks,
      internal_links: sanitized.internalLinks,
    })
    .select('id')
    .single();

  if (insErr || !row) {
    trace.push({ label: 'persist_blog', ok: false, detail: insErr?.message });
    return { success: false, error: insErr?.message ?? 'Could not save imported article.', trace };
  }

  trace.push({ label: 'persist_blog', ok: true, detail: row.id });
  return { success: true, blogId: row.id, trace };
}

/**
 * Parse an uploaded article or pasted markdown/text, run the same link sanitizer as generated blogs,
 * infer keyword + meta with Gemini, persist as `blogs` with no calendar row, and return the id for redirect.
 */
export async function importUploadedArticle(
  projectId: string,
  formData: FormData
): Promise<{
  success: boolean;
  error?: string;
  blogId?: string;
  trace?: ImportContentTraceEntry[];
}> {
  const trace: ImportContentTraceEntry[] = [];
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', trace };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) return { success: false, error: 'Project not found', trace };

  const pastedRaw = formData.get('pasted_text');
  const pasted = typeof pastedRaw === 'string' ? pastedRaw.trim() : '';

  try {
    if (pasted.length > 0) {
      const bytes = Buffer.byteLength(pasted, 'utf8');
      if (bytes > IMPORT_MAX_BYTES) {
        return { success: false, error: 'Pasted text is too large (max 4 MB).', trace };
      }
      return await persistImportedMarkdown(
        projectId,
        project,
        pasted,
        'pasted-draft.md',
        trace,
        'parse_paste',
        'clipboard / textarea → markdown'
      );
    }

    const file = formData.get('file');
    if (!(file instanceof File) || !file.size) {
      return { success: false, error: 'Choose a file or paste your article text.', trace };
    }

    const filename = file.name || 'upload';
    const ext = extensionOf(filename);
    if (!['md', 'markdown', 'txt', 'text', 'docx'].includes(ext)) {
      return {
        success: false,
        error: 'Use .md, .txt, or .docx.',
        trace: [{ label: 'validate_extension', ok: false, detail: ext }],
      };
    }

    if (file.size > IMPORT_MAX_BYTES) {
      return { success: false, error: 'File too large (max 4 MB).', trace };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rawMd = await bytesToMarkdown(buffer, filename);
    return await persistImportedMarkdown(
      projectId,
      project,
      rawMd,
      filename,
      trace,
      'parse_file',
      `${ext} → markdown`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    trace.push({ label: 'import_upload', ok: false, detail: msg });
    return { success: false, error: msg, trace };
  }
}
