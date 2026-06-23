"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { integrationsApi } from "@/frontend/api/integrations";
import { Check, AlertCircle, Trash2, ExternalLink, Plug, Loader2 } from "lucide-react";

type Status = "idle" | "testing" | "saving" | "deleting" | "success" | "error";

export function StrapiIntegrationSection() {
  const queryClient = useQueryClient();

  const { data: res, isLoading } = useQuery({
    queryKey: ["user-cms-integration"],
    queryFn:  () => integrationsApi.getUserStrapi(),
    staleTime: 60_000,
  });

  const existing = res?.success ? res.data : null;

  const [baseUrl,    setBaseUrl]    = useState("");
  const [apiToken,   setApiToken]   = useState("");
  const [collection, setCollection] = useState("articles");
  const [status,     setStatus]     = useState<Status>("idle");
  const [message,    setMessage]    = useState("");
  const [showForm,   setShowForm]   = useState(false);

  useEffect(() => {
    if (existing) {
      setBaseUrl(existing.base_url);
      setCollection(existing.collection_name);
    }
  }, [existing]);

  const handleTest = async () => {
    if (!baseUrl || !apiToken) { setMessage("Fill in both fields to test"); return; }
    setStatus("testing"); setMessage("");
    const r = await integrationsApi.testUserStrapi({ base_url: baseUrl, api_token: apiToken });
    setStatus(r.success ? "success" : "error");
    setMessage(r.success ? "Connection successful!" : r.error ?? "Connection failed");
  };

  const handleSave = async () => {
    if (!baseUrl || !apiToken) { setMessage("Strapi URL and API token are required"); return; }
    setStatus("saving"); setMessage("");
    const r = await integrationsApi.saveUserStrapi({ base_url: baseUrl, api_token: apiToken, collection_name: collection });
    if (r.success) {
      setStatus("success");
      setMessage("Integration saved! Token: " + (r.masked_token ?? "saved"));
      setApiToken("");
      setShowForm(false);
      void queryClient.invalidateQueries({ queryKey: ["user-cms-integration"] });
    } else {
      setStatus("error");
      setMessage(r.error ?? "Could not save integration");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remove Strapi integration? You can reconnect later.")) return;
    setStatus("deleting"); setMessage("");
    const r = await integrationsApi.deleteUserStrapi();
    if (r.success) {
      setBaseUrl(""); setApiToken(""); setCollection("articles");
      setStatus("idle"); setMessage("");
      void queryClient.invalidateQueries({ queryKey: ["user-cms-integration"] });
    } else {
      setStatus("error");
      setMessage(r.error ?? "Could not remove integration");
    }
  };

  const busy = status === "testing" || status === "saving" || status === "deleting";

  return (
    <section className="rounded-[12px] border border-border-subtle bg-surface-elevated divide-y divide-border-subtle overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Plug className="w-4 h-4 text-brand-action shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-text-primary">CMS Integrations</h2>
            <p className="text-xs text-text-tertiary mt-0.5">
              Connect your Strapi instance to publish content with one click.
            </p>
          </div>
        </div>
        {!showForm && !existing && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-border-subtle text-xs font-medium text-text-secondary hover:text-text-primary hover:border-brand-action/40 hover:bg-surface-hover transition-all"
          >
            Connect Strapi
          </button>
        )}
      </div>

      {/* Connected state */}
      {existing && !showForm && (
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{existing.base_url}</p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  Collection: <code className="font-mono">{existing.collection_name}</code>
                  {" · "}Token: <code className="font-mono">{existing.masked_token}</code>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={existing.base_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-[6px] border border-border-subtle text-text-tertiary hover:text-text-primary transition-colors"
                title="Open Strapi admin"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => setShowForm(true)}
                className="px-3 py-1.5 rounded-[8px] border border-border-subtle text-xs font-medium text-text-secondary hover:text-text-primary transition-all"
              >
                Update
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="p-1.5 rounded-[6px] border border-border-subtle text-text-tertiary hover:text-rose-500 hover:border-rose-500/40 transition-colors disabled:opacity-50"
                title="Remove integration"
              >
                {status === "deleting" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connect / Edit form */}
      {(showForm || (!existing && !isLoading)) && (
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1.5">
                Strapi Base URL <span className="text-rose-500">*</span>
              </label>
              <input
                type="url"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://your-strapi.com"
                className="w-full h-9 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-brand-action/50 transition-colors"
              />
              <p className="text-[11px] text-text-tertiary mt-1">
                Your Strapi instance URL (no trailing slash).
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1.5">
                API Token <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                value={apiToken}
                onChange={e => setApiToken(e.target.value)}
                placeholder={existing ? "Enter new token to rotate" : "Paste your Strapi API token"}
                className="w-full h-9 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-brand-action/50 transition-colors font-mono"
              />
              <p className="text-[11px] text-text-tertiary mt-1">
                Create a full-access API token in Strapi → Settings → API Tokens.
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1.5">
                Collection API ID
              </label>
              <input
                type="text"
                value={collection}
                onChange={e => setCollection(e.target.value)}
                placeholder="articles"
                className="w-full h-9 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-brand-action/50 transition-colors font-mono"
              />
              <p className="text-[11px] text-text-tertiary mt-1">
                The plural API ID of your Strapi collection (default: articles).
              </p>
            </div>
          </div>

          {message && (
            <div
              className={`flex items-center gap-2 text-[12px] rounded-[8px] px-3 py-2 ${
                status === "success" || status === "idle"
                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-600 border border-rose-500/20"
              }`}
            >
              {status === "success" ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              {message}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleTest}
              disabled={busy || !baseUrl || !apiToken}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] border border-border-subtle text-xs font-medium text-text-secondary hover:text-text-primary transition-all disabled:opacity-50"
            >
              {status === "testing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Test Connection
            </button>
            <button
              onClick={handleSave}
              disabled={busy || !baseUrl || !apiToken}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-brand-action text-white text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50"
            >
              {status === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {existing ? "Update Integration" : "Save Integration"}
            </button>
            {showForm && (
              <button
                onClick={() => { setShowForm(false); setMessage(""); setStatus("idle"); setApiToken(""); }}
                className="px-4 py-2 rounded-[8px] text-xs font-medium text-text-tertiary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="px-5 py-4 flex items-center gap-2 text-xs text-text-tertiary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading integrations…
        </div>
      )}

      {/* Info footer */}
      <div className="px-5 py-3 bg-surface-secondary/50">
        <p className="text-[11px] text-text-tertiary leading-relaxed">
          Once connected, a <strong className="text-text-secondary">Publish to My CMS</strong> button will appear in every blog editor.
          Your API token is stored securely server-side and never exposed to the browser.
        </p>
      </div>
    </section>
  );
}
