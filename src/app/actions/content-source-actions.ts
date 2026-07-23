'use server';

import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { extensionOf } from '@/lib/import-content';
import {
  CONTENT_SOURCES_BUCKET,
  ensureContentSourcesBucket,
  deleteContentSourceFile,
} from '@/lib/server/content-source-storage';

/** Uploads accepted for knowledge sources — same set the importer parses. */
const ALLOWED_EXT = ['pdf', 'docx', 'txt', 'text', 'md', 'markdown'];
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

export interface ContentSourceDTO {
  id: string;
  title: string;
  kind: 'file' | 'link';
  originalFilename: string | null;
  fileSizeBytes: number | null;
  sourceUrl: string | null;
  citeUrl: string | null;
  scope: 'always' | 'optional';
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error: string;
  chunkCount: number;
  createdAt: string;
}

interface SourceRow {
  id: string;
  title: string;
  kind: string;
  original_filename: string | null;
  file_size_bytes: number | null;
  source_url: string | null;
  cite_url: string | null;
  scope: string;
  status: string;
  error: string;
  chunk_count: number;
  created_at: string;
}

function toDTO(r: SourceRow): ContentSourceDTO {
  return {
    id: r.id,
    title: r.title,
    kind: (r.kind as 'file' | 'link') ?? 'file',
    originalFilename: r.original_filename,
    fileSizeBytes: r.file_size_bytes,
    sourceUrl: r.source_url,
    citeUrl: r.cite_url,
    scope: (r.scope as 'always' | 'optional') ?? 'optional',
    status: (r.status as ContentSourceDTO['status']) ?? 'pending',
    error: r.error ?? '',
    chunkCount: r.chunk_count ?? 0,
    createdAt: r.created_at,
  };
}

const SELECT =
  'id, title, kind, original_filename, file_size_bytes, source_url, cite_url, scope, status, error, chunk_count, created_at';

async function ensureOwner(
  projectId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: 'Not authenticated' };
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();
  if (error || !data) return { ok: false, error: 'Project not found' };
  return { ok: true, userId };
}

/** Resolve the owning project for a source id, checking ownership. */
async function ensureSourceOwner(
  sourceId: string,
): Promise<{ ok: true; userId: string; projectId: string; storagePath: string | null } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: 'Not authenticated' };
  const { data, error } = await supabaseAdmin
    .from('content_sources')
    .select('id, project_id, user_id, storage_path')
    .eq('id', sourceId)
    .single();
  if (error || !data) return { ok: false, error: 'Source not found' };
  if (data.user_id !== userId) return { ok: false, error: 'Not authorized' };
  return { ok: true, userId, projectId: data.project_id, storagePath: data.storage_path };
}

/** List a project's knowledge sources (newest first). */
export async function listContentSources(
  projectId: string,
): Promise<{ success: boolean; sources: ContentSourceDTO[]; error?: string }> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok) return { success: false, sources: [], error: owner.error };
  const { data, error } = await supabaseAdmin
    .from('content_sources')
    .select(SELECT)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) return { success: false, sources: [], error: error.message };
  return { success: true, sources: ((data as SourceRow[]) ?? []).map(toDTO) };
}

/** Sanitize a filename for use inside a storage path. */
function safeStorageName(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'upload';
}

export interface ContentSourceUploadTicket {
  sourceId: string;
  bucket: string;
  path: string;
  token: string;
}

/**
 * Begin a file upload. Validates the metadata, inserts a `pending` row, and
 * returns a Supabase signed upload URL so the client streams the bytes DIRECTLY
 * to storage — bypassing the Next.js server-action / proxy body-size limit
 * (which truncates large multipart forms). The client then calls
 * `finalizeContentSource` to kick off ingestion.
 */
export async function createContentSourceUpload(
  projectId: string,
  meta: { filename: string; fileSize: number; mimeType?: string; title?: string; citeUrl?: string; scope?: 'always' | 'optional' },
): Promise<{ success: boolean; ticket?: ContentSourceUploadTicket; error?: string }> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok) return { success: false, error: owner.error };

  const filename = (meta.filename || 'upload').trim();
  const ext = extensionOf(filename);
  if (!ALLOWED_EXT.includes(ext)) {
    return { success: false, error: 'Use a PDF, Word (.docx), text (.txt), or Markdown (.md) file.' };
  }
  if (!meta.fileSize || meta.fileSize <= 0) return { success: false, error: 'Empty file.' };
  if (meta.fileSize > MAX_BYTES) return { success: false, error: 'File too large (max 100 MB).' };

  const title = meta.title?.trim() || filename.replace(/\.[^.]+$/i, '');
  const citeUrl = normalizeUrl(meta.citeUrl || '');
  const scope = meta.scope === 'always' ? 'always' : 'optional';

  const { data: row, error: insErr } = await supabaseAdmin
    .from('content_sources')
    .insert({
      project_id: projectId,
      user_id: owner.userId,
      title,
      kind: 'file',
      original_filename: filename,
      file_size_bytes: meta.fileSize,
      mime_type: meta.mimeType || null,
      cite_url: citeUrl || null,
      scope,
      status: 'pending',
    })
    .select('id')
    .single();
  if (insErr || !row) return { success: false, error: insErr?.message ?? 'Could not create source.' };

  try {
    await ensureContentSourcesBucket();
    const path = `${projectId}/${row.id}/${safeStorageName(filename)}`;
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(CONTENT_SOURCES_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (signErr || !signed) throw new Error(signErr?.message ?? 'Could not create upload URL.');

    await supabaseAdmin.from('content_sources').update({ storage_path: path }).eq('id', row.id);
    return { success: true, ticket: { sourceId: row.id, bucket: CONTENT_SOURCES_BUCKET, path, token: signed.token } };
  } catch (e) {
    // Roll back the orphaned row so a failed start doesn't linger.
    await supabaseAdmin.from('content_sources').delete().eq('id', row.id);
    return { success: false, error: e instanceof Error ? e.message : 'Could not start upload.' };
  }
}

