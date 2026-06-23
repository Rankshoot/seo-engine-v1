export interface BlogImageAsset {
  alt: string;
  url: string;
  prompt: string;
  placement: 'hero' | 'section' | 'summary';
}

interface GenerateBlogImagesInput {
  title: string;
  targetKeyword: string;
  articleType: string;
  niche: string;
  audience: string;
  company: string;
  wordCount: number;
}

interface GenerateContextualBlogImageInput {
  title: string;
  targetKeyword: string;
  articleType: string;
  niche: string;
  audience: string;
  company: string;
  imageAlt: string;
  contextBefore: string;
  contextAfter: string;
  /** Legacy fallback: simple hex array. Ignored when brandContext is provided. */
  brandColors?: string[] | null;
  /** Rich brand context from Brand Intelligence pipeline. Takes precedence over brandColors. */
  brandContext?: BrandContext | null;
  imageModel?: string | null;
}

export interface BrandColors {
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
}

/** Rich brand context from the Brand Intelligence pipeline. Injected into image prompts. */
export interface BrandContext {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  palette?: string[] | null;
  visualStyle?: string | null;       // e.g. "minimalist", "bold", "corporate"
  designPersonality?: string | null; // e.g. "professional", "playful", "luxury"
  imageStyle?: string | null;        // e.g. "photorealistic", "flat-design", "editorial"
}

// Lazy-loaded to avoid bundling server-only logging in edge/client contexts
async function getRecorder() {
  const [rec, cost] = await Promise.all([
    import("@/lib/admin/logging/record-provider-call"),
    import("@/lib/admin/logging/cost-estimates"),
  ]);
  return { recordAiCall: rec.recordAiCall, extractGeminiTokenUsage: rec.extractGeminiTokenUsage, estimateImageGenerationCostUsd: cost.estimateImageGenerationCostUsd };
}

const GEMINI_API_KEY = (process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY)?.trim() ?? "";
const GEMINI_IMAGE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent";
const IMAGEN_PREDICT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:predict";

const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";

// Current Imagen 4 models (use the :predict endpoint, different request/response format)
export const IMAGEN_MODELS = [
  "imagen-4.0-fast-generate-001",
  "imagen-4.0-generate-001",
  "imagen-4.0-ultra-generate-001",
];

// Current Gemini native image models (use the :generateContent endpoint)
export const GEMINI_IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
  "gemini-3-pro-image-preview",
];

export const BLOG_IMAGE_PLACEHOLDER_URL =
  'https://placehold.co/1600x900/27272a/3f3f46.png?text=Placeholder';

function assetWithPlaceholder(request: Omit<BlogImageAsset, 'url'>): BlogImageAsset {
  return { ...request, url: BLOG_IMAGE_PLACEHOLDER_URL };
}

/**
 * Normalizes all instances of SVG data URL placeholders in a markdown string
 * to the clean base64-encoded format. This prevents markdown parser errors
 * when loading existing blogs containing percent-encoded raw SVG content.
 */
export function normalizeMarkdownImages(content: string): string {
  if (!content) return content;
  
  // Clean up split markdown image brackets and parentheses
  const healed = content.replace(/!\[([^\]]*?)\]\s+\((https?:\/\/[^)\s]+|data:image\/[^)\s]+)\)/g, '![$1]($2)');

  return healed.replace(
    /(!\[[^\]]*\]\()(data:image\/svg\+xml[^)]*)(\))/gi,
    `$1${BLOG_IMAGE_PLACEHOLDER_URL}$3`
  );
}

/**
 * Fetches the primary brand colors and logo from a domain.
 * Lightweight: reads the homepage HTML and extracts theme-color meta tag + favicon.
 */
