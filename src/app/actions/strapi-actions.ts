'use server';

import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { upsertArticle, testStrapiConnection, STRAPI_ALLOWED_TYPES } from '@/lib/strapi';
import type { Blog } from '@/lib/types';

async function ensureProjectOwner(projectId: string) {
  const user = await currentUser();
  if (!user) return { user: null, error: 'Not authenticated' as const };
  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('id, strapi_base_url, strapi_api_token')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (error || !project) return { user, error: 'Project not found' as const };
  return { user, project, error: null };
}

/** Push a blog to the project's connected Strapi instance as a draft Article. */
export async function pushBlogToStrapi(blogId: string): Promise<{
  success: boolean;
  strapiAdminUrl?: string;
  strapiDocumentId?: string;
  error?: string;
}> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: blog, error: blogErr } = await supabaseAdmin
    .from('blogs')
    .select('*')
    .eq('id', blogId)
    .single();

  if (blogErr || !blog) return { success: false, error: 'Blog not found' };

  const typedBlog = blog as unknown as Blog;

  const contentType = typedBlog.content_type ?? 'blog';
  if (!STRAPI_ALLOWED_TYPES.includes(contentType as typeof STRAPI_ALLOWED_TYPES[number])) {
    return {
      success: false,
      error: `Content type '${contentType}' is not supported for Strapi push. Only blog, ebook, and whitepaper can be pushed.`,
    };
  }

  const { data: project, error: projErr } = await supabaseAdmin
    .from('projects')
    .select('id, strapi_base_url, strapi_api_token')
    .eq('id', typedBlog.project_id)
    .eq('user_id', user.id)
    .single();

  if (projErr || !project) return { success: false, error: 'Project not found or unauthorized' };

  const baseUrl = (project as Record<string, unknown>)['strapi_base_url'] as string | null;
  const token   = (project as Record<string, unknown>)['strapi_api_token'] as string | null;

  if (!baseUrl || !token) {
    return { success: false, error: 'Strapi is not configured for this project. Add your Strapi Base URL and API Token in Project Settings.' };
  }

  try {
    const result = await upsertArticle(baseUrl, token, typedBlog);

    await supabaseAdmin
      .from('blogs')
      .update({
        strapi_document_id:  result.documentId,
        strapi_sync_status:  'synced',
        strapi_sync_error:   null,
        strapi_synced_at:    new Date().toISOString(),
      })
      .eq('id', blogId);

    return {
      success: true,
      strapiAdminUrl: result.strapiAdminUrl,
      strapiDocumentId: result.documentId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    await supabaseAdmin
      .from('blogs')
      .update({
        strapi_sync_status: 'error',
        strapi_sync_error:  msg,
      })
      .eq('id', blogId);

    return { success: false, error: msg };
  }
}

/** Save Strapi connection credentials for a project. */
export async function saveStrapiConnection(
  projectId: string,
  payload: { strapiBaseUrl: string; strapiApiToken: string },
): Promise<{ success: boolean; error?: string }> {
  const { error: ownerErr, user } = await ensureProjectOwner(projectId);
  if (ownerErr || !user) return { success: false, error: ownerErr ?? 'Not authenticated' };

  const clean = payload.strapiBaseUrl.trim().replace(/\/$/, '');
  if (!clean) return { success: false, error: 'Strapi Base URL is required' };
  if (!payload.strapiApiToken.trim()) return { success: false, error: 'API Token is required' };

  const { error } = await supabaseAdmin
    .from('projects')
    .update({
      strapi_base_url:  clean,
      strapi_api_token: payload.strapiApiToken.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('user_id', user.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Remove Strapi connection credentials for a project. */
export async function disconnectStrapi(
  projectId: string,
): Promise<{ success: boolean; error?: string }> {
  const { error: ownerErr, user } = await ensureProjectOwner(projectId);
  if (ownerErr || !user) return { success: false, error: ownerErr ?? 'Not authenticated' };

  const { error } = await supabaseAdmin
    .from('projects')
    .update({
      strapi_base_url:  null,
      strapi_api_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('user_id', user.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Test the Strapi connection for a project (reads saved credentials server-side). */
export async function testProjectStrapiConnection(
  projectId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error: ownerErr, project, user } = await ensureProjectOwner(projectId);
  if (ownerErr || !user) return { ok: false, error: ownerErr ?? 'Not authenticated' };

  const baseUrl = (project as Record<string, unknown>)['strapi_base_url'] as string | null;
  const token   = (project as Record<string, unknown>)['strapi_api_token'] as string | null;

  if (!baseUrl || !token) return { ok: false, error: 'Strapi not configured' };

  return testStrapiConnection(baseUrl, token);
}

/** Get the Strapi connection status for a project (does NOT return the token). */
export async function getStrapiConnection(
  projectId: string,
): Promise<{ connected: boolean; strapiBaseUrl?: string; error?: string }> {
  const user = await currentUser();
  if (!user) return { connected: false, error: 'Not authenticated' };

  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('strapi_base_url, strapi_api_token')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return { connected: false, error: error.message };
  if (!project) return { connected: false, error: 'Project not found' };

  const baseUrl = (project as Record<string, unknown>)['strapi_base_url'] as string | null;
  const token   = (project as Record<string, unknown>)['strapi_api_token'] as string | null;

  return {
    connected: Boolean(baseUrl && token),
    strapiBaseUrl: baseUrl ?? undefined,
  };
}
