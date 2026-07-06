import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deployment-version handshake for the client's self-refresh guard.
 *
 * Returns the buildId baked into THIS running deployment (see
 * `deployBuildId` in next.config.ts). The client bundle carries the same
 * value inlined as NEXT_PUBLIC_BUILD_ID; when the two stop matching, a new
 * deploy has shipped and the client silently reloads itself on its next
 * navigation — so users always see the latest version without a hard refresh.
 *
 * Public + unauthenticated by design: it leaks nothing but an opaque build
 * fingerprint, and the check must also work on marketing pages.
 */
export async function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev' },
    {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
      },
    }
  );
}
