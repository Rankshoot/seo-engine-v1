import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";

const BLOG_IMAGES_BUCKET = "blog-images";
const CACHE_CONTROL = "31536000";

/** Lazily ensures the public blog-images bucket exists (idempotent). */
async function ensureBucket(): Promise<void> {
  try {
    await supabaseAdmin.storage.createBucket(BLOG_IMAGES_BUCKET, {
      public: true,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    });
  } catch {
    // Ignore bucket-exists errors.
  }
}

/** Uploads a buffer under a random per-blog filename and returns its public URL (or null on error). */
async function putImage(blogId: string, buffer: Buffer, contentType: string, ext: string): Promise<string | null> {
  const fileName = `${blogId}/img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from(BLOG_IMAGES_BUCKET)
    .upload(fileName, buffer, { contentType, cacheControl: CACHE_CONTROL, upsert: true });
  if (error) {
    console.error("[blog-images] upload failed", error);
    return null;
  }
  return supabaseAdmin.storage.from(BLOG_IMAGES_BUCKET).getPublicUrl(fileName).data.publicUrl;
}

export interface ConvertedUpload {
  publicUrl: string;
  width: number | null;
  height: number | null;
}

/**
 * Fetches an external image, converts it to webp (resized to a sane max width),
 * and uploads it. webp is materially smaller than the source JPEG/PNG, which
 * improves Core Web Vitals / page speed — a direct SEO win. On ANY sharp/decode
 * failure it uploads the original bytes so a blog never loses an image just
 * because one file couldn't be transcoded. Returns null only when the URL can't
 * be fetched or isn't an image.
 */
export async function fetchConvertAndUploadImage(
  url: string,
  blogId: string,
  opts: { maxWidth?: number; quality?: number } = {}
): Promise<ConvertedUpload | null> {
  if (!url || !url.startsWith("http")) return null;
  const maxWidth = opts.maxWidth ?? 1600;
  const quality = opts.quality ?? 82;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[blog-images] fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const mimeType = res.headers.get("content-type") || "image/jpeg";
    if (!mimeType.startsWith("image/")) {
      console.warn(`[blog-images] not an image. Content-Type: ${mimeType}`);
      return null;
    }

    const sourceBuffer = Buffer.from(await res.arrayBuffer());
    await ensureBucket();

    // Try webp conversion; fall back to the raw bytes on any failure.
    let uploadBuffer = sourceBuffer;
    let contentType = mimeType;
    let ext = mimeType.split("/")[1] || "jpeg";
    let width: number | null = null;
    let height: number | null = null;
    try {
      const webp = await sharp(sourceBuffer, { failOn: "none" })
        .rotate()
        .resize({ width: maxWidth, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });
      uploadBuffer = webp.data;
      contentType = "image/webp";
      ext = "webp";
      width = webp.info.width ?? null;
      height = webp.info.height ?? null;
    } catch (convErr) {
      console.warn("[blog-images] webp conversion failed, uploading original bytes", convErr);
    }

    const publicUrl = await putImage(blogId, uploadBuffer, contentType, ext);
    return publicUrl ? { publicUrl, width, height } : null;
  } catch (error) {
    console.error("[blog-images] error processing image", error);
    return null;
  }
}

/**
 * Thin wrapper over {@link fetchConvertAndUploadImage} for callers that only
 * need the URL. New code should prefer the converter directly (it also returns
 * width/height).
 */
export async function fetchAndUploadExternalImage(url: string, blogId: string): Promise<string | null> {
  return (await fetchConvertAndUploadImage(url, blogId))?.publicUrl ?? null;
}

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\s\n\r]+)$/;

/**
 * Uploads a single base64 data URL to Supabase Storage. Non-data URLs (http/https)
 * are returned unchanged.
 */
export async function uploadSingleBase64Image(url: string, blogId: string): Promise<string> {
  if (!url || !url.startsWith("data:image/")) return url;
  const match = url.match(DATA_URL_RE);
  if (!match) {
    console.error("[blog-images] invalid base64 format");
    return url;
  }
  await ensureBucket();
  const mimeType = match[1];
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  const publicUrl = await putImage(blogId, buffer, mimeType, mimeType.split("/")[1] || "png");
  if (!publicUrl) throw new Error("Failed to upload image");
  return publicUrl;
}

/**
 * Scans markdown for inline base64 images, uploads each, and replaces the base64
 * blocks with public cloud URLs.
 */
export async function uploadBase64Images(content: string, blogId: string): Promise<string> {
  if (!content) return content;
  // Heal any whitespace between markdown image brackets and parentheses first.
  let updated = content.replace(/!\[([^\]]*?)\]\s+\((https?:\/\/[^)\s]+|data:image\/[^)\s]+)\)/g, "![$1]($2)");

  const re = /data:(image\/[a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\s\n\r]+)/g;
  const matches = [...updated.matchAll(re)];
  if (!matches.length) return updated;

  await ensureBucket();
  for (const m of matches) {
    try {
      const mimeType = m[1];
      const buffer = Buffer.from(m[2].replace(/\s/g, ""), "base64");
      const publicUrl = await putImage(blogId, buffer, mimeType, mimeType.split("/")[1] || "png");
      if (publicUrl) updated = updated.replace(m[0], publicUrl);
    } catch (err) {
      console.error("[blog-images] error parsing base64 image", err);
    }
  }
  return updated;
}
