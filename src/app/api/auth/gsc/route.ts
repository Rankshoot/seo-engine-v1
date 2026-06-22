import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { buildGSCAuthUrl } from '@/lib/gsc';

/** GET /api/auth/gsc?projectId=xxx — initiates Google Search Console OAuth flow */
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    // Verify user owns the project
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (error || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/auth/gsc/callback`;
    const authUrl = buildGSCAuthUrl(projectId, redirectUri);

    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error('[GSC auth initiate]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
