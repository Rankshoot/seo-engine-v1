"use client";

import { useState, useEffect, useCallback, useRef, type ChangeEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { projectsApi } from "@/frontend/api/projects";
import type { Project } from "@/lib/types";
import { RefreshCw, Check, AlertCircle, Palette, Upload, Wand2, X } from "lucide-react";
import { getGSCConnection, disconnectGSC, syncGSCMetrics } from "@/app/actions/gsc-actions";

// ─── option lists ────────────────────────────────────────────────────────────

const VISUAL_STYLES = [
  { value: "minimalist", label: "Minimalist" },
  { value: "bold", label: "Bold" },
  { value: "corporate", label: "Corporate" },
  { value: "modern", label: "Modern" },
  { value: "classic", label: "Classic" },
  { value: "playful", label: "Playful" },
  { value: "elegant", label: "Elegant" },
  { value: "technical", label: "Technical" },
] as const;

const DESIGN_PERSONALITIES = [
  { value: "professional", label: "Professional" },
  { value: "playful", label: "Playful" },
  { value: "luxury", label: "Luxury" },
  { value: "friendly", label: "Friendly" },
  { value: "authoritative", label: "Authoritative" },
  { value: "innovative", label: "Innovative" },
  { value: "trustworthy", label: "Trustworthy" },
  { value: "energetic", label: "Energetic" },
] as const;

const IMAGE_STYLES = [
  { value: "photorealistic", label: "Photorealistic" },
  { value: "flat-design", label: "Flat Design" },
  { value: "illustrated", label: "Illustrated" },
  { value: "abstract", label: "Abstract" },
  { value: "editorial", label: "Editorial" },
  { value: "data-visualization", label: "Data Visualization" },
  { value: "corporate-photography", label: "Corporate Photography" },
  { value: "infographic", label: "Infographic" },
] as const;

// ─── helpers ─────────────────────────────────────────────────────────────────

function isValidHex(val: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(val);
}

function normalizeHexInput(val: string): string {
  const v = val.trim();
  if (!v || v === "#") return "";
  return v.startsWith("#") ? v : `#${v}`;
}

function isDataUrl(url: string): boolean {
  return url.startsWith("data:");
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-[2px] border-border-subtle border-t-text-secondary"
      style={{ width: size, height: size }}
    />
  );
}

// ─── ColorField ───────────────────────────────────────────────────────────────

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const hex = normalizeHexInput(value);
  const valid = !hex || isValidHex(hex);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      <div className="flex items-center gap-2.5">
        <div
          className="relative w-9 h-9 rounded-[8px] border-2 border-border-subtle shrink-0 overflow-hidden cursor-pointer"
          style={{ backgroundColor: valid && hex ? hex : "#888888" }}
          title="Click to open colour picker"
        >
          <input
            type="color"
            value={valid && hex ? hex : "#888888"}
            onChange={e => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        <input
          type="text"
          value={value}
          maxLength={7}
          placeholder="#000000"
          onChange={e => onChange(e.target.value)}
          className={`flex-1 h-9 px-3 rounded-[8px] border text-sm font-mono bg-surface-secondary text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-brand-violet/50 transition-colors ${
            valid ? "border-border-subtle" : "border-brand-coral/60"
          }`}
        />
        {!valid && hex && <AlertCircle className="w-4 h-4 text-brand-coral shrink-0" />}
      </div>
    </div>
  );
}

// ─── SelectField ──────────────────────────────────────────────────────────────

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-sm text-text-primary outline-none focus:ring-1 focus:ring-brand-violet/50 transition-colors appearance-none"
      >
        <option value="">— not set —</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── PalettePreview ───────────────────────────────────────────────────────────

function PalettePreview({ colors }: { colors: string[] }) {
  if (!colors.length) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {colors.map((c, i) => (
        <div
          key={i}
          className="w-8 h-8 rounded-[6px] border border-border-subtle shadow-sm"
          style={{ backgroundColor: c }}
          title={c}
        />
      ))}
    </div>
  );
}