export async function fetchBrandColors(domain: string): Promise<BrandColors> {
  const empty: BrandColors = { primaryColor: null, secondaryColor: null, logoUrl: null };
  if (!domain) return empty;

  const hostname = domain.replace(/^https?:\/\//, "").replace(/\/.*/, "").trim();
  if (!hostname) return empty;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://${hostname}/`, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEO-Engine/1.0)" },
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return empty;

    const html = await res.text();

    // Extract theme-color
    const themeMatch = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))[^>]*/i)
      ?? html.match(/<meta[^>]+content=["'](#[0-9a-fA-F]{3,8})[^>]+name=["']theme-color["'][^>]*/i);
    const primaryColor = themeMatch?.[1] ?? null;

    // Extract a secondary color from CSS custom properties (first --primary or --brand)
    const cssVarMatch = html.match(/--(?:primary|brand|accent|color-primary|main)[^:]*:\s*(#[0-9a-fA-F]{3,8})/i);
    const secondaryColor = cssVarMatch?.[1] ?? null;

    // Extract favicon / logo URL
    const iconMatch = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i)
      ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon)["']/i);
    let logoUrl = iconMatch?.[1] ?? null;
    if (logoUrl && !logoUrl.startsWith("http")) {
      logoUrl = logoUrl.startsWith("/")
        ? `https://${hostname}${logoUrl}`
        : `https://${hostname}/${logoUrl}`;
    }

    return { primaryColor, secondaryColor, logoUrl };
  } catch {
    return empty;
  }
}

/**
 * Builds image placeholder markdown and inserts them at hero/section/summary positions.
 * Used during blog generation so images are manual (user-triggered) rather than auto-generated.
 */
export function insertBlogImagePlaceholders(
  content: string,
  input: Pick<GenerateBlogImagesInput, 'title' | 'targetKeyword' | 'wordCount'>
): string {
  if (!content.trim()) return content;

  let next = content.trim();
  
  const section1Alt = `${input.targetKeyword} — section illustration`;
  const section1Md = `![${escapeMarkdownAlt(section1Alt)}](${BLOG_IMAGE_PLACEHOLDER_URL})`;
  next = insertBeforeNthH2(next, section1Md, 2);

  if (input.wordCount >= 1400) {
    const section2Alt = `${input.targetKeyword} — summary visual`;
    const section2Md = `![${escapeMarkdownAlt(section2Alt)}](${BLOG_IMAGE_PLACEHOLDER_URL})`;
    next = insertBeforeHeading(next, section2Md, /frequently asked questions|faq|conclusion/i);
  }

  return next.replace(/\n{3,}/g, '\n\n').trim();
}

export async function generateBlogImages(input: GenerateBlogImagesInput): Promise<BlogImageAsset[]> {
  const imageRequests = buildImageRequests(input);

  if (!GEMINI_API_KEY) {
    console.warn('[gemini-images] GEMINI_API_KEY missing — saving blog with image placeholders.');
    return imageRequests.map(assetWithPlaceholder);
  }

  const hero = (await generateSingleImage(imageRequests[0])) ?? assetWithPlaceholder(imageRequests[0]);
  if (imageRequests.length === 1) return [hero];

  const settled = await Promise.allSettled(
    imageRequests.slice(1).map(request => generateSingleImage(request))
  );

  const rest = imageRequests.slice(1).map((request, i) => {
    const result = settled[i];
    if (result.status === 'fulfilled' && result.value) return result.value;
    return assetWithPlaceholder(request);
  });

  return [hero, ...rest];
}

export async function generateContextualBlogImage(
  input: GenerateContextualBlogImageInput
): Promise<BlogImageAsset | null> {
  if (!GEMINI_API_KEY) return null;

  const contextSummary = compactContext(input.contextBefore, input.contextAfter);

  const prompt = buildEditorialPrompt({
    title: input.title,
    targetKeyword: input.targetKeyword,
    niche: input.niche,
    audience: input.audience,
    contextHint: contextSummary || input.imageAlt || `${input.targetKeyword} visual`,
    brandContext: input.brandContext ?? buildLegacyBrandContext(input.brandColors),
    company: input.company,
    forceCompanyName: false,
  });

  return generateSingleImage(
    {
      placement: 'section',
      alt: input.imageAlt || `${input.targetKeyword} visual`,
      prompt,
    },
    input.imageModel ?? undefined
  );
}

/** Convert legacy brandColors array to a minimal BrandContext for backward compat. */
function buildLegacyBrandContext(colors: string[] | null | undefined): BrandContext | null {
  const valid = (colors ?? []).filter(Boolean).slice(0, 3);
  if (!valid.length) return null;
  return { primaryColor: valid[0], secondaryColor: valid[1] ?? null, palette: valid };
}

