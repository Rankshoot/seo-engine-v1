"use client";

import { useEffect, useState } from "react";
import { PageShell, Card, EmptyState, Input } from "@/components/common";
import {
  useAdminSettings,
  useGrantPlatformAdmin,
  useRevokePlatformAdmin,
  useUpdateAdminSettings,
} from "@/lib/query/admin-queries";
import { platformAdminMeetsMinRole } from "@/constants/enums/platform-admin-role";
import { PLATFORM_ADMIN_ROLES, type PlatformAdminRole } from "@/constants/enums/platform-admin-role";
import type {
  AdminPlatformProviders,
  AdminSettingsData,
  AdminSettingsPatch,
} from "@/types/admin-settings";
import { formatAdminDate } from "@/lib/admin/format";
import { cn } from "@/lib/cn";
import { useAdminMe } from "@/lib/query/admin-queries";
import { Skeleton } from "@/components/Skeleton";

const PROVIDER_LABELS: { key: keyof AdminPlatformProviders; label: string }[] = [
  { key: "ahrefs_enabled", label: "Ahrefs" },
  { key: "dataforseo_enabled", label: "DataForSEO" },
  { key: "dataforseo_fallback_enabled", label: "DataForSEO fallback" },
  { key: "gemini_enabled", label: "Gemini" },
  { key: "openai_enabled", label: "OpenAI (active)" },
  { key: "claude_enabled", label: "Claude (active)" },
];

const AHREFS_DETAIL_LABELS: { key: keyof AdminPlatformProviders; label: string }[] = [
  // Active endpoints
  { key: "ahrefs_matching_terms_enabled", label: "Keywords Explorer: matching-terms (active)" },
  { key: "ahrefs_related_terms_enabled", label: "Keywords Explorer: related-terms (active)" },
  { key: "ahrefs_organic_competitors_enabled", label: "Site Explorer: organic-competitors (active)" },
  { key: "ahrefs_organic_keywords_enabled", label: "Site Explorer: organic-keywords (active)" },
  // Disabled endpoints (cost optimisation)
  { key: "ahrefs_search_suggestions_enabled", label: "Keywords Explorer: search-suggestions" },
  { key: "ahrefs_keyword_overview_enabled", label: "Keywords Explorer: overview" },
  { key: "ahrefs_volume_history_enabled", label: "Keywords Explorer: volume-history" },
  { key: "ahrefs_volume_by_country_enabled", label: "Keywords Explorer: volume-by-country" },
  { key: "ahrefs_serp_overview_enabled", label: "SERP: serp-overview" },
  { key: "ahrefs_top_pages_enabled", label: "Site Explorer: top-pages" },
  { key: "ahrefs_url_organic_keywords_enabled", label: "Site Explorer: URL organic-keywords (Exact)" },
  { key: "ahrefs_domain_overview_enabled", label: "Site Explorer: metrics/domain-overview" },
  { key: "ahrefs_pages_by_internal_links_enabled", label: "Site Explorer: pages-by-internal-links" },
  { key: "ahrefs_crawled_pages_enabled", label: "Site Explorer: crawled-pages" },
  { key: "ahrefs_anchors_enabled", label: "Site Explorer: anchors" },
  { key: "ahrefs_rank_tracker_competitors_overview_enabled", label: "Rank Tracker: competitors-overview" },
  { key: "ahrefs_rank_tracker_competitors_pages_enabled", label: "Rank Tracker: competitors-pages" },
];

const ENV_LABELS: { key: keyof AdminSettingsData["envKeys"]; label: string }[] = [
  { key: "ahrefs", label: "AHREFS_API_KEY" },
  { key: "dataforseo", label: "DATAFORSEO_LOGIN/PASSWORD" },
  { key: "gemini", label: "GEMINI_API_KEY" },
  { key: "anthropic", label: "ANTHROPIC_API_KEY" },
  { key: "openai", label: "OPENAI_API_KEY" },
  { key: "serper", label: "SERPER_API_KEY" },
  { key: "clerk", label: "Clerk keys" },
  { key: "supabase", label: "Supabase keys" },
];

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-3 border-b border-border-subtle last:border-0",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span className="text-[13px] text-text-primary">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-action focus:ring-offset-2",
          checked ? "bg-brand-action" : "bg-border-strong"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface-elevated shadow ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}