/**
 * Finalize a file upload after the client has streamed the bytes to storage:
 * confirm the object exists, then enqueue the durable ingest job. If the object
 * is missing (client upload failed/aborted), the row is removed.
 */
export async function finalizeContentSource(
  sourceId: string,
): Promise<{ success: boolean; error?: string }> {
  const owner = await ensureSourceOwner(sourceId);
  if (!owner.ok) return { success: false, error: owner.error };
  if (!owner.storagePath) return { success: false, error: 'No file was uploaded.' };

  // Confirm the uploaded object is actually present.
  const slash = owner.storagePath.lastIndexOf('/');
  const dir = slash >= 0 ? owner.storagePath.slice(0, slash) : '';
  const name = slash >= 0 ? owner.storagePath.slice(slash + 1) : owner.storagePath;
  const { data: listed } = await supabaseAdmin.storage
    .from(CONTENT_SOURCES_BUCKET)
    .list(dir, { search: name, limit: 1 });
  if (!listed?.length) {
    await supabaseAdmin.from('content_sources').delete().eq('id', sourceId);
    return { success: false, error: 'Upload did not complete. Please try again.' };
  }

  await enqueueJob({
    type: 'content_source_ingest',
    projectId: owner.projectId,
    userId: owner.userId,
    payload: { sourceId, projectId: owner.projectId },
    idempotencyKey: `content_source_ingest:${sourceId}`,
  });
  return { success: true };
}

/** Discard a half-started upload row (client upload failed before finalize). */
export async function abortContentSource(sourceId: string): Promise<void> {
  const owner = await ensureSourceOwner(sourceId);
  if (!owner.ok) return;
  if (owner.storagePath) await deleteContentSourceFile(owner.storagePath);
  await supabaseAdmin.from('content_sources').delete().eq('id', sourceId);
}

/**
 * Add a link knowledge source (a reference URL we scrape). Inserts a `pending`
 * row and enqueues ingestion (scrape → chunk → embed).
 */
export async function addLinkContentSource(
  projectId: string,
  input: { url: string; title?: string; citeUrl?: string; scope?: 'always' | 'optional' },
): Promise<{ success: boolean; sourceId?: string; error?: string }> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok) return { success: false, error: owner.error };

  const url = normalizeUrl(input.url || '');
  if (!url) return { success: false, error: 'Enter a valid URL (http/https).' };

  const { data: row, error: insErr } = await supabaseAdmin
    .from('content_sources')
    .insert({
      project_id: projectId,
      user_id: owner.userId,
      title: input.title?.trim() || url,
      kind: 'link',
      source_url: url,
      // Default the interlink target to the source URL itself for links.
      cite_url: normalizeUrl(input.citeUrl || '') || url,
      scope: input.scope === 'always' ? 'always' : 'optional',
      status: 'pending',
    })
    .select('id')
    .single();
  if (insErr || !row) return { success: false, error: insErr?.message ?? 'Could not create source.' };

  await enqueueJob({
    type: 'content_source_ingest',
    projectId,
    userId: owner.userId,
    payload: { sourceId: row.id, projectId },
    idempotencyKey: `content_source_ingest:${row.id}`,
  });

  return { success: true, sourceId: row.id };
}

/** Toggle a source between 'always' (every blog) and 'optional' (pick per blog). */
export async function updateContentSourceScope(
  sourceId: string,
  scope: 'always' | 'optional',
): Promise<{ success: boolean; error?: string }> {
  const owner = await ensureSourceOwner(sourceId);
  if (!owner.ok) return { success: false, error: owner.error };
  const { error } = await supabaseAdmin
    .from('content_sources')
    .update({ scope, updated_at: new Date().toISOString() })
    .eq('id', sourceId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Delete a source (its stored file, chunks cascade via FK, then the row). */
export async function deleteContentSource(
  sourceId: string,
): Promise<{ success: boolean; error?: string }> {
  const owner = await ensureSourceOwner(sourceId);
  if (!owner.ok) return { success: false, error: owner.error };
  if (owner.storagePath) await deleteContentSourceFile(owner.storagePath);
  const { error } = await supabaseAdmin.from('content_sources').delete().eq('id', sourceId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Re-run ingestion for a failed source. */
export async function retryContentSource(
  sourceId: string,
): Promise<{ success: boolean; error?: string }> {
  const owner = await ensureSourceOwner(sourceId);
  if (!owner.ok) return { success: false, error: owner.error };
  await supabaseAdmin
    .from('content_sources')
    .update({ status: 'pending', error: '', updated_at: new Date().toISOString() })
    .eq('id', sourceId);
  await enqueueJob({
    type: 'content_source_ingest',
    projectId: owner.projectId,
    userId: owner.userId,
    payload: { sourceId, projectId: owner.projectId },
    idempotencyKey: `content_source_ingest:${sourceId}:retry:${Date.now()}`,
  });
  return { success: true };
}

/** Normalize a user-entered URL; returns '' if not a valid http(s) URL. */
function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.toString();
  } catch {
    return '';
  }
}