function buildEditorialPrompt({
  title,
  targetKeyword,
  niche,
  audience,
  contextHint,
  brandContext,
  company,
  forceCompanyName,
}: {
  title: string;
  targetKeyword: string;
  niche: string;
  audience: string;
  contextHint: string;
  brandContext: BrandContext | null | undefined;
  company: string;
  forceCompanyName: boolean;
}): string {
  const companyHint = forceCompanyName
    ? `If it fits naturally, incorporate the brand name "${company}" as subtle text.`
    : "";

  // Build brand guidance block
  const brandParts: string[] = [];

  if (brandContext) {
    const palette = brandContext.palette?.length
      ? brandContext.palette
      : [brandContext.primaryColor, brandContext.secondaryColor, brandContext.accentColor].filter(Boolean) as string[];

    if (palette.length) {
      brandParts.push(`Brand palette: ${palette.join(", ")}.`);
    }
    if (brandContext.visualStyle) {
      brandParts.push(`Visual style: ${brandContext.visualStyle}.`);
    }
    if (brandContext.designPersonality) {
      brandParts.push(`Brand personality: ${brandContext.designPersonality}.`);
    }
    if (brandContext.imageStyle && brandContext.imageStyle !== "photorealistic") {
      brandParts.push(`Image aesthetic: ${brandContext.imageStyle.replace(/-/g, " ")}.`);
    }
  }

  const brandGuidance = brandParts.join(" ");

  // Build quality guidance based on detected image style
  const style = brandContext?.imageStyle;
  let styleDirective = "clean modern editorial graphic, 16:9 aspect ratio, minimal text, uncluttered composition.";
  if (style === "flat-design") {
    styleDirective = "flat design illustration, bold geometric shapes, 16:9 aspect ratio, minimal text.";
  } else if (style === "illustrated") {
    styleDirective = "hand-crafted illustration style, warm and approachable, 16:9 aspect ratio.";
  } else if (style === "data-visualization" || style === "infographic") {
    styleDirective = "clean data-driven visual, clear hierarchy, 16:9 aspect ratio, minimal decorative elements.";
  } else if (style === "corporate-photography") {
    styleDirective = "professional editorial photograph aesthetic, natural lighting, 16:9 aspect ratio, no text overlays.";
  }

  return [
    `4K editorial image for a blog article titled "${title}" targeting the keyword "${targetKeyword}" in the ${niche} sector.`,
    `Visual concept: ${contextHint}.`,
    `Target audience: ${audience}.`,
    brandGuidance,
    `Style: ${styleDirective} Focus on a single clear concept. Avoid generic stock imagery clichés, clip-art, and watermarks. Do not fill the image with text — let the visual carry the message.`,
    companyHint,
  ].filter(Boolean).join(" ");
}

function compactContext(before: string, after: string): string {
  const context = [before, after]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return context ? context.slice(0, 180) : '';
}

export function insertBlogImageAtBestPosition(content: string, image: BlogImageAsset): string {
  return insertAfterIntro(content, toMarkdownImage(image)).replace(/\n{3,}/g, '\n\n').trim();
}

export function insertBlogImages(content: string, images: BlogImageAsset[]): string {
  if (!images.length) return content;

  let next = content.trim();
  const [hero, section, summary] = images;

  if (hero) {
    next = insertAfterIntro(next, toMarkdownImage(hero));
  }
  if (section) {
    next = insertBeforeNthH2(next, toMarkdownImage(section), 2);
  }
  if (summary) {
    next = insertBeforeHeading(next, toMarkdownImage(summary), /frequently asked questions|faq|conclusion/i);
  }

  return next.replace(/\n{3,}/g, '\n\n').trim();
}

