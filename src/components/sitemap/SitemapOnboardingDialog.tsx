"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Link2, X, Search, Check, Sparkles } from "lucide-react";
import {
  getSitemapSettings,
  autoDiscoverSitemap,
  saveSitemapUrl,
  dismissSitemapPrompt,
  type SitemapSettings,
} from "@/app/actions/sitemap-actions";
import { SitemapLinksModal } from "@/components/sitemap/SitemapLinksModal";

type Phase = "hidden" | "confirm" | "manual";

/**
 * One-time onboarding for the sitemap → internal-linking feature.
 *
 * Flow (runs once per project, cached server-side via sitemap_status):
 *   1. On entry, if the project has no sitemap yet and the prompt wasn't
 *      dismissed, auto-discover from the domain.
 *   2. If discovery succeeds → show a light confirmation (with a Verify link).
 *   3. If discovery fails → ask the user to paste their sitemap URL, or dismiss
 *      (dismissers are pointed to Settings).
 *
 * A per-session guard prevents re-running on every in-project navigation.
 */
export function SitemapOnboardingDialog({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("hidden");
  const [settings, setSettings] = useState<SitemapSettings | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const ranForProject = useRef<string | null>(null);

  const sessionKey = `sitemap-onboarding-seen:${projectId}`;

  useEffect(() => {
    if (!projectId) return;
    // Don't interrupt the settings page — the user can configure it directly there.
    if (pathname?.includes("/settings")) return;
    // Only run once per project per session.
    if (ranForProject.current === projectId) return;
    ranForProject.current = projectId;

    try {
      if (sessionStorage.getItem(sessionKey)) return;
    } catch { /* sessionStorage unavailable — proceed */ }

    let cancelled = false;

    (async () => {
      const res = await getSitemapSettings(projectId);
      if (cancelled || !res.success) return;
      const s = res.settings;
      // Nothing to do if migration missing, already configured, or dismissed.
      if (s.needsMigration || s.sitemapUrl || s.promptDismissed) return;

      try { sessionStorage.setItem(sessionKey, "1"); } catch { /* noop */ }

      if (s.status === "pending") {
        // Auto-discover once.
        const disc = await autoDiscoverSitemap(projectId);
        if (cancelled) return;
        console.log("[sitemap] autoDiscoverSitemap trace:", disc.trace);
        if (disc.success && disc.settings.status === "found" && disc.settings.urlCount > 0) {
          setSettings(disc.settings);
          setPhase("confirm");
        } else {
          setSettings(disc.success ? disc.settings : s);
          setPhase("manual");
        }
      } else {
        // Already attempted (failed/empty) but not dismissed → offer manual.
        setSettings(s);
        setPhase("manual");
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, pathname]);

  const close = useCallback(() => setPhase("hidden"), []);

  const handleDismiss = useCallback(async () => {
    setPhase("hidden");
    try { await dismissSitemapPrompt(projectId); } catch { /* best effort */ }
  }, [projectId]);

  const handleSave = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await saveSitemapUrl(projectId, url);
      console.log("[sitemap] saveSitemapUrl trace:", res.trace);
      if (res.success) {
        setSettings(res.settings);
        setPhase("confirm");
      } else {
        setError(res.error);
      }
    } finally {
      setBusy(false);
    }
  }, [projectId, url]);

  if (phase === "hidden") {
    // Keep the verify modal mountable even after the dialog closes.
    return settings ? (
      <SitemapLinksModal
        open={modalOpen}
        projectId={projectId}
        totalHint={settings.urlCount}
        onClose={() => setModalOpen(false)}
      />
    ) : null;
  }

  return (
    <>
      <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden />
        <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated shadow-xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-violet/10">
                {phase === "confirm" ? (
                  <Sparkles className="h-5 w-5 text-brand-violet" />
                ) : (
                  <Link2 className="h-5 w-5 text-brand-violet" />
                )}
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-text-primary">
                  {phase === "confirm" ? "Internal linking enhanced" : "Boost your internal linking"}
                </h2>
                <p className="mt-0.5 text-[12px] text-text-tertiary">New · improves your generated content</p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4">
            {phase === "confirm" ? (
              <p className="text-[13px] leading-relaxed text-text-secondary">
                We found your sitemap and captured{" "}
                <span className="font-semibold text-text-primary">
                  {settings?.urlCount.toLocaleString()} page{settings?.urlCount === 1 ? "" : "s"}
                </span>
                . New blogs, ebooks, and whitepapers will now link to your real content pages — not just your
                homepage. You can review or change this anytime in Settings.
              </p>
            ) : (
              <>
                <p className="mb-3 text-[13px] leading-relaxed text-text-secondary">
                  We couldn’t auto-detect your sitemap. Paste its URL and we’ll use your real pages as internal-link
                  targets in generated content. You can also add this later in Settings.
                </p>
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://yourdomain.com/sitemap.xml"
                  className="h-9 w-full rounded-[8px] border border-border-subtle bg-surface-secondary px-3 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:ring-1 focus:ring-brand-violet/50"
                />
                {error && <p className="mt-2 text-[12px] text-status-danger">{error}</p>}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-secondary/40 px-5 py-3">
            {phase === "confirm" ? (
              <>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="rounded-[8px] border border-border-subtle px-3.5 py-2 text-[13px] font-medium text-text-secondary transition-all hover:border-brand-violet/40 hover:text-text-primary"
                >
                  Verify pages
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-[8px] bg-brand-violet px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-brand-violet/90 active:scale-[0.97]"
                >
                  <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4" /> Got it</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-[8px] px-3.5 py-2 text-[13px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={busy || !url.trim()}
                  className="rounded-[8px] bg-brand-violet px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-brand-violet/90 active:scale-[0.97] disabled:opacity-50"
                >
                  {busy ? <span className="inline-flex items-center gap-1.5"><Search className="h-4 w-4 animate-pulse" /> Fetching…</span> : "Save & fetch"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {settings && (
        <SitemapLinksModal
          open={modalOpen}
          projectId={projectId}
          totalHint={settings.urlCount}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
