/**
 * HTTP(S) reachability check for editor / rewriter flows (HEAD → GET fallback).
 */

export type ValidateUrlResult = {
  isValid: boolean;
  status?: number;
  finalUrl?: string;
  reason?: string;
};

const UNSAFE = /^(javascript|data|vbscript|file|about|mailto):/i;

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; SEOEngineBot/1.0; +https://seo-engine.app/bot)";

function normalizeInputUrl(url: string): string | null {
  let t = url.trim();
  if (!t) return null;
  if (/^www\./i.test(t)) t = `https://${t}`;
  if (UNSAFE.test(t)) return null;
  if (!/^https?:\/\//i.test(t)) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Probe URL: HEAD first; on 405/403/501 retry GET. Valid when final status is 200–399.
 */
export async function validateUrl(url: string, timeoutMs = 10_000): Promise<ValidateUrlResult> {
  const normalized = normalizeInputUrl(url);
  if (!normalized) {
    return { isValid: false, reason: "Only http(s) URLs are allowed." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(normalized, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": DEFAULT_UA,
        accept: "*/*",
      },
    });

    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(normalized, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": DEFAULT_UA,
          accept: "text/html,*/*",
        },
      });
    }

    const status = res.status;
    const finalUrl = res.url || normalized;

    if (status >= 200 && status < 400) {
      return { isValid: true, status, finalUrl };
    }

    if (status === 404 || status === 410) {
      return {
        isValid: false,
        status,
        finalUrl,
        reason: `This link returns ${status}.`,
      };
    }
    if (status >= 500) {
      return {
        isValid: false,
        status,
        finalUrl,
        reason: `Server error (${status}).`,
      };
    }
    return {
      isValid: false,
      status,
      finalUrl,
      reason: `Unexpected HTTP status ${status}.`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      isValid: false,
      reason: /abort/i.test(msg) ? "Request timed out." : `Could not reach URL: ${msg}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