export function AdminSettingsDashboard() {
  const { data, isLoading, isError, error, refetch } = useAdminSettings();
  const updateMutation = useUpdateAdminSettings();
  const grantMutation = useGrantPlatformAdmin();
  const revokeMutation = useRevokePlatformAdmin();

  const meQuery = useAdminMe();

  const isAdmin = meQuery.data ? platformAdminMeetsMinRole(meQuery.data.role, "admin") : false;
  const canEdit = isAdmin;

  const [draft, setDraft] = useState<AdminSettingsData | null>(null);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantRole, setGrantRole] = useState<PlatformAdminRole>("admin");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(() => setDraft(data), 0);
    return () => window.clearTimeout(timer);
  }, [data]);

  const handleSave = async (updatedDraft?: AdminSettingsData) => {
    const activeDraft = updatedDraft ?? draft;
    if (!activeDraft || !canEdit) return;
    setSaveMessage("Saving...");
    const patch: AdminSettingsPatch = {
      providers: activeDraft.providers,
      limits: activeDraft.limits,
      cache: activeDraft.cache,
      gemini: activeDraft.gemini,
      debug: activeDraft.debug,
      maintenance: activeDraft.maintenance,
      routing: activeDraft.routing,
      cost_controls: activeDraft.cost_controls,
    };
    try {
      await updateMutation.mutateAsync(patch);
      setSaveMessage("Settings saved.");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handleToggleProvider = (key: keyof AdminPlatformProviders, val: boolean) => {
    if (!draft) return;
    const nextDraft = {
      ...draft,
      providers: { ...draft.providers, [key]: val },
    };
    setDraft(nextDraft);
    void handleSave(nextDraft);
  };

  const handleToggleDebug = (key: string, val: boolean) => {
    if (!draft) return;
    const nextDraft = {
      ...draft,
      debug: { ...draft.debug, [key]: val },
    };
    setDraft(nextDraft);
    void handleSave(nextDraft);
  };

  const handleToggleMaintenance = (val: boolean) => {
    if (!draft) return;
    const nextDraft = {
      ...draft,
      maintenance: { ...draft.maintenance, enabled: val },
    };
    setDraft(nextDraft);
    void handleSave(nextDraft);
  };

  const handleGrant = async () => {
    if (!canEdit || !grantEmail.trim()) return;
    setAdminMessage(null);
    try {
      await grantMutation.mutateAsync({ email: grantEmail.trim(), role: grantRole });
      setGrantEmail("");
      setAdminMessage("Admin access granted.");
    } catch (e) {
      setAdminMessage(e instanceof Error ? e.message : "Grant failed");
    }
  };

  const handleRevoke = async (id: string) => {
    if (!canEdit) return;
    setAdminMessage(null);
    try {
      await revokeMutation.mutateAsync(id);
      setAdminMessage("Admin access revoked.");
    } catch (e) {
      setAdminMessage(e instanceof Error ? e.message : "Revoke failed");
    }
  };

  if (isLoading || !draft) {
    return (
      <PageShell title="Settings" subtitle="Platform configuration and admin access.">
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-card" />
          <Skeleton className="h-48 rounded-card" />
        </div>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell title="Settings" subtitle="Platform configuration and admin access.">
        <EmptyState
          title="Could not load settings"
          body={error instanceof Error ? error.message : "Unknown error"}
          action={
            <button
              type="button"
              onClick={() => refetch()}
              className="text-[13px] font-medium text-brand-action hover:underline"
            >
              Retry
            </button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Settings"
      subtitle={
        canEdit
          ? "Provider toggles, limits, and admin grants. Changes are audited."
          : "View-only — admin role required to edit."
      }
    >
      <div className="space-y-6">
        <Card padding="md">
          <h2 className="text-[14px] font-semibold text-text-primary mb-1">Environment keys</h2>
          <p className="text-[12px] text-text-tertiary mb-4">
            Configured on the server only — never stored in the database.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ENV_LABELS.map(({ key, label }) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-2"
              >
                <span className="text-[12px] text-text-secondary">{label}</span>
                <span
                  className={cn(
                    "text-[11px] font-medium px-2 py-0.5 rounded",
                    draft.envKeys[key]
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-rose-500/15 text-rose-400"
                  )}
                >
                  {draft.envKeys[key] ? "Set" : "Missing"}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card padding="md">
          <h2 className="text-[14px] font-semibold text-text-primary mb-4">Providers</h2>
          {PROVIDER_LABELS.map(({ key, label }) => (
            <ToggleRow
              key={key}
              label={label}
              checked={draft.providers[key]}
              disabled={!canEdit}
              onChange={(v) => handleToggleProvider(key, v)}
            />
          ))}
        </Card>

        {draft.providers.ahrefs_enabled && (
          <Card padding="md">
            <h2 className="text-[14px] font-semibold text-text-primary mb-1">Ahrefs API Controls</h2>
            <p className="text-[12px] text-text-tertiary mb-4">
              Turn off specific Ahrefs endpoints to control cost and credit usage.
            </p>
            <div className="space-y-1">
              {AHREFS_DETAIL_LABELS.map(({ key, label }) => (
                <ToggleRow
                  key={key}
                  label={label}
                  checked={draft.providers[key]}
                  disabled={!canEdit}
                  onChange={(v) => handleToggleProvider(key, v)}
                />
              ))}
            </div>
          </Card>
        )}

        <Card padding="md">
          <h2 className="text-[14px] font-semibold text-text-primary mb-4">Limits</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Max keywords / project
              </label>
              <Input
                type="number"
                min={1}
                disabled={!canEdit}
                value={draft.limits.max_keywords_per_project}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    limits: {
                      ...draft.limits,
                      max_keywords_per_project: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Max generations / project
              </label>
              <Input
                type="number"
                min={1}
                disabled={!canEdit}
                value={draft.limits.max_content_generations_per_project}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    limits: {
                      ...draft.limits,
                      max_content_generations_per_project: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
          </div>
        </Card>

        <Card padding="md">
          <h2 className="text-[14px] font-semibold text-text-primary mb-4">Debug & maintenance</h2>
          <ToggleRow
            label="Log full AI prompts/responses"
            checked={draft.debug.ai_logging_full_prompts}
            disabled={!canEdit}
            onChange={(v) => handleToggleDebug("ai_logging_full_prompts", v)}
          />
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Cache TTL (minutes)
              </label>
              <Input
                type="number"
                min={1}
                disabled={!canEdit}
                value={draft.cache.ttl_minutes}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cache: { ttl_minutes: Number(e.target.value) || 1 },
                  })
                }
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Default Gemini model
              </label>
              <Input
                disabled={!canEdit}
                value={draft.gemini.default_model}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    gemini: { default_model: e.target.value },
                  })
                }
              />
            </div>
          </div>
          <div className="mt-4">
            <ToggleRow
              label="Maintenance mode"
              checked={draft.maintenance.enabled}
              disabled={!canEdit}
              onChange={(v) => handleToggleMaintenance(v)}
            />
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5 mt-3">
              Maintenance message
            </label>
            <Input
              disabled={!canEdit}
              value={draft.maintenance.message}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  maintenance: { ...draft.maintenance, message: e.target.value },
                })
              }
              placeholder="Shown to users when maintenance is on"
            />
          </div>
        </Card>

        <Card padding="md">
          <h2 className="text-[14px] font-semibold text-text-primary mb-4">Model Routing</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(["blog", "ebook", "whitepaper", "linkedin", "assistant", "fallback"] as const).map((key) => (
              <div key={key}>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5 capitalize">
                  {key} Model
                </label>
                <select
                  disabled={!canEdit}
                  value={draft.routing[key]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      routing: {
                        ...draft.routing,
                        [key]: e.target.value,
                      },
                    })
                  }
                  className="w-full h-9 rounded-md border border-border-subtle bg-surface-elevated px-3 text-[13px] text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-action"
                >
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                  <option value="claude-opus-4-8">Claude Opus 4.8</option>
                  <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (20251001)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                </select>
              </div>
            ))}
          </div>
        </Card>

        <Card padding="md">
          <h2 className="text-[14px] font-semibold text-text-primary mb-4">Cost Controls & Budgets</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Global Monthly Limit (USD)
              </label>
              <Input
                type="number"
                min={0}
                disabled={!canEdit}
                value={draft.cost_controls.global_monthly_limit_usd}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cost_controls: {
                      ...draft.cost_controls,
                      global_monthly_limit_usd: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Global Daily Limit (USD)
              </label>
              <Input
                type="number"
                min={0}
                disabled={!canEdit}
                value={draft.cost_controls.global_daily_limit_usd}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cost_controls: {
                      ...draft.cost_controls,
                      global_daily_limit_usd: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Project Monthly Limit (USD)
              </label>
              <Input
                type="number"
                min={0}
                disabled={!canEdit}
                value={draft.cost_controls.project_monthly_limit_usd}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cost_controls: {
                      ...draft.cost_controls,
                      project_monthly_limit_usd: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                User Monthly Limit (USD)
              </label>
              <Input
                type="number"
                min={0}
                disabled={!canEdit}
                value={draft.cost_controls.user_monthly_limit_usd}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cost_controls: {
                      ...draft.cost_controls,
                      user_monthly_limit_usd: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Soft Limit Alert Threshold (%)
              </label>
              <Input
                type="number"
                min={0}
                max={100}
                disabled={!canEdit}
                value={draft.cost_controls.soft_limit_percent}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cost_controls: {
                      ...draft.cost_controls,
                      soft_limit_percent: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Warning Threshold (USD)
              </label>
              <Input
                type="number"
                min={0}
                disabled={!canEdit}
                value={draft.cost_controls.warning_threshold_usd}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cost_controls: {
                      ...draft.cost_controls,
                      warning_threshold_usd: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
          </div>
        </Card>

        {canEdit ? (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={updateMutation.isPending}
              className="h-9 px-5 rounded-md text-[13px] font-medium bg-brand-action text-white hover:opacity-90 disabled:opacity-50"
            >
              {updateMutation.isPending ? "Saving…" : "Save settings"}
            </button>
            {saveMessage ? (
              <p className="text-[13px] text-text-secondary">{saveMessage}</p>
            ) : null}
          </div>
        ) : null}

        <Card padding="md">
          <h2 className="text-[14px] font-semibold text-text-primary mb-1">Platform admins</h2>
          <p className="text-[12px] text-text-tertiary mb-4">
            Grant access by email. User must sign in with that email via Clerk.
          </p>

          <div className="overflow-x-auto rounded-md border border-border-subtle mb-4">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-secondary/50">
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase text-text-tertiary">
                    Email
                  </th>
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase text-text-tertiary">
                    Role
                  </th>
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase text-text-tertiary">
                    Added
                  </th>
                  {canEdit ? (
                    <th className="px-4 py-2 text-[11px] font-semibold uppercase text-text-tertiary" />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {draft.admins.map((row) => (
                  <tr key={row.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-2.5 text-text-primary">{row.email}</td>
                    <td className="px-4 py-2.5 capitalize text-text-secondary">{row.role}</td>
                    <td className="px-4 py-2.5 text-[12px] text-text-tertiary">
                      {formatAdminDate(row.createdAt)}
                    </td>
                    {canEdit ? (
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          disabled={revokeMutation.isPending}
                          onClick={() => void handleRevoke(row.id)}
                          className="text-[12px] text-rose-400 hover:underline disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit ? (
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                  Email
                </label>
                <Input
                  type="email"
                  value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                  placeholder="colleague@company.com"
                />
              </div>
              <div className="w-full sm:w-36">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                  Role
                </label>
                <select
                  value={grantRole}
                  onChange={(e) => setGrantRole(e.target.value as PlatformAdminRole)}
                  className="w-full h-9 rounded-md border border-border-subtle bg-surface-elevated px-3 text-[13px]"
                >
                  {PLATFORM_ADMIN_ROLES.filter((r) => r !== "owner").map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void handleGrant()}
                disabled={grantMutation.isPending || !grantEmail.trim()}
                className="h-9 px-4 rounded-md text-[13px] font-medium border border-border-subtle hover:bg-surface-hover disabled:opacity-50"
              >
                Grant access
              </button>
            </div>
          ) : null}

          {adminMessage ? (
            <p className="mt-3 text-[13px] text-text-secondary">{adminMessage}</p>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
}