function buildImageRequests(input: GenerateBlogImagesInput): Array<Omit<BlogImageAsset, 'url'>> {
  const count = input.wordCount >= 1400 ? 2 : 1;

  const requests: Array<Omit<BlogImageAsset, 'url'>> = [
    {
      placement: 'hero',
      alt: `${input.title} — featured image`,
      prompt: buildEditorialPrompt({
        title: input.title,
        targetKeyword: input.targetKeyword,
        niche: input.niche,
        audience: input.audience,
        contextHint: `hero image introducing the article`,
        brandContext: null,
        company: input.company,
        forceCompanyName: false,
      }),
    },
  ];

  if (count >= 2) {
    requests.push({
      placement: 'section',
      alt: `${input.targetKeyword} — section illustration`,
      prompt: buildEditorialPrompt({
        title: input.title,
        targetKeyword: input.targetKeyword,
        niche: input.niche,
        audience: input.audience,
        contextHint: `mid-article section break illustrating a key concept about "${input.targetKeyword}"`,
        brandContext: null,
        company: input.company,
        forceCompanyName: false,
      }),
    });
  }

  return requests;
}

export async function generateSingleImage(
  request: Omit<BlogImageAsset, 'url'>,
  model?: string
): Promise<BlogImageAsset | null> {
  if (!GEMINI_API_KEY) {
    console.warn('[gemini-images] GEMINI_API_KEY missing — cannot generate image.');
    return null;
  }

  const resolvedModel = model ?? DEFAULT_IMAGE_MODEL;
  const isImagen = resolvedModel.startsWith("imagen-");

  return isImagen
    ? generateImagenImage(request, resolvedModel)
    : generateGeminiImage(request, resolvedModel);
}

