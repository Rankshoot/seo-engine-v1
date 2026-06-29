import { currentUser } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Same-origin PDF proxy.
 *
 * Generated blogs can embed a "downloadable PDF kit" as a normal link to an
 * external PDF. Framing that PDF directly fails whenever the host sends
 * `X-Frame-Options` / `frame-ancestors` (Supabase Storage, most CDNs, taggd.in,
 * …) — the viewer shows "This content is blocked". Streaming the bytes through
 * our own origin (with no framing restrictions) lets the in-blog viewer iframe
 * it reliably.
 *
 * Guards: auth required, http(s) only, private/loopback hosts blocked (SSRF),
 * and we only pass through actual PDF responses.
 */

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  return false;
}

export async function GET(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('url') ?? '';

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response('Invalid url', { status: 400 });
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return new Response('Unsupported protocol', { status: 400 });
  }
  if (isBlockedHost(target.hostname)) {
    return new Response('Blocked host', { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; RankshootPDF/1.0)',
        accept: 'application/pdf,*/*',
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return new Response('Failed to fetch PDF', { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response('PDF not reachable', { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  const looksPdf =
    contentType.includes('application/pdf') ||
    contentType.includes('application/octet-stream') ||
    /\.pdf(\?|#|$)/i.test(target.pathname);
  if (!looksPdf) {
    return new Response('Not a PDF', { status: 415 });
  }

  const filename =
    (() => {
      try {
        return decodeURIComponent(target.pathname.split('/').filter(Boolean).pop() || 'document.pdf');
      } catch {
        return 'document.pdf';
      }
    })().replace(/[\r\n"]/g, '');

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
      // Deliberately no X-Frame-Options here: this is our own origin, so the
      // blog viewer (same origin) can embed it. We never reflect upstream
      // framing headers.
    },
  });
}
