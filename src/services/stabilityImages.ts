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
}

interface StabilityImageResponse {
  image?: string;
  seed?: number;
  finish_reason?: string;
}

// Switched from `/ultra` (6.5+ credits) to the SD 3.5 endpoint with the
// `sd3.5-flash` model — flat 2.5 credits per successful generation, which is
// the cheapest option that still produces editorial-quality blog imagery.
// https://platform.stability.ai/docs/api-reference#tag/Generate
const STABILITY_SD3_ENDPOINT = 'https://api.stability.ai/v2beta/stable-image/generate/sd3';
const STABILITY_MODEL = 'sd3.5-flash';

/**
 * Neutral inline SVG so markdown survives `sanitizeBlogContent` (empty `![]( )`
 * is stripped). Alt text still describes the intended image for editors and a11y.
 */
const BLOG_IMAGE_PLACEHOLDER_URL =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img">
      <rect width="1600" height="900" fill="#27272a"/>
      <rect x="1" y="1" width="1598" height="898" fill="none" stroke="#3f3f46" stroke-width="2"/>
    </svg>`
  );

function assetWithPlaceholder(request: Omit<BlogImageAsset, 'url'>): BlogImageAsset {
  return { ...request, url: BLOG_IMAGE_PLACEHOLDER_URL };
}

export async function generateBlogImages(input: GenerateBlogImagesInput): Promise<BlogImageAsset[]> {
  const imageRequests = buildImageRequests(input);
  const apiKey = process.env.STABILITY_API_KEY?.trim();

  if (!apiKey) {
    console.warn('[stability] STABILITY_API_KEY missing — saving blog with image placeholders.');
    return imageRequests.map(assetWithPlaceholder);
  }

  const hero = (await generateSingleImage(apiKey, imageRequests[0])) ?? assetWithPlaceholder(imageRequests[0]);
  if (imageRequests.length === 1) return [hero];

  const settled = await Promise.allSettled(
    imageRequests.slice(1).map(request => generateSingleImage(apiKey, request))
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
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) return null;

  const prompt = [
    `Editorial blog illustration for "${input.title}" about "${input.targetKeyword}" in ${input.niche}.`,
    `Image intent: ${input.imageAlt || `${input.targetKeyword} visual`}. Nearby context: ${compactContext(input.contextBefore, input.contextAfter)}.`,
    `Style: premium modern SaaS/editorial, clean 16:9 composition, sharp focus, high quality, no text, no words, no letters, no logos, no watermark, no distorted hands, no blurry artifacts.`,
  ].filter(Boolean).join(' ');

  return generateSingleImage(apiKey, {
    placement: 'section',
    alt: input.imageAlt || `${input.targetKeyword} visual`,
    prompt,
  });
}

function compactContext(before: string, after: string): string {
  const context = [before, after]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return context ? context.slice(0, 220) : 'match the article topic and placement';
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
  // Hard product cap: a blog ships with at most 2 images (hero + one
  // supporting visual). Going higher historically produced broken-image
  // sequences in the middle of the article — see blog-content.ts for the
  // matching post-generation cap.
  const count = input.wordCount >= 1400 ? 2 : 1;
  const baseStyle =
    'premium editorial blog illustration, modern SaaS website style, clean composition, realistic lighting, sharp focus, high quality, no text, no words, no letters, no logos, no watermark, no distorted hands, no blurry artifacts';
  const context = `${input.niche} industry, for ${input.audience}, company context: ${input.company}`;

  const requests: Array<Omit<BlogImageAsset, 'url'>> = [
    {
      placement: 'hero',
      alt: `${input.title} illustration`,
      prompt: `${baseStyle}. Hero image for an article titled "${input.title}" about "${input.targetKeyword}". ${context}.`,
    },
  ];

  if (count >= 2) {
    requests.push({
      placement: 'section',
      alt: `${input.targetKeyword} strategy visual`,
      prompt: `${baseStyle}. Strategic visual explaining "${input.targetKeyword}" for a ${input.articleType} article. Show abstract workflow, research, and growth concepts. ${context}.`,
    });
  }

  return requests;
}

async function generateSingleImage(
  apiKey: string,
  request: Omit<BlogImageAsset, 'url'>
): Promise<BlogImageAsset | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const outputFormat = process.env.STABILITY_IMAGE_FORMAT || 'webp';

  try {
    const form = new FormData();
    form.append('prompt', request.prompt);
    form.append('model', STABILITY_MODEL);
    form.append('mode', 'text-to-image');
    form.append('aspect_ratio', process.env.STABILITY_IMAGE_ASPECT_RATIO || '16:9');
    form.append('output_format', outputFormat);
    // `negative_prompt` is rejected by the distilled flash/turbo SD 3.5
    // variants, so we bake the avoid-list straight into the prompt instead.

    const response = await fetch(STABILITY_SD3_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn(`Stability SD3.5 Flash image generation failed (${response.status}): ${detail.slice(0, 500)}`);
      return null;
    }

    const data = (await response.json()) as StabilityImageResponse;
    if (!data.image || (data.finish_reason && data.finish_reason !== 'SUCCESS')) {
      console.warn(`Stability SD3.5 Flash returned no usable image. finish_reason=${data.finish_reason ?? 'unknown'}`);
      return null;
    }

    return {
      ...request,
      url: `data:image/${outputFormat};base64,${data.image}`,
    };
  } catch (error) {
    console.warn('Stability SD3.5 Flash image generation skipped:', error);
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