async function generateGeminiImage(
  request: Omit<BlogImageAsset, 'url'>,
  model: string
): Promise<BlogImageAsset | null> {
  const endpoint = GEMINI_IMAGE_ENDPOINT.replace("{MODEL}", model);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  const startMs = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: request.prompt }]
          }
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "16:9" }
        }
      }),
    });

    const latencyMs = Date.now() - startMs;

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn(`Gemini image generation failed (${response.status}): ${detail.slice(0, 500)}`);
      void getRecorder().then(({ recordAiCall }) => {
        recordAiCall({
          provider: "gemini",
          model,
          prompt: request.prompt,
          ok: false,
          latencyMs,
          errorMessage: `HTTP ${response.status}: ${detail.slice(0, 300)}`,
          featureSuffix: "image_generation",
          metadata: { placement: request.placement, alt: request.alt },
        });
      });
      return null;
    }

    const data = await response.json();
    const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data || !inlineData?.mimeType) {
      console.warn("Gemini returned no image data:", JSON.stringify(data).slice(0, 300));
      void getRecorder().then(({ recordAiCall }) => {
        recordAiCall({
          provider: "gemini",
          model,
          prompt: request.prompt,
          ok: false,
          latencyMs,
          errorMessage: "No image data in response",
          featureSuffix: "image_generation",
          metadata: { placement: request.placement, alt: request.alt },
        });
      });
      return null;
    }

    // Log success — extract prompt tokens (images have no output tokens, billed per image)
    void getRecorder().then(({ recordAiCall, extractGeminiTokenUsage, estimateImageGenerationCostUsd }) => {
      const { tokensInput } = extractGeminiTokenUsage(data);
      recordAiCall({
        provider: "gemini",
        model,
        prompt: request.prompt,
        tokensInput: tokensInput ?? null,
        tokensOutput: null, // image output, not text tokens
        estimatedCostUsd: estimateImageGenerationCostUsd(model),
        ok: true,
        latencyMs,
        featureSuffix: "image_generation",
        metadata: {
          placement: request.placement,
          alt: request.alt,
          mimeType: inlineData.mimeType,
          pricing_note: "per_image_estimated",
          prompt_tokens: tokensInput,
        },
      });
    });

    return {
      ...request,
      url: `data:${inlineData.mimeType};base64,${inlineData.data}`,
    };
  } catch (error) {
    console.warn("Gemini image generation skipped/failed:", error);
    void getRecorder().then(({ recordAiCall }) => {
      recordAiCall({
        provider: "gemini",
        model,
        prompt: request.prompt,
        ok: false,
        latencyMs: Date.now() - startMs,
        errorMessage: error instanceof Error ? error.message : String(error),
        featureSuffix: "image_generation",
        metadata: { placement: request.placement },
      });
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateImagenImage(
  request: Omit<BlogImageAsset, 'url'>,
  model: string
): Promise<BlogImageAsset | null> {
  const endpoint = IMAGEN_PREDICT_ENDPOINT.replace("{MODEL}", model);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40_000);
  const startMs = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        instances: [{ prompt: request.prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "16:9",
          safetyFilterLevel: "block_some",
        }
      }),
    });

    const latencyMs = Date.now() - startMs;

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn(`Imagen generation failed (${response.status}): ${detail.slice(0, 500)}`);
      void getRecorder().then(({ recordAiCall }) => {
        recordAiCall({
          provider: "gemini",
          model,
          prompt: request.prompt,
          ok: false,
          latencyMs,
          errorMessage: `HTTP ${response.status}: ${detail.slice(0, 300)}`,
          featureSuffix: "image_generation",
          metadata: { provider_stack: "imagen", placement: request.placement, alt: request.alt },
        });
      });
      return null;
    }

    const data = await response.json();
    const prediction = data.predictions?.[0];
    if (!prediction?.bytesBase64Encoded || !prediction?.mimeType) {
      console.warn("Imagen returned no image data:", JSON.stringify(data).slice(0, 300));
      void getRecorder().then(({ recordAiCall }) => {
        recordAiCall({
          provider: "gemini",
          model,
          prompt: request.prompt,
          ok: false,
          latencyMs,
          errorMessage: "No image data in Imagen prediction response",
          featureSuffix: "image_generation",
          metadata: { provider_stack: "imagen", placement: request.placement },
        });
      });
      return null;
    }

    // Imagen 4 uses per-image billing — no token counts available
    void getRecorder().then(({ recordAiCall, estimateImageGenerationCostUsd }) => {
      recordAiCall({
        provider: "gemini",
        model,
        prompt: request.prompt,
        tokensInput: null,  // Imagen predict endpoint does not return token counts
        tokensOutput: null,
        estimatedCostUsd: estimateImageGenerationCostUsd(model),
        ok: true,
        latencyMs,
        featureSuffix: "image_generation",
        metadata: {
          provider_stack: "imagen",
          placement: request.placement,
          alt: request.alt,
          mimeType: prediction.mimeType,
          pricing_note: "per_image",
        },
      });
    });

    return {
      ...request,
      url: `data:${prediction.mimeType};base64,${prediction.bytesBase64Encoded}`,
    };
  } catch (error) {
    console.warn("Imagen generation skipped/failed:", error);
    void getRecorder().then(({ recordAiCall }) => {
      recordAiCall({
        provider: "gemini",
        model,
        prompt: request.prompt,
        ok: false,
        latencyMs: Date.now() - startMs,
        errorMessage: error instanceof Error ? error.message : String(error),
        featureSuffix: "image_generation",
        metadata: { provider_stack: "imagen", placement: request.placement },
      });
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function toMarkdownImage(image: BlogImageAsset): string {
  return `![${escapeMarkdownAlt(image.alt)}](${image.url})`;
}

function insertAfterIntro(content: string, markdownImage: string): string {
  const lines = content.split('\n');
  const h1Index = lines.findIndex(line => /^#\s+/.test(line));
  const start = h1Index >= 0 ? h1Index + 1 : 0;

  for (let i = start; i < lines.length; i++) {
    if (!lines[i].trim() || /^#{1,6}\s+/.test(lines[i])) continue;
    let end = i;
    while (end + 1 < lines.length && lines[end + 1].trim() && !/^#{1,6}\s+/.test(lines[end + 1])) {
      end++;
    }
    lines.splice(end + 1, 0, '', markdownImage, '');
    return lines.join('\n');
  }

  return `${content}\n\n${markdownImage}`;
}

function insertBeforeNthH2(content: string, markdownImage: string, n: number): string {
  const lines = content.split('\n');
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      seen++;
      if (seen === n) {
        lines.splice(i, 0, markdownImage, '');
        return lines.join('\n');
      }
    }
  }
  return `${content}\n\n${markdownImage}`;
}

function insertBeforeHeading(content: string, markdownImage: string, headingPattern: RegExp): string {
  const lines = content.split('\n');
  const index = lines.findIndex(line => /^##\s+/.test(line) && headingPattern.test(line));
  if (index === -1) return `${content}\n\n${markdownImage}`;
  lines.splice(index, 0, markdownImage, '');
  return lines.join('\n');
}

function escapeMarkdownAlt(value: string): string {
  return value.replace(/[\[\]\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
}
