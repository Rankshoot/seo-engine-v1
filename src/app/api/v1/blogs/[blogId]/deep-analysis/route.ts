import { currentUser } from '@clerk/nextjs/server';
import { getBlogDeepAnalysis, runBlogDeepAnalysis } from '@/app/actions/blog-deep-analysis-actions';
import { apiJson } from '@/server/http/json';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ blogId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: 'Not authenticated', data: null }, { status: 401 });

  const { blogId } = await params;
  const result = await getBlogDeepAnalysis(blogId);

  if (!result.success) {
    return apiJson({ success: true, cached: false, data: null, updatedAt: null, targetKeyword: null });
  }

  return apiJson({
    success: true,
    cached: true,
    data: result.analysis,
    updatedAt: result.updatedAt,
    targetKeyword: result.targetKeyword,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ blogId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: 'Not authenticated' }, { status: 401 });

  const { blogId } = await params;
  let force = false;
  try {
    const body = (await req.json()) as { force?: boolean };
    force = Boolean(body?.force);
  } catch {
    /* empty body is fine */
  }

  const result = await runBlogDeepAnalysis(blogId, { force });
  if (!result.success) {
    return apiJson(
      {
        success: false,
        error: result.error,
        trace: result.trace ?? [],
        discoveryTrace: result.discoveryTrace ?? [],
      },
      { status: 400 }
    );
  }

  console.log('[deep-analysis] trace:', result.trace);
  console.log('[deep-analysis] discoveryTrace:', result.discoveryTrace);

  return apiJson({
    success: true,
    data: result.analysis,
    trace: result.trace,
    discoveryTrace: result.discoveryTrace,
    updatedAt: result.updatedAt,
  });
}
