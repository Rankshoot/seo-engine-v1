"use client";

import { useState, useEffect, useCallback, useRef, type ChangeEvent } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { projectsApi } from "@/frontend/api/projects";
import { PageTitle } from "@/components/common";
import type { Project } from "@/lib/types";
import { RefreshCw, Check, AlertCircle, Palette, Upload, Wand2, X, Globe, Loader2, Plug } from "lucide-react";
import { testStrapiConnection } from "@/app/actions/blog-actions";

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
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  return (
    <div className="px-5 py-4 flex items-start gap-4">
      {/* Preview box */}
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

        {/* Clear button */}
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
  const queryClient = useQueryClient();

  const { data: res, isLoading } = useQuery({
    queryKey: qk.project(projectId),
    queryFn: () => projectsApi.get(projectId),
    ...DEFAULT_QUERY_OPTIONS,
    staleTime: 30_000,
  });

  const project = res?.data as Project | null | undefined;

  // ── form state ──────────────────────────────────────────────────────────────
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

  const [strapiBaseUrl, setStrapiBaseUrl] = useState("");
  const [strapiToken, setStrapiToken] = useState("");
  const [strapiTokenPlaceholder, setStrapiTokenPlaceholder] = useState(false);
  const [strapiSaving, setStrapiSaving] = useState(false);
  const [strapiSaveStatus, setStrapiSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [strapiTesting, setStrapiTesting] = useState(false);
  const [strapiTestResult, setStrapiTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!project) return;
    setPrimaryColor(project.brand_primary_color ?? "");
    setSecondaryColor(project.brand_secondary_color ?? "");
    setAccentColor(project.brand_accent_color ?? "");
    setLogoUrl(project.brand_logo_url ?? "");
    setVisualStyle(project.brand_visual_style ?? "");
    setDesignPersonality(project.brand_design_personality ?? "");
    setImageStyle(project.brand_image_style ?? "");
    setStrapiBaseUrl(project.strapi_base_url ?? "");
    setStrapiTokenPlaceholder(Boolean(project.strapi_api_token));
    setStrapiToken("");
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

  const handleStrapiSave = useCallback(async () => {
    setStrapiSaving(true);
    setStrapiSaveStatus("idle");
    setStrapiTestResult(null);
    try {
      const payload: { strapi_base_url: string | null; strapi_api_token?: string | null } = {
        strapi_base_url: strapiBaseUrl.trim() || null,
      };
      if (strapiToken.trim()) {
        payload.strapi_api_token = strapiToken.trim();
      }
      const result = await projectsApi.saveStrapi(projectId, payload);
      if (result.success) {
        setStrapiSaveStatus("success");
        if (strapiToken.trim()) setStrapiTokenPlaceholder(true);
        setStrapiToken("");
        queryClient.invalidateQueries({ queryKey: qk.project(projectId) });
        setTimeout(() => setStrapiSaveStatus("idle"), 2500);
      } else {
        setStrapiSaveStatus("error");
      }
    } catch {
      setStrapiSaveStatus("error");
    } finally {
      setStrapiSaving(false);
    }
  }, [projectId, strapiBaseUrl, strapiToken, queryClient]);

  const handleStrapiTest = useCallback(async () => {
    setStrapiTesting(true);
    setStrapiTestResult(null);
    try {
      const result = await testStrapiConnection(
        projectId,
        strapiBaseUrl.trim() || undefined,
        strapiToken.trim() || undefined,
      );
      setStrapiTestResult(result);
    } catch (e) {
      setStrapiTestResult({ ok: false, error: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setStrapiTesting(false);
    }
  }, [projectId, strapiBaseUrl, strapiToken]);

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

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <PageTitle>Settings</PageTitle>
        <p className="text-sm text-text-secondary mt-1">
          Manage your project&apos;s brand identity used for AI image generation.
        </p>
      </div>

      <section className="rounded-[12px] border border-border-subtle bg-surface-elevated divide-y divide-border-subtle overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Palette className="w-4 h-4 text-brand-violet shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Brand Identity</h2>
              <p className="text-xs text-text-tertiary mt-0.5">
                {hasExtracted
                  ? `Auto-extracted on ${extractedAt}. Edit below or re-extract from your website.`
                  : "Not yet extracted. Click Re-extract to auto-detect colors from your website."}
              </p>
            </div>
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
        <LogoPanel
          logoUrl={logoUrl}
          onUrlChange={setLogoUrl}
          onUpload={setLogoUrl}
        />

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
      </section>

      {/* ── Strapi CMS ─────────────────────────────────────────── */}
      <section className="rounded-[12px] border border-border-subtle bg-surface-elevated divide-y divide-border-subtle overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-2.5">
          <Plug className="w-4 h-4 text-brand-violet shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Strapi CMS</h2>
            <p className="text-xs text-text-tertiary mt-0.5">
              Connect a Strapi instance to publish generated content as drafts. Leave blank to disable.
            </p>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Base URL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Strapi Base URL</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" />
              <input
                type="url"
                value={strapiBaseUrl}
                onChange={e => { setStrapiBaseUrl(e.target.value); setStrapiTestResult(null); }}
                placeholder="https://your-strapi.com"
                className="w-full h-9 pl-8 pr-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-brand-violet/50 transition-colors"
              />
            </div>
          </div>

          {/* API Token */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">API Token</label>
            <input
              type="password"
              value={strapiToken}
              onChange={e => { setStrapiToken(e.target.value); setStrapiTestResult(null); }}
              placeholder={strapiTokenPlaceholder ? "••••••••  (saved — re-enter to change)" : "Paste your Strapi API token"}
              autoComplete="new-password"
              className="w-full h-9 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-brand-violet/50 transition-colors"
            />
            <p className="text-xs text-text-tertiary">
              Create a <strong>Custom</strong> token in Strapi → Settings → API Tokens with{" "}
              <code className="font-mono">create</code>,{" "}
              <code className="font-mono">find</code>,{" "}
              <code className="font-mono">findOne</code>, and{" "}
              <code className="font-mono">update</code> permissions on the <code className="font-mono">Article</code> content type only.
            </p>
          </div>

          {/* Test connection result */}
          {strapiTestResult && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-[8px] border ${
              strapiTestResult.ok
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"
                : "border-brand-coral/30 bg-brand-coral/5 text-brand-coral"
            }`}>
              {strapiTestResult.ok
                ? <Check className="w-3.5 h-3.5 shrink-0" />
                : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              <span>{strapiTestResult.ok ? "Connection successful" : (strapiTestResult.error ?? "Connection failed")}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-4 flex items-center justify-between gap-3 bg-surface-secondary/50">
          <button
            onClick={handleStrapiTest}
            disabled={strapiTesting || !strapiBaseUrl.trim() || (!strapiToken.trim() && !strapiTokenPlaceholder)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-border-subtle text-xs font-medium text-text-secondary hover:text-text-primary hover:border-brand-violet/40 hover:bg-surface-hover transition-all disabled:opacity-50"
          >
            {strapiTesting
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing…</>
              : <><Plug className="w-3.5 h-3.5" /> Test Connection</>}
          </button>

          <button
            onClick={handleStrapiSave}
            disabled={strapiSaving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-brand-violet text-white text-sm font-medium hover:bg-brand-violet/90 active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {strapiSaveStatus === "success" ? (
              <><Check className="w-4 h-4" /> Saved</>
            ) : strapiSaveStatus === "error" ? (
              <><AlertCircle className="w-4 h-4" /> Error</>
            ) : strapiSaving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              "Save Strapi Settings"
            )}
          </button>
        </div>
      </section>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 rounded-[8px] bg-surface-tertiary/50 animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}
