import { apiDelete, apiGet, apiPost } from "./http";
import { V1Routes } from "./routes";

export const integrationsApi = {
  /** Get the current user's saved Strapi integration config. */
  getUserStrapi(): Promise<{
    success: boolean;
    error?: string;
    data: {
      id: string;
      cms_type: string;
      base_url: string;
      masked_token: string;
      collection_name: string;
      created_at: string;
      updated_at: string;
    } | null;
  }> {
    return apiGet(V1Routes.userStrapiIntegration);
  },

  /** Save (upsert) the user's Strapi integration. Tests the connection first. */
  saveUserStrapi(body: {
    base_url: string;
    api_token: string;
    collection_name?: string;
  }): Promise<{ success: boolean; error?: string; masked_token?: string }> {
    return apiPost(V1Routes.userStrapiIntegration, body);
  },

  /** Remove the user's Strapi integration. */
  deleteUserStrapi(): Promise<{ success: boolean; error?: string }> {
    return apiDelete(V1Routes.userStrapiIntegration);
  },

  /** Test a Strapi connection without saving credentials. */
  testUserStrapi(body: {
    base_url: string;
    api_token: string;
  }): Promise<{ success: boolean; error?: string; message?: string }> {
    return apiPost(V1Routes.userStrapiTest, body);
  },

  /** Publish a blog to the user's own Strapi CMS. */
  publishToCms(blogId: string): Promise<{
    success: boolean;
    error?: string;
    documentId?: string;
    slug?: string;
    strapiUrl?: string;
  }> {
    return apiPost(V1Routes.blogPublishCms(blogId), {});
  },
};
