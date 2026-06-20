"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getGSCConnection, disconnectGSC, syncGSCMetrics } from "@/app/actions/gsc-actions";

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-[2px] border-border-subtle border-t-text-secondary"
      style={{ width: size, height: size }}
    />
  );
}

export default function ProjectSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const [gscConnected, setGscConnected] = useState<boolean | null>(null);
  const [gscSiteUrl, setGscSiteUrl] = useState<string | null>(null);
  const [gscLoading, setGscLoading] = useState(true);
  const [gscActionBusy, setGscActionBusy] = useState(false);
  const [gscMessage, setGscMessage] = useState("");
  const [gscError, setGscError] = useState("");

  // Handle OAuth redirect params
  useEffect(() => {
    const connected = searchParams.get("gsc");
    const err = searchParams.get("gsc_error");
    if (connected === "connected") setGscMessage("Google Search Console connected successfully.");
    if (err) setGscError(`GSC connection failed: ${err.replace(/_/g, " ")}`);
  }, [searchParams]);

  useEffect(() => {
    if (!projectId) return;
    getGSCConnection(projectId).then(res => {
      setGscConnected(res.connected);
      setGscSiteUrl(res.siteUrl ?? null);
      setGscLoading(false);
    });
  }, [projectId]);

  const handleConnect = () => {
    window.location.href = `/api/auth/gsc?projectId=${projectId}`;
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Google Search Console? This will delete all synced metrics.")) return;
    setGscActionBusy(true); setGscError(""); setGscMessage("");
    const res = await disconnectGSC(projectId);
    setGscActionBusy(false);
    if (res.success) { setGscConnected(false); setGscSiteUrl(null); setGscMessage("GSC disconnected."); }
    else { setGscError(res.error ?? "Failed to disconnect."); }
  };

  const handleSync = async () => {
    setGscActionBusy(true); setGscError(""); setGscMessage("");
    const res = await syncGSCMetrics(projectId);
    setGscActionBusy(false);
    if (res.success) setGscMessage(`Synced ${res.urlsIndexed} URLs from GSC.`);
    else setGscError(res.error ?? "Sync failed.");
  };

  return (
    <div className="relative space-y-8 pb-20 pl-4 pr-4 -mt-6 lg:-mt-8">
      {/* ── sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky -top-6 lg:-top-8 z-20 -mx-4 border-b border-border-subtle bg-surface-primary/95 px-4 pb-6 pt-6 lg:pt-8 backdrop-blur-sm">
        <h1 className="text-[26px] font-bold tracking-tight text-text-primary">Project Settings</h1>
        <p className="mt-1 text-[14px] text-text-tertiary">Manage integrations and project-level configuration.</p>
      </div>

      {/* ── alerts ──────────────────────────────────────────────────────────── */}
      {gscError && (
        <div className="rounded-[12px] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-300">{gscError}</div>
      )}
      {gscMessage && (
        <div className="rounded-[12px] border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-300">{gscMessage}</div>
      )}

      {/* ── GSC integration card ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-text-primary">Integrations</h2>

        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border-subtle/60">
            <div className="flex items-center gap-3">
              {/* Google logo */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-primary">
                <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div>
                <div className="text-[14px] font-semibold text-text-primary">Google Search Console</div>
                <p className="text-[12px] text-text-tertiary mt-0.5">
                  Import real traffic, positions, and CTR data for your pages.
                </p>
              </div>
            </div>
            {gscLoading ? (
              <Spinner size={18} />
            ) : gscConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[12px] font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 text-[12px] text-text-tertiary">
                Not connected
              </span>
            )}
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {gscConnected && gscSiteUrl && (
              <div className="flex items-center gap-2 rounded-[10px] border border-border-subtle bg-surface-secondary px-3 py-2.5">
                <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Property</span>
                <span className="text-[13px] font-mono text-text-primary ml-2">{gscSiteUrl}</span>
              </div>
            )}

            {!gscConnected && (
              <p className="text-[13px] text-text-tertiary leading-relaxed max-w-2xl">
                Connect your Google Search Console account to see real search rankings, impressions, and CTR for every page. This data powers the Content Health opportunity finder and lets you prioritise which pages to fix first.
              </p>
            )}

            {/* What you get bullets */}
            {!gscConnected && (
              <ul className="space-y-1.5 text-[12px] text-text-tertiary">
                {[
                  "Real keyword positions (1–100) for every URL",
                  "Search impressions and click-through rates over 28 days",
                  "Auto-detect pages on page 2 with high impressions (easy wins)",
                  "Surface low-CTR pages that need title/meta fixes",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <svg className="w-3.5 h-3.5 mt-0.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {gscConnected ? (
                <>
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={gscActionBusy}
                    className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-primary px-5 text-[13px] font-semibold text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {gscActionBusy ? <><Spinner size={14} /> Syncing…</> : <>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                      Sync now
                    </>}
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={gscActionBusy}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/8 px-4 text-[13px] font-medium text-rose-400 hover:bg-rose-500/15 disabled:opacity-40 transition-all"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={gscActionBusy}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-primary px-5 text-[13px] font-semibold text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor" opacity="0.9"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor" opacity="0.9"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="currentColor" opacity="0.9"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="currentColor" opacity="0.9"/>
                  </svg>
                  Connect with Google
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── more integrations placeholder ─────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-text-primary">Coming soon</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { name: "Ahrefs", desc: "Import backlink and keyword ranking data." },
            { name: "Semrush", desc: "Pull keyword difficulty and traffic estimates." },
          ].map(it => (
            <div key={it.name} className="rounded-[14px] border border-border-subtle bg-surface-elevated/50 px-4 py-3 opacity-60">
              <div className="text-[13px] font-semibold text-text-secondary">{it.name}</div>
              <div className="text-[12px] text-text-tertiary mt-0.5">{it.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
