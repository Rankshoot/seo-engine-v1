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

  /** Get the user's connected CMS across all providers (primary in `data`). */
  getUserCms(): Promise<{
    success: boolean;
    error?: string;
    data: {
      cms_type: string;
      base_url: string;
      masked_token: string;
      collection_name: string;
    } | null;
    integrations?: Array<{ cms_type: string; base_url: string }>;
  }> {
    return apiGet(V1Routes.userCmsIntegration);
  },

  /** Get the current user's saved WordPress integration. */
  getUserWordPress(): Promise<{
    success: boolean;
    error?: string;
    data: {
      id: string;
      cms_type: string;
      base_url: string;
      masked_token: string;
      username: string;
      collection_name: string;
      created_at: string;
      updated_at: string;
    } | null;
  }> {
    return apiGet(V1Routes.userWordPressIntegration);
  },

  /** Save (upsert) the user's WordPress integration. Tests the connection first. */
  saveUserWordPress(body: {
    base_url: string;
    username: string;
    app_password: string;
  }): Promise<{ success: boolean; error?: string; masked_token?: string }> {
    return apiPost(V1Routes.userWordPressIntegration, body);
  },

  /** Remove the user's WordPress integration. */
  deleteUserWordPress(): Promise<{ success: boolean; error?: string }> {
    return apiDelete(V1Routes.userWordPressIntegration);
  },

  /** Test a WordPress connection without saving credentials. */
  testUserWordPress(body: {
    base_url: string;
    username: string;
    app_password: string;
  }): Promise<{ success: boolean; error?: string; message?: string }> {
    return apiPost(V1Routes.userWordPressTest, body);
  },

  /**
   * Publish a blog to the user's connected CMS. Pass `cmsType` to target a
   * specific provider when more than one is connected; otherwise the server
   * uses the connected integration.
   */
  publishToCms(blogId: string, cmsType?: string): Promise<{
    success: boolean;
    error?: string;
    documentId?: string;
    slug?: string;
    strapiUrl?: string;
    cmsType?: string;
  }> {
    return apiPost(V1Routes.blogPublishCms(blogId), cmsType ? { cms_type: cmsType } : {});
  },
};
