"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Link2, RefreshCw, Check, AlertCircle, Eye, Search } from "lucide-react";
import {
  getSitemapSettings,
  saveSitemapUrl,
  refreshSitemap,
  type SitemapSettings,
} from "@/app/actions/sitemap-actions";
import { SitemapLinksModal } from "@/components/sitemap/SitemapLinksModal";

function StatusPill({ settings }: { settings: SitemapSettings }) {
  if (settings.status === "found") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-status-success/25 bg-status-success/10 px-3 py-1 text-[12px] font-semibold text-status-success">
        <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
        {settings.urlCount.toLocaleString()} page{settings.urlCount === 1 ? "" : "s"}
      </span>
    );
  }
  if (settings.status === "empty" || settings.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-coral/30 bg-brand-coral/10 px-3 py-1 text-[12px] font-semibold text-brand-coral">
        <AlertCircle className="h-3 w-3" />
        {settings.status === "empty" ? "No pages found" : "Not found"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 text-[12px] text-text-tertiary">
      Not set up
    </span>
  );
}

export function SitemapInternalLinkingSection() {
  const { id: projectId } = useParams<{ id: string }>();

  const [settings, setSettings] = useState<SitemapSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"save" | "refresh" | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    const res = await getSitemapSettings(projectId);
    if (res.success) {
      setSettings(res.settings);
      setUrl(res.settings.sitemapUrl);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSave = useCallback(async () => {
    setBusy("save");
    setFeedback(null);
    try {
      const res = await saveSitemapUrl(projectId, url);
      // Trace is console-logged per AGENTS.md so prod issues are debuggable.
      console.log("[sitemap] saveSitemapUrl trace:", res.trace);
      if (res.success) {
        setSettings(res.settings);
        setUrl(res.settings.sitemapUrl);
        setFeedback({ kind: "success", text: `Saved — ${res.settings.urlCount.toLocaleString()} pages captured.` });
      } else {
        setFeedback({ kind: "error", text: res.error });
      }
    } finally {
      setBusy(null);
    }
  }, [projectId, url]);

  const handleRefresh = useCallback(async () => {
    setBusy("refresh");
    setFeedback(null);
    try {
      const res = await refreshSitemap(projectId);
      console.log("[sitemap] refreshSitemap trace:", res.trace);
      if (res.success) {
        setSettings(res.settings);
        setUrl(res.settings.sitemapUrl);
        setFeedback({ kind: "success", text: `Refreshed — ${res.settings.urlCount.toLocaleString()} pages.` });
      } else {
        setFeedback({ kind: "error", text: res.error });
      }
    } finally {
      setBusy(null);
    }
  }, [projectId]);

  const syncedLabel = settings?.syncedAt
    ? new Date(settings.syncedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <section className="space-y-3">
      <h2 className="text-[15px] font-semibold text-text-primary">Sitemap &amp; Internal Linking</h2>

      <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border-subtle/60">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-primary">
              <Link2 className="h-4 w-4 text-brand-violet" />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-text-primary">Site pages for internal links</div>
              <p className="mt-0.5 text-[12px] text-text-tertiary">
                We pull your sitemap so generated content links to your real blog &amp; resource pages — not just the homepage.
              </p>
            </div>
          </div>
          {settings && !loading && <StatusPill settings={settings} />}
        </div>

        <div className="space-y-4 px-5 py-4">
          {settings?.needsMigration && (
            <div className="rounded-[10px] border border-brand-coral/25 bg-brand-coral/10 px-3 py-2.5 text-[12px] text-brand-coral">
              The sitemap migration hasn’t been applied to this database yet. Run
              <span className="font-mono"> supabase-migration-project-sitemap-internal-links.sql </span>
              in Supabase, then reload.
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Sitemap URL</label>
            <p className="mb-2 text-[11px] text-text-tertiary">
              Auto-detected from your domain. Override it here if your sitemap lives somewhere non-standard.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com/sitemap.xml"
                disabled={loading || settings?.needsMigration}
                className="h-9 flex-1 rounded-[8px] border border-border-subtle bg-surface-secondary px-3 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:ring-1 focus:ring-brand-violet/50 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={busy !== null || loading || settings?.needsMigration || !url.trim()}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-brand-violet px-4 text-sm font-medium text-white transition-all hover:bg-brand-violet/90 active:scale-[0.97] disabled:opacity-50"
              >
                {busy === "save" ? <><Search className="h-4 w-4 animate-pulse" /> Fetching…</> : "Save & fetch"}
              </button>
            </div>
          </div>

          {feedback && (
            <div
              className={`rounded-[10px] border px-3 py-2.5 text-[12px] ${
                feedback.kind === "success"
                  ? "border-status-success/25 bg-status-success/10 text-status-success"
                  : "border-status-danger/25 bg-status-danger/10 text-status-danger"
              }`}
            >
              {feedback.text}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle/60 pt-3">
            <p className="text-[12px] text-text-tertiary">
              {syncedLabel ? `Last synced ${syncedLabel}` : "Not synced yet"}
              {settings?.source === "auto" && syncedLabel ? " · auto-detected" : ""}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                disabled={!settings || settings.urlCount === 0}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:border-brand-violet/40 hover:text-text-primary disabled:opacity-40"
              >
                <Eye className="h-3.5 w-3.5" />
                View links
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={busy !== null || loading || settings?.needsMigration}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:border-brand-violet/40 hover:text-text-primary disabled:opacity-50"
              >
                {busy === "refresh" ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : feedback?.kind === "success" ? (
                  <Check className="h-3.5 w-3.5 text-status-success" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {busy === "refresh" ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <SitemapLinksModal
        open={modalOpen}
        projectId={projectId}
        totalHint={settings?.urlCount}
        onClose={() => setModalOpen(false)}
        onRefresh={handleRefresh}
        refreshing={busy === "refresh"}
      />
    </section>
  );
}
