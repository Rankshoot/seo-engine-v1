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

interface OpenAiImageResponse {
  data?: Array<{
    url: string;
    revised_prompt?: string;
  }>;
  error?: {
    message: string;
  };
}

const GEMINI_API_KEY = (process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY)?.trim() ?? "";
const GEMINI_IMAGE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent";

const SVG_RAW = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img">
  <rect width="1600" height="900" fill="#27272a"/>
  <rect x="1" y="1" width="1598" height="898" fill="none" stroke="#3f3f46" stroke-width="2"/>
</svg>`;

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
  return content.replace(
    /(!\[[^\]]*\]\()(data:image\/svg\+xml[^)]*)(\))/gi,
    `$1${BLOG_IMAGE_PLACEHOLDER_URL}$3`
  );
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

  const prompt = [
    `Editorial branded blog illustration for "${input.title}" about "${input.targetKeyword}" in ${input.niche} industry.`,
    `Image intent: ${input.imageAlt || `${input.targetKeyword} visual`}. Nearby context: ${compactContext(input.contextBefore, input.contextAfter)}.`,
    `Style: premium modern SaaS/editorial graphic, clean 16:9 composition, sharp focus, high quality. Cleanly and accurately render the brand/company name "${input.company}" as a modern text logo or header within the visual. Do not output any garbled or random text outside of "${input.company}".`,
  ].filter(Boolean).join(' ');

  return generateSingleImage({
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
  const count = input.wordCount >= 1400 ? 2 : 1;
  const baseStyle =
    `premium editorial branded illustration, modern SaaS website graphic style, clean composition, realistic lighting, sharp focus, high quality. Cleanly and accurately render the brand/company name "${input.company}" as a prominent text logo or card header in the graphic. Avoid generic garbled text.`;
  const context = `${input.niche} industry, target audience: ${input.audience}`;

  const requests: Array<Omit<BlogImageAsset, 'url'>> = [
    {
      placement: 'hero',
      alt: `${input.title} illustration`,
      prompt: `${baseStyle}. Hero image for an article titled "${input.title}" about "${input.targetKeyword}". Include "${input.company}" branding and theme. ${context}.`,
    },
  ];

  if (count >= 2) {
    requests.push({
      placement: 'section',
      alt: `${input.targetKeyword} strategy visual`,
      prompt: `${baseStyle}. Strategic visual explaining "${input.targetKeyword}" for a ${input.articleType} article. Include a clean user interface mockup or abstract workflow chart showing the brand name "${input.company}" as the application title. ${context}.`,
    });
  }

  return requests;
}

async function generateSingleImage(
  request: Omit<BlogImageAsset, 'url'>
): Promise<BlogImageAsset | null> {
  if (!GEMINI_API_KEY) {
    console.warn('[gemini-images] GEMINI_API_KEY missing — cannot generate image.');
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(GEMINI_IMAGE_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: request.prompt }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: "16:9"
          }
        }
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn(`Gemini image generation failed (${response.status}): ${detail.slice(0, 500)}`);
      return null;
    }

    const data = await response.json();
    const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data || !inlineData?.mimeType) {
      console.warn("Gemini returned no image data. Full response:", JSON.stringify(data));
      return null;
    }

    return {
      ...request,
      url: `data:${inlineData.mimeType};base64,${inlineData.data}`,
    };
  } catch (error) {
    console.warn("Gemini image generation skipped/failed:", error);
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