// ─── LogoPanel ────────────────────────────────────────────────────────────────

function LogoPanel({
  logoUrl,
  onUrlChange,
  onUpload,
}: {
  logoUrl: string;
  onUrlChange: (v: string) => void;
  onUpload: (dataUrl: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgError, setImgError] = useState(false);

  const hasLogo = Boolean(logoUrl);
  const showPreview = hasLogo && !imgError;

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      if (result) {
        onUpload(result);
        setImgError(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="px-5 py-4 flex items-start gap-4">
      <div className="relative flex items-center justify-center w-16 h-16 rounded-[10px] border border-border-subtle bg-white shadow-sm overflow-hidden shrink-0">
        {showPreview ? (
          <img
            src={logoUrl}
            alt="Brand logo"
            className="w-14 h-14 object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 text-text-tertiary">
            <Palette className="w-5 h-5" />
            <span className="text-[9px] font-medium">No logo</span>
          </div>
        )}
        {hasLogo && (
          <button
            onClick={() => { onUrlChange(""); setImgError(false); }}
            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-surface-tertiary/90 flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
            title="Remove logo"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-2">
        <div>
          <p className="text-xs font-medium text-text-secondary mb-1">Logo URL</p>
          <input
            type="url"
            value={isDataUrl(logoUrl) ? "" : logoUrl}
            onChange={e => { onUrlChange(e.target.value); setImgError(false); }}
            placeholder="https://example.com/logo.png"
            className="w-full h-8 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-brand-violet/50 transition-colors"
          />
          {isDataUrl(logoUrl) && (
            <p className="text-xs text-text-tertiary mt-0.5">Uploaded locally (stored as image data)</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">or</span>
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-border-subtle text-xs font-medium text-text-secondary hover:text-text-primary hover:border-brand-violet/40 hover:bg-surface-hover transition-all cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Upload image
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleFile}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // ── project / brand ─────────────────────────────────────────────────────────
  const { data: res, isLoading } = useQuery({
    queryKey: qk.project(projectId),
    queryFn: () => projectsApi.get(projectId),
    ...DEFAULT_QUERY_OPTIONS,
    staleTime: 30_000,
  });
  const project = res?.data as Project | null | undefined;

  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [visualStyle, setVisualStyle] = useState("");
  const [designPersonality, setDesignPersonality] = useState("");
  const [imageStyle, setImageStyle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    if (!project) return;
    setPrimaryColor(project.brand_primary_color ?? "");
    setSecondaryColor(project.brand_secondary_color ?? "");
    setAccentColor(project.brand_accent_color ?? "");
    setLogoUrl(project.brand_logo_url ?? "");
    setVisualStyle(project.brand_visual_style ?? "");
    setDesignPersonality(project.brand_design_personality ?? "");
    setImageStyle(project.brand_image_style ?? "");
  }, [project]);

  const nullIfEmpty = (v: string) => v.trim() || null;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const result = await projectsApi.saveBrand(projectId, {
        brand_primary_color: nullIfEmpty(primaryColor),
        brand_secondary_color: nullIfEmpty(secondaryColor),
        brand_accent_color: nullIfEmpty(accentColor),
        brand_logo_url: nullIfEmpty(logoUrl),
        brand_visual_style: nullIfEmpty(visualStyle),
        brand_design_personality: nullIfEmpty(designPersonality),
        brand_image_style: nullIfEmpty(imageStyle),
      });
      if (result.success) {
        setSaveStatus("success");
        queryClient.invalidateQueries({ queryKey: qk.project(projectId) });
        setTimeout(() => setSaveStatus("idle"), 2500);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }, [projectId, primaryColor, secondaryColor, accentColor, logoUrl, visualStyle, designPersonality, imageStyle, queryClient]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshStatus("idle");
    try {
      const result = await projectsApi.refreshBrand(projectId);
      if (result.success) {
        setRefreshStatus("success");
        await queryClient.invalidateQueries({ queryKey: qk.project(projectId) });
        setTimeout(() => setRefreshStatus("idle"), 2500);
      } else {
        setRefreshStatus("error");
        setTimeout(() => setRefreshStatus("idle"), 3000);
      }
    } catch {
      setRefreshStatus("error");
      setTimeout(() => setRefreshStatus("idle"), 3000);
    } finally {
      setRefreshing(false);
    }
  }, [projectId, queryClient]);

  const palette = (project?.brand_palette_json as string[] | null | undefined) ?? [];
  const hasExtracted = Boolean(project?.brand_extracted_at);
  const extractedAt = project?.brand_extracted_at
    ? new Date(project.brand_extracted_at).toLocaleDateString(undefined, { dateStyle: "medium" })
    : null;

  // ── GSC ─────────────────────────────────────────────────────────────────────
  const [gscConnected, setGscConnected] = useState<boolean | null>(null);
  const [gscSiteUrl, setGscSiteUrl] = useState<string | null>(null);
  const [gscLoading, setGscLoading] = useState(true);
  const [gscActionBusy, setGscActionBusy] = useState(false);
  const [gscMessage, setGscMessage] = useState("");
  const [gscError, setGscError] = useState("");

  useEffect(() => {
    const connected = searchParams.get("gsc");
    const err = searchParams.get("gsc_error");
    if (connected === "connected") setGscMessage("Google Search Console connected successfully.");
    if (err) setGscError(`GSC connection failed: ${err.replace(/_/g, " ")}`);
  }, [searchParams]);

  useEffect(() => {
    if (!projectId) return;
    getGSCConnection(projectId).then(r => {
      setGscConnected(r.connected);
      setGscSiteUrl(r.siteUrl ?? null);
      setGscLoading(false);
    });
  }, [projectId]);

  const handleConnect = () => {
    window.location.href = `/api/auth/gsc?projectId=${projectId}`;
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Google Search Console? This will delete all synced metrics.")) return;
    setGscActionBusy(true); setGscError(""); setGscMessage("");
    const r = await disconnectGSC(projectId);
    setGscActionBusy(false);
    if (r.success) { setGscConnected(false); setGscSiteUrl(null); setGscMessage("GSC disconnected."); }
    else { setGscError(r.error ?? "Failed to disconnect."); }
  };

  const handleSync = async () => {
    setGscActionBusy(true); setGscError(""); setGscMessage("");
    const r = await syncGSCMetrics(projectId);
    setGscActionBusy(false);
    if (r.success) setGscMessage(`Synced ${r.urlsIndexed} URLs from GSC.`);
    else setGscError(r.error ?? "Sync failed.");
  };

  return (
    <div className="relative space-y-8 pb-20 pl-4 pr-4 -mt-6 lg:-mt-8">
      {/* ── sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky -top-6 lg:-top-8 z-20 -mx-4 border-b border-border-subtle bg-surface-primary/95 px-4 pb-6 pt-6 lg:pt-8 backdrop-blur-sm">
        <h1 className="text-[26px] font-bold tracking-tight text-text-primary">Project Settings</h1>
        <p className="mt-1 text-[14px] text-text-tertiary">Manage brand identity and integrations.</p>
      </div>

      {/* ── GSC alerts ──────────────────────────────────────────────────────── */}
      {gscError && (
        <div className="rounded-[12px] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-300">{gscError}</div>
      )}
      {gscMessage && (
        <div className="rounded-[12px] border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-300">{gscMessage}</div>
      )}

      {/* ── Brand identity ───────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-text-primary">Brand Identity</h2>

        <div className="rounded-[12px] border border-border-subtle bg-surface-elevated divide-y divide-border-subtle overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Palette className="w-4 h-4 text-brand-violet shrink-0" />
              <p className="text-sm font-semibold text-text-primary">
                {hasExtracted
                  ? `Auto-extracted on ${extractedAt}. Edit below or re-extract.`
                  : "Not yet extracted. Click Re-extract to auto-detect from your website."}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-border-subtle text-xs font-medium text-text-secondary hover:text-text-primary hover:border-brand-violet/40 hover:bg-surface-hover transition-all disabled:opacity-50"
            >
              {refreshStatus === "success" ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : refreshStatus === "error" ? (
                <AlertCircle className="w-3.5 h-3.5 text-brand-coral" />
              ) : (
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              )}
              {refreshing ? "Extracting…" : refreshStatus === "success" ? "Done" : refreshStatus === "error" ? "Failed" : "Re-extract"}
            </button>
          </div>

          {/* Logo */}
          <LogoPanel logoUrl={logoUrl} onUrlChange={setLogoUrl} onUpload={setLogoUrl} />

          {/* Detected palette */}
          {palette.length > 0 && (
            <div className="px-5 py-4 space-y-2">
              <p className="text-xs font-medium text-text-secondary">Detected Palette</p>
              <PalettePreview colors={palette} />
            </div>
          )}

          {/* Color pickers */}
          <div className="px-5 py-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ColorField label="Primary Color" value={primaryColor} onChange={setPrimaryColor} />
            <ColorField label="Secondary Color" value={secondaryColor} onChange={setSecondaryColor} />
            <ColorField label="Accent Color" value={accentColor} onChange={setAccentColor} />
          </div>

          {/* Visual dropdowns */}
          <div className="px-5 py-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField label="Visual Style" value={visualStyle} options={VISUAL_STYLES} onChange={setVisualStyle} />
            <SelectField label="Brand Personality" value={designPersonality} options={DESIGN_PERSONALITIES} onChange={setDesignPersonality} />
            <SelectField label="Image Style" value={imageStyle} options={IMAGE_STYLES} onChange={setImageStyle} />
          </div>

          {/* Save footer */}
          <div className="px-5 py-4 flex items-center justify-between bg-surface-secondary/50">
            <p className="text-xs text-text-tertiary">
              Changes apply immediately to all future AI image generation.
            </p>
            <button
              onClick={handleSave}
              disabled={saving || isLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-brand-violet text-white text-sm font-medium hover:bg-brand-violet/90 active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {saveStatus === "success" ? (
                <><Check className="w-4 h-4" /> Saved</>
              ) : saveStatus === "error" ? (
                <><AlertCircle className="w-4 h-4" /> Error</>
              ) : saving ? (
                <><Wand2 className="w-4 h-4 animate-pulse" /> Saving…</>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 rounded-[8px] bg-surface-tertiary/50 animate-pulse" />
            ))}
          </div>
        )}
      </section>

      {/* ── Integrations ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-text-primary">Integrations</h2>

        {/* GSC card */}
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border-subtle/60">
            <div className="flex items-center gap-3">
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

          <div className="px-5 py-4 space-y-4">
            {gscConnected && gscSiteUrl && (
              <div className="flex items-center gap-2 rounded-[10px] border border-border-subtle bg-surface-secondary px-3 py-2.5">
                <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Property</span>
                <span className="text-[13px] font-mono text-text-primary ml-2">{gscSiteUrl}</span>
              </div>
            )}

            {!gscConnected && (
              <>
                <p className="text-[13px] text-text-tertiary leading-relaxed max-w-2xl">
                  Connect your Google Search Console account to see real search rankings, impressions, and CTR for every page.
                </p>
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
              </>
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

        {/* Coming soon */}
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { name: "Ahrefs", desc: "Import backlink and keyword ranking data." },
            { name: "Semrush", desc: "Pull keyword difficulty and traffic estimates." },
          ].map(it => (
            <div key={it.name} className="rounded-[14px] border border-border-subtle bg-surface-elevated/50 px-4 py-3 opacity-60">
              <div className="text-[13px] font-semibold text-text-secondary">
                {it.name} <span className="text-[11px] font-normal text-text-tertiary ml-1">coming soon</span>
              </div>
              <div className="text-[12px] text-text-tertiary mt-0.5">{it.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
