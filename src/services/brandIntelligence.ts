/**
 * Brand Intelligence — discover, extract, and enrich brand visual identity
 * from a company's website, then cache the result in the projects table.
 *
 * Pipeline:
 *   Phase 1 — Fetch homepage HTML, parse with Cheerio → logo URL + CSS colors
 *   Phase 2 — If logo found, send to Claude vision → dominant hex colors
 *   Phase 3 — Send all signals to Claude → visual_style, design_personality, image_style
 *   Phase 4 — Persist to projects table (brand_* columns)
 *
 * Run ONCE at project creation (fire-and-forget). Re-run on explicit user refresh.
 */

import { load as cheerioLoad } from "cheerio";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrandProfile {
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  brand_accent_color: string | null;
  brand_logo_url: string | null;
  brand_visual_style: string | null;
  brand_design_personality: string | null;
  brand_image_style: string | null;
  brand_palette_json: string[] | null;
  brand_extracted_at: string;
}

interface RawExtraction {
  logoUrl: string | null;
  faviconUrl: string | null;
  cssColors: string[];       // hex codes from meta/CSS/inline
  fetchedOk: boolean;
}

// ---------------------------------------------------------------------------
// Phase 1 — HTML extraction
// ---------------------------------------------------------------------------

async function extractFromWebsite(domain: string): Promise<RawExtraction> {
  const empty: RawExtraction = { logoUrl: null, faviconUrl: null, cssColors: [], fetchedOk: false };

  const hostname = domain.replace(/^https?:\/\//, "").replace(/\/.*/, "").trim();
  if (!hostname) return empty;

  let html = "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://${hostname}/`, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEO-Engine/1.0)" },
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return empty;
    html = await res.text();
  } catch {
    return empty;
  }

  const $ = cheerioLoad(html);
  const colors = new Set<string>();
  const HEX_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

  // --- Logo discovery (priority order) ---

  // Filter out placeholder/SVG/data-URI URLs that are not real brand assets
  const isUsableLogo = (url: string | undefined | null): boolean => {
    if (!url) return false;
    // Reject inline data URIs (SVG placeholders, base64 blobs)
    if (url.startsWith("data:")) return false;
    // Reject known placeholder services
    if (/placehold\.co|placeholder\.com|via\.placeholder|lorempixel|picsum|dummyimage|placeimg/i.test(url)) return false;
    // Reject tiny favicons (16px, 32px in filename)
    if (/favicon-?(16|32)x(16|32)/i.test(url)) return false;
    // Prefer raster images over SVG for color extraction (SVGs parsed fine for display)
    return true;
  };

  // 1. OG image (best — usually a high-res brand image)
  const ogImage = $('meta[property="og:image"]').attr("content") || $('meta[name="og:image"]').attr("content") || null;
  let logoUrl: string | null = isUsableLogo(ogImage) ? ogImage : null;

  // 2. Apple touch icon (higher-res than favicon, usually 180×180)
  let faviconUrl: string | null =
    $('link[rel="apple-touch-icon"]').attr("href") ||
    $('link[rel="apple-touch-icon-precomposed"]').attr("href") ||
    null;
  if (!isUsableLogo(faviconUrl)) faviconUrl = null;

  // 3. Explicit icon link — prefer PNG/SVG over .ico
  if (!faviconUrl) {
    const icons = $('link[rel="icon"], link[rel="shortcut icon"]').toArray();
    for (const el of icons) {
      const href = $(el).attr("href");
      if (isUsableLogo(href) && !/\.ico$/i.test(href ?? "")) {
        faviconUrl = href ?? null;
        break;
      }
    }
    // Fall back to .ico if nothing better found
    if (!faviconUrl) {
      const href = $('link[rel="icon"]').first().attr("href") || $('link[rel="shortcut icon"]').attr("href") || null;
      if (isUsableLogo(href)) faviconUrl = href;
    }
  }

  // 4. Look for an <img> whose src/alt/id/class suggests it's the logo
  if (!logoUrl) {
    $("img").each((_, el) => {
      if (logoUrl) return;
      const src = $(el).attr("src") || "";
      if (!isUsableLogo(src)) return;
      const alt = ($(el).attr("alt") || "").toLowerCase();
      const id  = ($(el).attr("id") || "").toLowerCase();
      const cls = ($(el).attr("class") || "").toLowerCase();
      if (/logo/i.test(src) || alt.includes("logo") || id.includes("logo") || cls.includes("logo")) {
        logoUrl = src;
      }
    });
  }

  // Resolve relative URLs
  const resolve = (url: string | null): string | null => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    if (url.startsWith("//")) return `https:${url}`;
    if (url.startsWith("/")) return `https://${hostname}${url}`;
    return `https://${hostname}/${url}`;
  };

  logoUrl    = resolve(logoUrl);
  faviconUrl = resolve(faviconUrl);

  // --- Color extraction from HTML/CSS ---

  // theme-color meta
  const themeMeta =
    $('meta[name="theme-color"]').attr("content") ||
    $('meta[name="msapplication-TileColor"]').attr("content") ||
    null;
  if (themeMeta) {
    const m = themeMeta.match(HEX_RE);
    if (m) m.forEach(c => colors.add(normalizeHex(c)));
  }

  // CSS variables matching brand/primary/secondary/accent patterns
  const inlineStyle = $("style").text() + " " + html;
  const cssVarRe = /--(?:primary|secondary|accent|brand|color-primary|color-secondary|main|foreground|background)[\w-]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi;
  let match: RegExpExecArray | null;
  while ((match = cssVarRe.exec(inlineStyle)) !== null) {
    colors.add(normalizeHex(match[1]));
    if (colors.size >= 10) break;
  }

  // Background/color on body/header/nav/footer (inline style attributes)
  ["body", "header", "nav", "footer", ".navbar", ".header"].forEach(sel => {
    const style = $(sel).attr("style") || "";
    const m2 = style.match(HEX_RE);
    if (m2) m2.forEach(c => colors.add(normalizeHex(c)));
  });

  // Also scan linked stylesheets (first external CSS file only — keep latency low)
  const firstLink = $('link[rel="stylesheet"]').first().attr("href");
  if (firstLink && colors.size < 4) {
    const cssUrl = resolve(firstLink);
    if (cssUrl) {
      try {
        const cssCtrl = new AbortController();
        const cssTimer = setTimeout(() => cssCtrl.abort(), 4000);
        const cssRes = await fetch(cssUrl, { signal: cssCtrl.signal }).finally(() => clearTimeout(cssTimer));
        if (cssRes.ok) {
          const cssText = await cssRes.text();
          let m3: RegExpExecArray | null;
          const cssVarRe2 = /--(?:primary|secondary|accent|brand|color-primary|main)[\w-]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi;
          while ((m3 = cssVarRe2.exec(cssText)) !== null) {
            colors.add(normalizeHex(m3[1]));
            if (colors.size >= 8) break;
          }
        }
      } catch { /* ignore */ }
    }
  }

  // Filter out near-white and near-black (boring/unusable for brand prompts)
  const interestingColors = [...colors].filter(c => !isNearWhiteOrBlack(c));

  return {
    logoUrl,
    faviconUrl,
    cssColors: interestingColors.slice(0, 6),
    fetchedOk: true,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — Logo color extraction via Claude vision
// ---------------------------------------------------------------------------

async function extractColorsFromLogo(imageUrl: string): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  // Fetch image and convert to base64
  let base64Data = "";
  let mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" = "image/png";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(imageUrl, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEO-Engine/1.0)" },
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return [];

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("jpeg") || ct.includes("jpg")) mediaType = "image/jpeg";
    else if (ct.includes("webp")) mediaType = "image/webp";
    else if (ct.includes("gif")) mediaType = "image/gif";
    else if (ct.includes("svg")) return []; // SVG — skip binary analysis

    const buf = await res.arrayBuffer();
    if (buf.byteLength > 5_000_000) return []; // skip images > 5MB

    base64Data = Buffer.from(buf).toString("base64");
  } catch {
    return [];
  }

  if (!base64Data) return [];

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Data },
            },
            {
              type: "text",
              text: "Extract the 1 to 3 most distinctive brand colors from this logo image. Reply with ONLY the hex color codes, comma-separated (e.g. #1a2b3c, #ff6600). No explanation.",
            },
          ],
        },
      ],
    });

    const raw = (msg.content[0] as { type: string; text?: string })?.text ?? "";
    const matches = raw.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
    return matches.map(normalizeHex).filter(c => !isNearWhiteOrBlack(c)).slice(0, 3);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — Claude AI brand enrichment
