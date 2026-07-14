import { supabaseAdmin } from "@/lib/supabase";

/**
 * Uploads a single base64 data URL to Supabase Storage in the "blog-images" bucket.
 * If the input URL is not a data URL (e.g. it starts with http/https), it returns the URL unchanged.
 */
export async function uploadSingleBase64Image(url: string, blogId: string): Promise<string> {
  if (!url || !url.startsWith("data:image/")) {
    return url;
  }

  const match = url.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\s\n\r]+)$/);
  if (!match) {
    console.error("[blog-images] invalid base64 format for image");
    return url;
  }

  const mimeType = match[1];
  const base64Data = match[2].replace(/\s/g, "");
  const buffer = Buffer.from(base64Data, "base64");
  const ext = mimeType.split("/")[1] || "png";
  const fileName = `${blogId}/image_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;

  // Ensure bucket exists
  try {
    await supabaseAdmin.storage.createBucket("blog-images", {
      public: true,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    });
  } catch (e) {
    // Ignore bucket-exists errors
  }

  const { error } = await supabaseAdmin.storage
    .from("blog-images")
    .upload(fileName, buffer, {
      contentType: mimeType,
      cacheControl: "31536000",
      upsert: true,
    });

  if (error) {
    console.error("[blog-images] failed to upload image to Supabase", error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from("blog-images")
    .getPublicUrl(fileName);

  return publicUrl;
}

/**
 * Fetches an image from an external URL and uploads it to Supabase Storage.
 * Returns the new Supabase public URL.
 */
export async function fetchAndUploadExternalImage(url: string, blogId: string): Promise<string | null> {
  if (!url || !url.startsWith("http")) return null;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[blog-images] failed to fetch external image: ${res.status} ${res.statusText}`);
      return null;
    }
    
    const mimeType = res.headers.get("content-type") || "image/jpeg";
    if (!mimeType.startsWith("image/")) {
      console.warn(`[blog-images] URL did not return an image. Content-Type: ${mimeType}`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const ext = mimeType.split("/")[1] || "jpeg";
    const fileName = `${blogId}/real_image_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;

    // Ensure bucket exists
    try {
      await supabaseAdmin.storage.createBucket("blog-images", {
        public: true,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
      });
    } catch (e) {
      // Ignore
    }

    const { error } = await supabaseAdmin.storage
      .from("blog-images")
      .upload(fileName, buffer, {
        contentType: mimeType,
        cacheControl: "31536000",
        upsert: true,
      });

    if (error) {
      console.error("[blog-images] failed to upload external image to Supabase", error);
      return null;
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from("blog-images")
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.error("[blog-images] error processing external image", error);
    return null;
  }
}


/**
 * Scans markdown content for inline base64 images, uploads them to Supabase Storage,
 * and replaces the base64 source blocks with public cloud URLs.
 */
export async function uploadBase64Images(content: string, blogId: string): Promise<string> {
  if (!content) return content;

  // Clean up any newlines or spaces between markdown image brackets and parentheses
  const healedContent = content.replace(/!\[([^\]]*?)\]\s+\((https?:\/\/[^)\s]+|data:image\/[^)\s]+)\)/g, '![$1]($2)');

  const base64Regex = /data:(image\/[a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\s\n\r]+)/g;
  let matches;
  let updatedContent = healedContent;

  const allMatches: Array<{ fullMatch: string; mimeType: string; base64Data: string }> = [];

  base64Regex.lastIndex = 0;
  while ((matches = base64Regex.exec(content)) !== null) {
    allMatches.push({
      fullMatch: matches[0],
      mimeType: matches[1],
      base64Data: matches[2].replace(/\s/g, ""),
    });
  }

  if (allMatches.length === 0) return content;

  // Ensure bucket exists
  try {
    await supabaseAdmin.storage.createBucket("blog-images", {
      public: true,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    });
  } catch (e) {
    // Ignore bucket-exists errors
  }

  for (const match of allMatches) {
    try {
      const ext = match.mimeType.split("/")[1] || "png";
      const buffer = Buffer.from(match.base64Data, "base64");
      const fileName = `${blogId}/image_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;

      const { error } = await supabaseAdmin.storage
        .from("blog-images")
        .upload(fileName, buffer, {
          contentType: match.mimeType,
          cacheControl: "31536000",
          upsert: true,
        });

      if (error) {
        console.error("[blog-images] failed to upload image to Supabase", error);
        continue;
      }

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from("blog-images")
        .getPublicUrl(fileName);

      updatedContent = updatedContent.replace(match.fullMatch, publicUrl);
    } catch (err) {
      console.error("[blog-images] unexpected error parsing base64 image", err);
    }
  }

  return updatedContent;
}
