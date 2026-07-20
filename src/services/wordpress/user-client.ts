/**
 * User-configurable WordPress client.
 *
 * Publishes to a user's own self-hosted WordPress site via the REST API using
 * an Application Password (HTTP Basic auth). Mirrors the shape of
 * `createUserStrapiClient` (testConnection + publishArticle) so the shared
 * publish route can treat every CMS uniformly.
 *
 * Credential storage (reuses `user_cms_integrations`, no migration):
 *   base_url        → the WordPress site URL
 *   collection_name → the WordPress username
 *   api_token       → the Application Password
 */

const DEFAULT_TIMEOUT_MS = 35_000;

export class WordPressUserClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly wpError: string,
  ) {
    super(`WordPress ${status}: ${wpError}`);
    this.name = "WordPressUserClientError";
  }
}

export interface WordPressPublishPayload {
  title: string;
  slug: string;
  /** Post body as HTML (already converted from markdown by the caller). */
  content: string;
  excerpt?: string;
  status?: "publish" | "draft";
  coverImageUrl?: string | null;
  categoryId?: number | null;
}

/** Application passwords are shown with spaces; WordPress accepts them with or without. */
function basicAuth(username: string, appPassword: string): string {
  const raw = `${username.trim()}:${appPassword.replace(/\s+/g, "")}`;
  return typeof Buffer !== "undefined" ? Buffer.from(raw).toString("base64") : btoa(raw);
}

/** Accept a site root, a wp-admin URL, or a wp-json URL and normalize to the site root. */
export function normalizeWordPressBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/wp-admin\/?$/i, "")
    .replace(/\/wp-json(?:\/.*)?$/i, "");
}

export function createUserWordPressClient(baseUrl: string, username: string, appPassword: string) {
  const base = normalizeWordPressBaseUrl(baseUrl);
  const auth = basicAuth(username, appPassword);

  const request = async <T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/wp-json${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      }).catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") {
          throw new WordPressUserClientError(
            408,
            `Request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s. The site may be slow or unreachable.`,
          );
        }
        throw err;
      });

      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.toLowerCase().includes("application/json");
      const data: unknown = isJson ? await res.json().catch(() => null) : null;

      if (!res.ok) {
        const message =
          (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
            ? (data as { message: string }).message
            : null) ?? `HTTP ${res.status}`;
        throw new WordPressUserClientError(res.status, message);
      }
      return data as T;
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    /** Verify the credentials and that the account can author content. */
    async testConnection(): Promise<{ ok: boolean; error?: string }> {
      try {
        await request<{ id: number }>("GET", "/wp/v2/users/me?context=edit");
        return { ok: true };
      } catch (e) {
        if (e instanceof WordPressUserClientError) return { ok: false, error: e.wpError };
        return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
      }
    },

    /** Fetch all categories from WordPress */
    async getCategories(): Promise<Array<{ id: number; name: string }>> {
      try {
        const res = await request<Array<{ id: number; name: string; slug: string }>>("GET", "/wp/v2/categories?per_page=100");
        return Array.isArray(res) ? res.map(cat => ({ id: cat.id, name: cat.name })) : [];
      } catch (e) {
        console.error("[wordpress-client] failed to fetch categories:", e);
        return [];
      }
    },

    /** Idempotent publish: update an existing post with the same slug, else create a new one. */
    async publishArticle(
      payload: WordPressPublishPayload,
    ): Promise<{ documentId: string; slug: string; link?: string }> {
      const status = payload.status ?? "publish";

      let featuredMediaId: number | null = null;
      if (payload.coverImageUrl) {
        try {
          const imageRes = await fetch(payload.coverImageUrl);
          if (imageRes.ok) {
            const blob = await imageRes.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const contentType = imageRes.headers.get("content-type") || "image/jpeg";
            const ext = contentType.split("/")[1] || "jpg";
            const filename = `${payload.slug}-cover.${ext}`;

            const mediaRes = await fetch(`${base}/wp-json/wp/v2/media`, {
              method: "POST",
              headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="${filename}"`,
              },
              body: buffer,
            });

            if (mediaRes.ok) {
              const mediaData = (await mediaRes.json()) as { id: number };
              if (mediaData && typeof mediaData.id === "number") {
                featuredMediaId = mediaData.id;
              }
            } else {
              const mediaErrText = await mediaRes.text().catch(() => "");
              console.error("[wordpress-client] media upload failed status:", mediaRes.status, mediaErrText);
            }
          }
        } catch (e) {
          console.error("[wordpress-client] failed to fetch/upload cover image:", e);
        }
      }

      let existingId: number | null = null;
      try {
        const found = await request<Array<{ id: number }>>(
          "GET",
          `/wp/v2/posts?slug=${encodeURIComponent(payload.slug)}&status=publish,draft,pending,future,private&per_page=1`,
        );
        if (Array.isArray(found) && found.length > 0) existingId = found[0].id;
      } catch {
        /* assume no existing post and create */
      }

      const wpBody: Record<string, any> = {
        title: payload.title,
        content: payload.content,
        excerpt: payload.excerpt ?? "",
        slug: payload.slug,
        status,
      };

      if (featuredMediaId !== null) {
        wpBody.featured_media = featuredMediaId;
      }

      if (payload.categoryId) {
        wpBody.categories = [payload.categoryId];
      }

      const res = existingId
        ? await request<{ id: number; slug?: string; link?: string }>("POST", `/wp/v2/posts/${existingId}`, wpBody)
        : await request<{ id: number; slug?: string; link?: string }>("POST", "/wp/v2/posts", wpBody);

      return { documentId: String(res.id), slug: res.slug ?? payload.slug, link: res.link };
    },
  };
}
