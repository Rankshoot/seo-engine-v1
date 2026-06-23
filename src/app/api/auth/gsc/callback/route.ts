import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exchangeGSCCode, listGSCSites } from '@/lib/gsc';

/** GET /api/auth/gsc/callback?code=xxx&state=projectId — handles Google OAuth callback */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const projectId = searchParams.get('state');
  const oauthError = searchParams.get('error');

  // If Google returned an error, redirect back with error param
  if (oauthError || !code || !projectId) {
    const reason = oauthError ?? 'missing_params';
    return NextResponse.redirect(
      `${origin}/projects/${projectId ?? ''}?gsc_error=${encodeURIComponent(reason)}`
    );
  }

  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.redirect(`${origin}/sign-in`);
    }

    // Verify user owns the project and get domain
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, domain')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.redirect(
        `${origin}/projects?gsc_error=${encodeURIComponent('project_not_found')}`
      );
    }

    const redirectUri = `${origin}/api/auth/gsc/callback`;

    // Exchange code for tokens
    let tokens: { access_token: string; refresh_token: string; expires_in: number };
    try {
      tokens = await exchangeGSCCode(code, redirectUri);
    } catch (err) {
      console.error('[GSC callback] token exchange failed', err);
      return NextResponse.redirect(
        `${origin}/projects/${projectId}?gsc_error=${encodeURIComponent('token_exchange_failed')}`
      );
    }

    // List GSC properties and find the one matching this project's domain
    let siteUrl: string | null = null;
    try {
      const sites = await listGSCSites(tokens.access_token);
      const domain = project.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

      // Try matching in order: sc-domain:, https://, http://
      const candidates = [
        `sc-domain:${domain}`,
        `https://${domain}/`,
        `http://${domain}/`,
        `https://${domain}`,
        `http://${domain}`,
      ];

      for (const candidate of candidates) {
        if (sites.includes(candidate)) {
          siteUrl = candidate;
          break;
        }
      }

      // Fallback: pick first site if nothing matched (user can manage from settings)
      if (!siteUrl && sites.length > 0) {
        siteUrl = sites[0];
      }
    } catch (err) {
      console.error('[GSC callback] listGSCSites failed', err);
      return NextResponse.redirect(
        `${origin}/projects/${projectId}?gsc_error=${encodeURIComponent('sites_fetch_failed')}`
      );
    }

    if (!siteUrl) {
      return NextResponse.redirect(
        `${origin}/projects/${projectId}?gsc_error=${encodeURIComponent('no_verified_sites')}`
      );
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const now = new Date().toISOString();

    // Upsert the connection
    const { error: upsertError } = await supabaseAdmin
      .from('gsc_connections')
      .upsert(
        {
          project_id: projectId,
          user_id: user.id,
          site_url: siteUrl,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          updated_at: now,
        },
        { onConflict: 'project_id' }
      );

    if (upsertError) {
      console.error('[GSC callback] upsert failed', upsertError);
      return NextResponse.redirect(
        `${origin}/projects/${projectId}?gsc_error=${encodeURIComponent('db_error')}`
      );
    }

    return NextResponse.redirect(`${origin}/projects/${projectId}/settings?gsc=connected`);
  } catch (err) {
    console.error('[GSC callback] unexpected error', err);
    return NextResponse.redirect(
      `${origin}/projects/${projectId ?? ''}?gsc_error=${encodeURIComponent('unexpected_error')}`
    );
  }
}
