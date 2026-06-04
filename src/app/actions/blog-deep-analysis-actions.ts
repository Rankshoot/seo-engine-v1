'use server';

import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  runBlogDeepAnalysisPipeline,
  type BlogDeepAnalysisResult,
  type DeepAnalysisTraceEntry,
} from '@/lib/blog-deep-analysis';
import type { DataForSEOTraceEntry } from '@/lib/dataforseo';

/** PostgREST / Postgres when `blog_deep_analyses` was never migrated or cache is stale. */
function isBlogDeepAnalysesTableUnavailable(err: { message?: string } | null | undefined): boolean {
  const m = (err?.message ?? '').toLowerCase();
  if (!m || !m.includes('blog_deep_analyses')) return false;
  return (
    m.includes('schema cache') ||
    m.includes('does not exist') ||
    m.includes('could not find') ||
    m.includes('undefined table')
  );
}

/**
 * PostgREST exposes columns from a cache. Right after `ALTER TABLE ... ADD COLUMN`,
 * requests can fail until `NOTIFY pgrst, 'reload schema'` runs (or the cache refreshes).
 */
function isPostgrestBlogsDeepAnalysisColumnMissing(err: { message?: string } | null | undefined): boolean {
  const m = (err?.message ?? '').toLowerCase();
  if (!m.includes('blogs') || !m.includes('deep_analysis')) return false;
  return m.includes('schema cache') || m.includes('could not find');
}

function isUsableDeepAnalysisJson(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as object).length > 0
  );
}

export type GetBlogDeepAnalysisResult =
  | {
      success: true;
      cached: boolean;
      analysis: BlogDeepAnalysisResult;
      updatedAt: string;
      targetKeyword: string;
    }
  | { success: false; error: string };

export type RunBlogDeepAnalysisResult =
  | {
      success: true;
      analysis: BlogDeepAnalysisResult;
      trace: DeepAnalysisTraceEntry[];
      discoveryTrace: DataForSEOTraceEntry[];
      updatedAt: string;
    }
  | { success: false; error: string; trace?: DeepAnalysisTraceEntry[]; discoveryTrace?: DataForSEOTraceEntry[] };

async function assertBlogAccess(blogId: string) {
  const user = await currentUser();
  if (!user) return { ok: false as const, error: 'Not authenticated' };

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(blogId);
  let query = supabaseAdmin
    .from('blogs')
    .select('id, project_id, title, content, meta_description, target_keyword');
  if (isUuid) {
    query = query.eq('id', blogId);
  } else {
    query = query.eq('entry_id', blogId);
  }
  const { data: blog, error: bErr } = await query.maybeSingle();

  if (bErr || !blog) return { ok: false as const, error: 'Blog not found' };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id, domain, target_region')
    .eq('id', blog.project_id)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) return { ok: false as const, error: 'Unauthorized' };

  return { ok: true as const, blog, project };
}

export async function getBlogDeepAnalysis(blogId: string): Promise<GetBlogDeepAnalysisResult> {
  const access = await assertBlogAccess(blogId);
  if (!access.ok) return { success: false, error: access.error };

  const { data: row, error } = await supabaseAdmin
    .from('blog_deep_analyses')
    .select('analysis, updated_at, target_keyword')
    .eq('blog_id', blogId)
    .maybeSingle();

  if (error && !isBlogDeepAnalysesTableUnavailable(error)) {
    return { success: false, error: error.message };
  }

  if (!error && row?.analysis && isUsableDeepAnalysisJson(row.analysis)) {
    return {
      success: true,
      cached: true,
      analysis: row.analysis as unknown as BlogDeepAnalysisResult,
      updatedAt: row.updated_at ?? '',
      targetKeyword: row.target_keyword ?? access.blog.target_keyword ?? '',
    };
  }

  const { data: blogRow, error: blogErr } = await supabaseAdmin
    .from('blogs')
    .select('deep_analysis, deep_analysis_updated_at, target_keyword')
    .eq('id', blogId)
    .single();

  if (blogErr && !isPostgrestBlogsDeepAnalysisColumnMissing(blogErr)) {
    return { success: false, error: blogErr.message };
  }
  if (blogErr && isPostgrestBlogsDeepAnalysisColumnMissing(blogErr)) {
    return { success: false, error: 'No cached deep analysis' };
  }
  if (blogRow?.deep_analysis && isUsableDeepAnalysisJson(blogRow.deep_analysis)) {
    return {
      success: true,
      cached: true,
      analysis: blogRow.deep_analysis as unknown as BlogDeepAnalysisResult,
      updatedAt: blogRow.deep_analysis_updated_at ?? '',
      targetKeyword: blogRow.target_keyword ?? access.blog.target_keyword ?? '',
    };
  }

  return { success: false, error: 'No cached deep analysis' };
}

