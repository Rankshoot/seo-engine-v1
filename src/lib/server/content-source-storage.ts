import { supabaseAdmin } from "@/lib/supabase";

/**
 * Storage for user-uploaded knowledge sources (industry reports, whitepapers,
 * reference docs). This bucket is PRIVATE — the raw files may be proprietary and
 * must never be publicly fetchable (unlike the public `blog-images` bucket). We
 * only ever read the bytes back server-side during ingestion.
 */
export const CONTENT_SOURCES_BUCKET = "content-sources";

/**
 * Lazily ensure the private content-sources bucket exists (idempotent).
 *
 * We deliberately DON'T set a per-bucket `fileSizeLimit` here: Supabase rejects
 * a bucket limit that exceeds the project's global upload limit (50 MB by
 * default), which would make bucket creation fail and leave uploads with
 * nowhere to go. Size is enforced by the upload action instead. The effective
 * ceiling for large files is the project's global "Upload file size limit"
 * (Dashboard → Storage → Settings) — raise it to ≥100 MB there.
 */
export async function ensureContentSourcesBucket(): Promise<void> {
  const { data: existing } = await supabaseAdmin.storage.getBucket(CONTENT_SOURCES_BUCKET);
  if (existing) return;
  const { error } = await supabaseAdmin.storage.createBucket(CONTENT_SOURCES_BUCKET, {
    public: false,
  });
  // Ignore a race where another request created it first; surface anything else.
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Could not create the knowledge-sources bucket: ${error.message}`);
  }
}

/**
 * Upload raw source bytes under a per-project path. Returns the storage path
 * (not a public URL — this bucket is private) or throws on failure.
 */
export async function putContentSourceFile(
  projectId: string,
  sourceId: string,
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  await ensureContentSourcesBucket();
  // Keep the original extension so download + parsing can infer the format.
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80) || "upload";
  const path = `${projectId}/${sourceId}/${safeName}`;
  const { error } = await supabaseAdmin.storage
    .from(CONTENT_SOURCES_BUCKET)
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`content-source upload failed: ${error.message}`);
  return path;
}

/** Download raw source bytes back for ingestion. */
export async function getContentSourceFile(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage
    .from(CONTENT_SOURCES_BUCKET)
    .download(storagePath);
  if (error || !data) throw new Error(`content-source download failed: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Best-effort delete of a source's stored file (called when the row is removed). */
export async function deleteContentSourceFile(storagePath: string): Promise<void> {
  try {
    await supabaseAdmin.storage.from(CONTENT_SOURCES_BUCKET).remove([storagePath]);
  } catch {
    /* best-effort */
  }
}
