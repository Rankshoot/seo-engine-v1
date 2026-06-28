/**
 * User-configurable Shopify client.
 *
 * Publishes blog Articles to a user's Shopify store via the GraphQL Admin API
 * (the REST Admin API is deprecated for new apps). Auth is a custom-app Admin
 * API access token sent in the `X-Shopify-Access-Token` header. Requires the
 * `write_content` (or `write_online_store_pages`) scope.
 *
 * Mirrors the Strapi / WordPress user-clients (testConnection + publishArticle)
 * so the shared publish route treats every CMS uniformly.
 *
 * Credential storage (reuses `user_cms_integrations`, no migration):
 *   base_url        → the store's myshopify.com domain
 *   api_token       → the Admin API access token
 *   collection_name → the target Blog id/handle (optional; defaults to 1st blog)
 */

const SHOPIFY_API_VERSION = "2026-01";
const DEFAULT_TIMEOUT_MS = 35_000;

export class ShopifyUserClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly shopifyError: string,
  ) {
    super(`Shopify ${status}: ${shopifyError}`);
    this.name = "ShopifyUserClientError";
  }
}

export interface ShopifyPublishPayload {
  title: string;
  slug: string;
  /** Article body as HTML (already converted from markdown by the caller). */
  content: string;
  author?: string;
  isPublished?: boolean;
}

/** Accept a full URL, an admin URL, or a bare handle and reduce to the myshopify host. */
export function normalizeShopDomain(input: string): string {
  let host = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host) return "";
  // A bare store handle (no dot) → assume the myshopify subdomain.
  if (!host.includes(".")) host = `${host}.myshopify.com`;
  return host;
}

export function createUserShopifyClient(shopDomain: string, accessToken: string, blogRef = "") {
  const shop = normalizeShopDomain(shopDomain);
  const endpoint = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const graphql = async <T>(query: string, variables?: Record<string, unknown>): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      }).catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") {
          throw new ShopifyUserClientError(408, `Request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s.`);
        }
        throw err;
      });

      const json = (await res.json().catch(() => null)) as
        | { data?: T; errors?: Array<{ message: string }> }
        | null;

      if (!res.ok) {
        const msg = json?.errors?.[0]?.message ?? `HTTP ${res.status}`;
        throw new ShopifyUserClientError(res.status, msg);
      }
      if (json?.errors?.length) {
        throw new ShopifyUserClientError(res.status, json.errors.map(e => e.message).join("; "));
      }
      return (json?.data ?? ({} as T)) as T;
    } finally {
      clearTimeout(timer);
    }
  };

  /** Turn a stored blog reference (gid, numeric id, or handle) into a Blog GID. */
  const resolveBlogId = async (): Promise<string> => {
    const ref = blogRef.trim();
    if (ref.startsWith("gid://shopify/Blog/")) return ref;
    if (/^\d+$/.test(ref)) return `gid://shopify/Blog/${ref}`;

    // Handle or empty → look up the store's blogs.
    const data = await graphql<{ blogs: { edges: Array<{ node: { id: string; handle: string } }> } }>(
      `query Blogs { blogs(first: 50) { edges { node { id handle } } } }`,
    );
    const blogs = data.blogs?.edges?.map(e => e.node) ?? [];
    if (blogs.length === 0) {
      throw new ShopifyUserClientError(422, "No blogs found on this Shopify store. Create a blog first.");
    }
    if (ref) {
      const match = blogs.find(b => b.handle === ref);
      if (match) return match.id;
      throw new ShopifyUserClientError(422, `No blog with handle "${ref}" found on this store.`);
    }
    return blogs[0].id;
  };

  return {
    /** Verify the access token and the content scope by reading shop + blogs. */
    async testConnection(): Promise<{ ok: boolean; error?: string }> {
      try {
        await graphql<{ shop: { name: string } }>(`query Shop { shop { name } }`);
        // Confirm we can read blogs (content scope) too.
        await graphql<{ blogs: { edges: unknown[] } }>(`query Blogs { blogs(first: 1) { edges { node { id } } } }`);
        return { ok: true };
      } catch (e) {
        if (e instanceof ShopifyUserClientError) return { ok: false, error: e.shopifyError };
        return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
      }
    },

    /** Create an Article in the resolved blog. */
    async publishArticle(
      payload: ShopifyPublishPayload,
    ): Promise<{ documentId: string; slug: string; link?: string }> {
      const blogId = await resolveBlogId();
      const data = await graphql<{
        articleCreate: {
          article: { id: string; handle: string } | null;
          userErrors: Array<{ field?: string[]; message: string }>;
        };
      }>(
        `mutation CreateArticle($article: ArticleCreateInput!) {
          articleCreate(article: $article) {
            article { id handle }
            userErrors { field message }
          }
        }`,
        {
          article: {
            blogId,
            title: payload.title,
            handle: payload.slug,
            body: payload.content,
            author: { name: payload.author?.trim() || "Editorial" },
            isPublished: payload.isPublished ?? true,
          },
        },
      );

      const errs = data.articleCreate?.userErrors ?? [];
      if (errs.length) {
        throw new ShopifyUserClientError(422, errs.map(e => e.message).join("; "));
      }
      const article = data.articleCreate?.article;
      if (!article) {
        throw new ShopifyUserClientError(502, "Shopify returned no article from articleCreate.");
      }
      const numericId = article.id.split("/").pop() ?? article.id;
      return {
        documentId: article.id,
        slug: article.handle ?? payload.slug,
        link: `https://${shop}/admin/articles/${numericId}`,
      };
    },
  };
}