export async function runBlogDeepAnalysis(
  blogId: string,
  opts: { force?: boolean } = {}
): Promise<RunBlogDeepAnalysisResult> {
  const access = await assertBlogAccess(blogId);
  if (!access.ok) return { success: false, error: access.error };

  const { blog, project } = access;

  if (!opts.force) {
    const cached = await getBlogDeepAnalysis(blogId);
    if (cached.success) {
      return {
        success: true,
        analysis: cached.analysis,
        trace: [{ stage: 'cache', ok: true, detail: 'Returned cached analysis' }],
        discoveryTrace: [],
        updatedAt: cached.updatedAt,
      };
    }
  }

  const keyword = (blog.target_keyword ?? '').trim();
  if (!keyword) {
    return { success: false, error: 'This blog has no target keyword.' };
  }

  if (!(blog.content ?? '').trim()) {
    return { success: false, error: 'This blog has no content to analyze.' };
  }

  try {
    const { analysis, trace, dfsTrace } = await runBlogDeepAnalysisPipeline({
      keyword,
      blogTitle: blog.title ?? '',
      blogContent: blog.content ?? '',
      blogMeta: blog.meta_description ?? '',
      targetRegion: project.target_region ?? 'us',
      ownDomain: project.domain ?? '',
    });

    const now = new Date().toISOString();
    const { error: upsertErr } = await supabaseAdmin.from('blog_deep_analyses').upsert(
      {
        blog_id: blogId,
        project_id: blog.project_id,
        target_keyword: keyword,
        analysis,
        trace,
        updated_at: now,
      },
      { onConflict: 'blog_id' }
    );

    let wroteScoreOnBlogs = false;

    const persistTrace: DeepAnalysisTraceEntry[] = [...trace];

    if (upsertErr && isBlogDeepAnalysesTableUnavailable(upsertErr)) {
      const { error: fallbackErr } = await supabaseAdmin
        .from('blogs')
        .update({
          deep_analysis: analysis,
          deep_analysis_score: analysis.deepAnalysisScore,
          deep_analysis_updated_at: now,
        })
        .eq('id', blogId)
        .eq('project_id', blog.project_id);

      if (fallbackErr && isPostgrestBlogsDeepAnalysisColumnMissing(fallbackErr)) {
        const { error: scoreOnlyErr } = await supabaseAdmin
          .from('blogs')
          .update({
            deep_analysis_score: analysis.deepAnalysisScore,
            deep_analysis_updated_at: now,
          })
          .eq('id', blogId)
          .eq('project_id', blog.project_id);

        if (scoreOnlyErr) {
          console.error('[deep-analysis] blogs score-only fallback failed:', scoreOnlyErr.message);
          return {
            success: false,
            error: `Could not save deep analysis: ${scoreOnlyErr.message}`,
            trace: persistTrace,
            discoveryTrace: dfsTrace,
          };
        }
        wroteScoreOnBlogs = true;
        persistTrace.push({
          stage: 'persist',
          ok: true,
          detail:
            "PostgREST has not refreshed yet for blogs.deep_analysis. Score was saved. In Supabase SQL editor run: NOTIFY pgrst, 'reload schema'; wait ~1 minute, then Run Again to persist full analysis JSON.",
        });
        console.warn(
          '[deep-analysis] blogs.deep_analysis not in PostgREST cache yet; saved score only. Run NOTIFY pgrst reload schema.'
        );
      } else if (fallbackErr) {
        console.error('[deep-analysis] blogs JSON fallback save failed:', fallbackErr.message);
        return {
          success: false,
          error: `Could not save deep analysis: ${fallbackErr.message}`,
          trace: persistTrace,
          discoveryTrace: dfsTrace,
        };
      } else {
        wroteScoreOnBlogs = true;
        console.warn(
          '[deep-analysis] blog_deep_analyses unavailable; saved to blogs.deep_analysis. Run supabase-migration-blog-deep-analysis.sql and NOTIFY pgrst reload schema when ready.'
        );
      }
    } else if (upsertErr) {
      console.error('[deep-analysis] cache upsert failed:', upsertErr.message);
      return {
        success: false,
        error: `Could not save deep analysis: ${upsertErr.message}`,
        trace: persistTrace,
        discoveryTrace: dfsTrace,
      };
    }

    if (!wroteScoreOnBlogs) {
      const { error: blogScoreErr } = await supabaseAdmin
        .from('blogs')
        .update({
          deep_analysis_score: analysis.deepAnalysisScore,
          deep_analysis_updated_at: now,
        })
        .eq('id', blogId)
        .eq('project_id', blog.project_id);

      if (blogScoreErr) {
        console.warn('[deep-analysis] blogs score denorm update failed:', blogScoreErr.message);
      }
    }

    return {
      success: true,
      analysis,
      trace: persistTrace,
      discoveryTrace: dfsTrace,
      updatedAt: now,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Deep analysis failed';
    return { success: false, error: message };
  }
}