// ---------------------------------------------------------------------------

const brandEnrichmentSchema = z.object({
  primary_color:        z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("Primary brand color as 6-digit hex. Infer from company name/industry if unknown."),
  secondary_color:      z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  accent_color:         z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  palette:              z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(6),
  visual_style:         z.enum(["minimalist", "bold", "corporate", "modern", "classic", "playful", "elegant", "technical"]),
  design_personality:   z.enum(["professional", "playful", "luxury", "friendly", "authoritative", "innovative", "trustworthy", "energetic"]),
  image_style:          z.enum(["photorealistic", "flat-design", "illustrated", "abstract", "editorial", "data-visualization", "corporate-photography", "infographic"]),
});

type BrandEnrichmentResult = z.infer<typeof brandEnrichmentSchema>;

async function enrichWithAI(params: {
  company: string;
  niche: string;
  description: string;
  cssColors: string[];
  logoColors: string[];
}): Promise<BrandEnrichmentResult | null> {
  const { company, niche, description, cssColors, logoColors } = params;

  const allColors = [...new Set([...logoColors, ...cssColors])].slice(0, 6);
  const colorHint = allColors.length
    ? `Extracted colors from their website/logo: ${allColors.join(", ")}.`
    : "No colors were extractable from their website.";

  const prompt = `You are a brand intelligence analyst. Analyze this company and produce a structured brand profile.

Company: ${company}
Industry/Niche: ${niche}
Description: ${description || "(none provided)"}
${colorHint}

Produce a JSON brand profile. If extracted colors are available, use them as the palette. If not, infer a plausible brand palette from the company name and industry. Return valid JSON matching this schema exactly:

{
  "primary_color": "#hex6",
  "secondary_color": "#hex6 or null",
  "accent_color": "#hex6 or null",
  "palette": ["#hex1", "#hex2", ...up to 6],
  "visual_style": one of: minimalist|bold|corporate|modern|classic|playful|elegant|technical,
  "design_personality": one of: professional|playful|luxury|friendly|authoritative|innovative|trustworthy|energetic,
  "image_style": one of: photorealistic|flat-design|illustrated|abstract|editorial|data-visualization|corporate-photography|infographic
}`;

  try {
    const { aiGenerateStructured } = await import("@/services/ai/providers");
    const result = await aiGenerateStructured(
      "brand-intelligence",
      prompt,
      brandEnrichmentSchema,
      { temperature: 0.3, maxOutputTokens: 400 }
    );
    return result;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 4 — Persist to DB
// ---------------------------------------------------------------------------

async function saveBrandProfile(projectId: string, profile: BrandProfile): Promise<void> {
  await supabaseAdmin
    .from("projects")
    .update({
      brand_primary_color:    profile.brand_primary_color,
      brand_secondary_color:  profile.brand_secondary_color,
      brand_accent_color:     profile.brand_accent_color,
      brand_logo_url:         profile.brand_logo_url,
      brand_visual_style:     profile.brand_visual_style,
      brand_design_personality: profile.brand_design_personality,
      brand_image_style:      profile.brand_image_style,
      brand_palette_json:     profile.brand_palette_json,
      brand_extracted_at:     profile.brand_extracted_at,
      updated_at:             new Date().toISOString(),
    })
    .eq("id", projectId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full brand discovery pipeline. Runs phases 1–4 and returns the brand profile.
 * Safe to call fire-and-forget — all errors are caught internally.
 */
export async function discoverBrand(params: {
  projectId: string;
  domain: string;
  company: string;
  niche: string;
  description?: string;
}): Promise<BrandProfile | null> {
  const { projectId, domain, company, niche, description = "" } = params;

  try {
    // Phase 1 — HTML extraction
    const raw = await extractFromWebsite(domain);

    // Phase 2 — Logo color extraction via Claude vision (best-effort)
    let logoColors: string[] = [];
    const logoForVision = raw.logoUrl || raw.faviconUrl;
    if (logoForVision) {
      logoColors = await extractColorsFromLogo(logoForVision);
    }

    // Phase 3 — Claude enrichment
    const enriched = await enrichWithAI({
      company,
      niche,
      description,
      cssColors: raw.cssColors,
      logoColors,
    });

    // Build profile — prefer enriched over raw fallback
    const allColors = enriched?.palette?.length
      ? enriched.palette
      : [...new Set([...logoColors, ...raw.cssColors])].slice(0, 6);

    const profile: BrandProfile = {
      brand_primary_color:    enriched?.primary_color ?? logoColors[0] ?? raw.cssColors[0] ?? null,
      brand_secondary_color:  enriched?.secondary_color ?? logoColors[1] ?? raw.cssColors[1] ?? null,
      brand_accent_color:     enriched?.accent_color ?? logoColors[2] ?? raw.cssColors[2] ?? null,
      brand_logo_url:         raw.logoUrl ?? raw.faviconUrl ?? null,
      brand_visual_style:     enriched?.visual_style ?? null,
      brand_design_personality: enriched?.design_personality ?? null,
      brand_image_style:      enriched?.image_style ?? null,
      brand_palette_json:     allColors.length ? allColors : null,
      brand_extracted_at:     new Date().toISOString(),
    };

    // Phase 4 — Persist
    await saveBrandProfile(projectId, profile);

    return profile;
  } catch (err) {
    console.error("[brandIntelligence] discovery failed:", err);
    return null;
  }
}

/**
 * Read the stored brand profile for a project from the DB.
 */
export async function getBrandProfile(projectId: string): Promise<BrandProfile | null> {
  const { data } = await supabaseAdmin
    .from("projects")
    .select("brand_primary_color,brand_secondary_color,brand_accent_color,brand_logo_url,brand_visual_style,brand_design_personality,brand_image_style,brand_palette_json,brand_extracted_at")
    .eq("id", projectId)
    .maybeSingle();

  if (!data || !data.brand_extracted_at) return null;

  return {
    brand_primary_color:    data.brand_primary_color ?? null,
    brand_secondary_color:  data.brand_secondary_color ?? null,
    brand_accent_color:     data.brand_accent_color ?? null,
    brand_logo_url:         data.brand_logo_url ?? null,
    brand_visual_style:     data.brand_visual_style ?? null,
    brand_design_personality: data.brand_design_personality ?? null,
    brand_image_style:      data.brand_image_style ?? null,
    brand_palette_json:     (data.brand_palette_json as string[] | null) ?? null,
    brand_extracted_at:     data.brand_extracted_at,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeHex(hex: string): string {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex.split("").map(c => c + c).join("");
  }
  return `#${hex.toLowerCase().slice(0, 6)}`;
}

function isNearWhiteOrBlack(hex: string): boolean {
  const c = hex.replace(/^#/, "");
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (r + g + b) / 3;
  return lum > 240 || lum < 15;
}
