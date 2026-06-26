"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { integrationsApi } from "@/frontend/api/integrations";
import { Check, AlertCircle, Trash2, ExternalLink, Loader2, Plug2, ChevronRight, X } from "lucide-react";

type FormStatus = "idle" | "testing" | "saving" | "deleting" | "success" | "error";

function StrapiIcon() {
  return (
    <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
      <rect width="32" height="32" rx="8" fill="#4945FF" />
      <path d="M22 10H14a4 4 0 0 0-4 4v2h8a4 4 0 0 1 4 4v2h2a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2Z" fill="white" opacity=".9" />
      <path d="M10 16v4a4 4 0 0 0 4 4h8v-2a4 4 0 0 0-4-4h-8Z" fill="white" opacity=".6" />
    </svg>
  );
}

function ConnectedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-status-success bg-status-success/10 border border-status-success/20 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-status-success" />
      Connected
    </span>
  );
}

function IntegrationCard({
  name,
  description,
  icon,
  connected,
  maskedToken,
  baseUrl,
  collectionName,
  collectionLabel = "Collection",
  onEdit,
  onDelete,
  deleting,
}: {
  name: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
  maskedToken?: string;
  baseUrl?: string;
  collectionName?: string;
  collectionLabel?: string;
  onEdit: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  return (
    <div className={`rounded-xl border transition-all ${
      connected
        ? "border-status-success/30 bg-status-success/5"
        : "border-border-subtle bg-surface-primary hover:border-border-strong hover:bg-surface-secondary/50"
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[10px] border border-border-subtle bg-surface-primary flex items-center justify-center shrink-0 shadow-sm">
              {icon}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[14px] font-semibold text-text-primary">{name}</span>
                {connected && <ConnectedBadge />}
              </div>
              <p className="text-[12px] text-text-tertiary leading-snug">{description}</p>
            </div>
          </div>

          {connected ? (
            <div className="flex items-center gap-1.5 shrink-0">
              {baseUrl && (
                <a
                  href={baseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 flex items-center justify-center rounded-[6px] border border-border-subtle text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition-all"
                  title="Open Strapi admin"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                onClick={onDelete}
                disabled={deleting}
                className="w-7 h-7 flex items-center justify-center rounded-[6px] border border-border-subtle text-text-tertiary hover:text-status-danger hover:border-status-danger/30 hover:bg-status-danger/5 transition-all disabled:opacity-50"
                title="Disconnect"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ) : (
            <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" />
          )}
        </div>

        {connected && baseUrl && (
          <div className="mt-3 pt-3 border-t border-status-success/15 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-text-tertiary mb-0.5" style={{ fontFamily: "CohereMono, monospace" }}>URL</p>
              <p className="text-[11px] text-text-secondary truncate font-mono">{baseUrl}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-text-tertiary mb-0.5" style={{ fontFamily: "CohereMono, monospace" }}>{collectionLabel}</p>
              <p className="text-[11px] text-text-secondary truncate font-mono">{collectionName || "articles"}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-text-tertiary mb-0.5" style={{ fontFamily: "CohereMono, monospace" }}>Token</p>
              <p className="text-[11px] text-text-secondary font-mono">{maskedToken}</p>
            </div>
          </div>
        )}

        {connected && (
          <button
            onClick={onEdit}
            className="mt-3 w-full text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors text-left"
          >
            Update credentials →
          </button>
        )}

        {!connected && (
          <button
            onClick={onEdit}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-[8px] border border-border-subtle text-[12px] font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-secondary transition-all"
          >
            <Plug2 className="w-3.5 h-3.5" />
            Connect {name}
          </button>
        )}
      </div>
    </div>
  );
}

function StrapiForm({
  existing,
  onClose,
  onSaved,
}: {
  existing?: { base_url: string; masked_token: string; collection_name: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [baseUrl,  setBaseUrl]  = useState(existing?.base_url ?? "");
  const [apiToken, setApiToken] = useState("");
  const [collectionName, setCollectionName] = useState(existing?.collection_name ?? "articles");
  const [status,   setStatus]   = useState<FormStatus>("idle");
  const [message,  setMessage]  = useState("");

  const busy = status === "testing" || status === "saving";

  const handleTest = async () => {
    if (!baseUrl || !apiToken) { setMessage("Fill in both fields first"); return; }
    setStatus("testing"); setMessage("");
    const r = await integrationsApi.testUserStrapi({ base_url: baseUrl, api_token: apiToken });
    setStatus(r.success ? "success" : "error");
    setMessage(r.success ? "Connection successful!" : r.error ?? "Connection failed");
  };

  const handleSave = async () => {
    if (!baseUrl || !apiToken) { setMessage("Both fields are required"); return; }
    setStatus("saving"); setMessage("");
    const r = await integrationsApi.saveUserStrapi({
      base_url: baseUrl,
      api_token: apiToken,
      collection_name: collectionName,
    });
    if (r.success) {
      setStatus("success");
      onSaved();
    } else {
      setStatus("error");
      setMessage(r.error ?? "Could not save integration");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface-primary shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <StrapiIcon />
            <div>
              <h3 className="text-[14px] font-semibold text-text-primary">
                {existing ? "Update Strapi credentials" : "Connect Strapi"}
              </h3>
              <p className="text-[11px] text-text-tertiary">Publish blogs directly to your Strapi CMS</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-[6px] text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[12px] font-semibold text-text-secondary block mb-1.5">
              Strapi URL <span className="text-status-danger">*</span>
            </label>
            <input
              type="url"
              value={baseUrl}
              onChange={e => { setBaseUrl(e.target.value); setMessage(""); setStatus("idle"); }}
              placeholder="https://your-strapi.com"
              className="w-full h-9 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-brand-action/50 transition-colors"
            />
            <p className="text-[11px] text-text-tertiary mt-1">Your Strapi instance URL — no trailing slash.</p>
          </div>

          <div>
            <label className="text-[12px] font-semibold text-text-secondary block mb-1.5">
              API Token <span className="text-status-danger">*</span>
            </label>
            <input
              type="password"
              value={apiToken}
              onChange={e => { setApiToken(e.target.value); setMessage(""); setStatus("idle"); }}
              placeholder={existing ? "Enter new token to rotate" : "Paste your full-access API token"}
              className="w-full h-9 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-brand-action/50 transition-colors font-mono"
            />
            <p className="text-[11px] text-text-tertiary mt-1">
              Strapi admin → Settings → API Tokens → Create → <strong>Full access</strong>
            </p>
          </div>

          <div>
            <label className="text-[12px] font-semibold text-text-secondary block mb-1.5">
              Collection Name <span className="text-status-danger">*</span>
            </label>
            <input
              type="text"
              value={collectionName}
              onChange={e => { setCollectionName(e.target.value); setMessage(""); setStatus("idle"); }}
              placeholder="e.g. articles"
              className="w-full h-9 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-brand-action/50 transition-colors"
            />
            <p className="text-[11px] text-text-tertiary mt-1">
              The Strapi Content-Type API ID (plural, e.g. <code>articles</code> or <code>blogs</code>).
            </p>
          </div>

          {message && (
            <div className={`flex items-start gap-2 text-[12px] rounded-[8px] px-3 py-2.5 ${
              status === "success"
                ? "bg-status-success/10 text-status-success border border-status-success/20"
                : "bg-status-danger/10 text-status-danger border border-status-danger/20"
            }`}>
              {status === "success"
                ? <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              {message}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-5 pb-5">
          <button
            onClick={handleTest}
            disabled={busy || !baseUrl || !apiToken}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] border border-border-subtle text-[12px] font-medium text-text-secondary hover:text-text-primary transition-all disabled:opacity-50"
          >
            {status === "testing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Test Connection
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !baseUrl || !apiToken}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-brand-action text-white text-[12px] font-semibold hover:opacity-90 transition-all disabled:opacity-50"
          >
            {status === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {existing ? "Update" : "Save & Connect"}
          </button>
          <button
            onClick={onClose}
            className="ml-auto px-3 py-2 text-[12px] text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function WordPressIcon() {
  return (
    <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
      <rect width="32" height="32" rx="8" fill="#21759B" />
      <path d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6Zm-6.9 10a6.9 6.9 0 0 1 .547-2.71L13.1 20.2A6.908 6.908 0 0 1 9.1 16Zm6.9 6.9a6.884 6.884 0 0 1-1.96-.284l2.083-6.05 2.133 5.847a.213.213 0 0 0 .016.032A6.906 6.906 0 0 1 16 22.9ZM17.1 13c.484-.025.92-.077.92-.077a.37.37 0 0 0-.047-.74s-1.302.103-2.143.103c-.79 0-2.117-.103-2.117-.103a.37.37 0 1 0-.046.74s.41.052.843.077l1.253 3.433L13.74 21l-3.29-9.79A6.9 6.9 0 0 1 16 9.1c1.8 0 3.445.649 4.71 1.72-.03-.002-.058-.007-.089-.007a1.36 1.36 0 0 0-1.32 1.4c0 .65.376 1.2.776 1.848.301.527.651 1.202.651 2.178 0 .677-.26 1.462-.601 2.554l-.789 2.634L17.1 13ZM19.62 21.6l2.118-6.12c.396-.99.527-1.782.527-2.488 0-.256-.017-.494-.048-.717A6.898 6.898 0 0 1 22.9 16a6.898 6.898 0 0 1-3.28 5.6Z" fill="white" />
    </svg>
  );
}

function WordPressForm({
  existing,
  onClose,
  onSaved,
}: {
  existing?: { base_url: string; masked_token: string; username: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [baseUrl, setBaseUrl] = useState(existing?.base_url ?? "");
  const [username, setUsername] = useState(existing?.username ?? "");
  const [appPassword, setAppPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");

  const busy = status === "testing" || status === "saving";
  const ready = Boolean(baseUrl && username && appPassword);

  const handleTest = async () => {
    if (!ready) { setMessage("Fill in all three fields first"); return; }
    setStatus("testing"); setMessage("");
    const r = await integrationsApi.testUserWordPress({ base_url: baseUrl, username, app_password: appPassword });
    setStatus(r.success ? "success" : "error");
    setMessage(r.success ? "Connection successful!" : r.error ?? "Connection failed");
  };

  const handleSave = async () => {
    if (!ready) { setMessage("All three fields are required"); return; }
    setStatus("saving"); setMessage("");
    const r = await integrationsApi.saveUserWordPress({ base_url: baseUrl, username, app_password: appPassword });
    if (r.success) { setStatus("success"); onSaved(); }
    else { setStatus("error"); setMessage(r.error ?? "Could not save integration"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface-primary shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <WordPressIcon />
            <div>
              <h3 className="text-[14px] font-semibold text-text-primary">
                {existing ? "Update WordPress credentials" : "Connect WordPress"}
              </h3>
              <p className="text-[11px] text-text-tertiary">Publish blogs directly to your WordPress site</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-[6px] text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-[12px] font-semibold text-text-secondary block mb-1.5">
              Site URL <span className="text-status-danger">*</span>
            </label>
            <input
              type="url"
              value={baseUrl}
              onChange={e => { setBaseUrl(e.target.value); setMessage(""); setStatus("idle"); }}
              placeholder="https://yourblog.com"
              className="w-full h-9 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-brand-action/50 transition-colors"
            />
            <p className="text-[11px] text-text-tertiary mt-1">Your WordPress site URL — no trailing slash.</p>
          </div>

          <div>
            <label className="text-[12px] font-semibold text-text-secondary block mb-1.5">
              Username <span className="text-status-danger">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setMessage(""); setStatus("idle"); }}
              placeholder="your-wp-username"
              className="w-full h-9 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-brand-action/50 transition-colors"
            />
          </div>

          <div>
            <label className="text-[12px] font-semibold text-text-secondary block mb-1.5">
              Application Password <span className="text-status-danger">*</span>
            </label>
            <input
              type="password"
              value={appPassword}
              onChange={e => { setAppPassword(e.target.value); setMessage(""); setStatus("idle"); }}
              placeholder={existing ? "Enter a new application password to rotate" : "xxxx xxxx xxxx xxxx xxxx xxxx"}
              className="w-full h-9 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-brand-action/50 transition-colors font-mono"
            />
            <p className="text-[11px] text-text-tertiary mt-1">
              WordPress admin → Users → Profile → <strong>Application Passwords</strong>. Needs an Editor or Admin account to publish.
            </p>
          </div>

          {message && (
            <div className={`flex items-start gap-2 text-[12px] rounded-[8px] px-3 py-2.5 ${
              status === "success"
                ? "bg-status-success/10 text-status-success border border-status-success/20"
                : "bg-status-danger/10 text-status-danger border border-status-danger/20"
            }`}>
              {status === "success"
                ? <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              {message}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 pb-5">
          <button
            onClick={handleTest}
            disabled={busy || !ready}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] border border-border-subtle text-[12px] font-medium text-text-secondary hover:text-text-primary transition-all disabled:opacity-50"
          >
            {status === "testing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Test Connection
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !ready}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-brand-action text-white text-[12px] font-semibold hover:opacity-90 transition-all disabled:opacity-50"
          >
            {status === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {existing ? "Update" : "Save & Connect"}
          </button>
          <button
            onClick={onClose}
            className="ml-auto px-3 py-2 text-[12px] text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function StrapiIntegrationSection() {
  const queryClient = useQueryClient();
  const [showForm,   setShowForm]   = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [showWpForm, setShowWpForm] = useState(false);
  const [wpDeleting, setWpDeleting] = useState(false);

  const { data: res, isLoading } = useQuery({
    queryKey: ["user-cms-integration"],
    queryFn:  () => integrationsApi.getUserStrapi(),
    staleTime: 60_000,
  });

  const { data: wpRes } = useQuery({
    queryKey: ["user-wordpress-integration"],
    queryFn:  () => integrationsApi.getUserWordPress(),
    staleTime: 60_000,
  });

  const existing = res?.success ? res.data : null;
  const wpExisting = wpRes?.success ? wpRes.data : null;

  const handleDelete = async () => {
    if (!confirm("Disconnect Strapi? You can reconnect at any time.")) return;
    setDeleting(true);
    await integrationsApi.deleteUserStrapi();
    setDeleting(false);
    void queryClient.invalidateQueries({ queryKey: ["user-cms-integration"] });
  };

  const handleSaved = () => {
    setShowForm(false);
    void queryClient.invalidateQueries({ queryKey: ["user-cms-integration"] });
    void queryClient.invalidateQueries({ queryKey: ["user-cms-integration"] });
  };

  const handleWpDelete = async () => {
    if (!confirm("Disconnect WordPress? You can reconnect at any time.")) return;
    setWpDeleting(true);
    await integrationsApi.deleteUserWordPress();
    setWpDeleting(false);
    void queryClient.invalidateQueries({ queryKey: ["user-wordpress-integration"] });
  };

  const handleWpSaved = () => {
    setShowWpForm(false);
    void queryClient.invalidateQueries({ queryKey: ["user-wordpress-integration"] });
  };

  return (
    <>
      {showForm && (
        <StrapiForm
          existing={existing}
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}

      {showWpForm && (
        <WordPressForm
          existing={wpExisting}
          onClose={() => setShowWpForm(false)}
          onSaved={handleWpSaved}
        />
      )}

      <section>
        {/* Section heading */}
        <div className="mb-4">
          <h2 className="text-[16px] font-bold text-text-primary">Integrations</h2>
          <p className="text-[13px] text-text-secondary mt-0.5">
            Connect your CMS to publish generated content with one click.
          </p>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-border-subtle p-6 flex items-center gap-2 text-[12px] text-text-tertiary">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading integrations…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {/* Strapi card */}
            <IntegrationCard
              name="Strapi"
              description="Headless CMS — publish blogs, whitepapers, and ebooks directly."
              icon={<StrapiIcon />}
              connected={Boolean(existing)}
              maskedToken={existing?.masked_token}
              baseUrl={existing?.base_url}
              collectionName={existing?.collection_name}
              onEdit={() => setShowForm(true)}
              onDelete={handleDelete}
              deleting={deleting}
            />

            {/* WordPress */}
            <IntegrationCard
              name="WordPress"
              description="Publish blogs directly to your WordPress site via the REST API."
              icon={<WordPressIcon />}
              connected={Boolean(wpExisting)}
              maskedToken={wpExisting?.masked_token}
              baseUrl={wpExisting?.base_url}
              collectionName={wpExisting?.username}
              collectionLabel="User"
              onEdit={() => setShowWpForm(true)}
              onDelete={handleWpDelete}
              deleting={wpDeleting}
            />

            {/* Contentful — coming soon */}
            <div className="rounded-xl border border-border-subtle bg-surface-primary p-4 opacity-50 select-none">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[10px] border border-border-subtle bg-surface-secondary flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
                    <rect width="32" height="32" rx="8" fill="#2478CC" />
                    <path d="M12.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM10.17 21.83A8 8 0 0 1 10.17 10.17a1.5 1.5 0 0 0-2.12-2.12 11 11 0 0 0 0 15.56 1.5 1.5 0 0 0 2.12-2.12v.34ZM21.83 10.17a1.5 1.5 0 0 0 2.12-2.12 11 11 0 0 0-15.56 0 1.5 1.5 0 0 0 2.12 2.12 8 8 0 0 1 11.32 0ZM19.5 27a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" fill="white" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[14px] font-semibold text-text-primary">Contentful</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary border border-border-subtle px-2 py-0.5 rounded-full">Coming soon</span>
                  </div>
                  <p className="text-[12px] text-text-tertiary">Push content to Contentful spaces and environments.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
