/**
 * Landing Page generation pipeline.
 *
 * Uses aiGenerateStructured to produce a fully typed, section-based JSON
 * landing page from keyword + brand context.  The result is stored in the
 * `blogs` table with content_type = 'landing_page' and content_data holding
 * the LandingPageContentData (sections array + meta).
 */

import { z } from 'zod';
import type {
  LandingPageContentData,
  LandingPageSection,
  LandingPageType,
} from '@/lib/types';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const heroSchema = z.object({
  type: z.literal('hero'),
  headline: z.string().max(200),
  subheadline: z.string().max(500),
  cta_primary: z.string().max(80),
  cta_secondary: z.string().max(80).optional(),
  badge: z.string().max(100).optional(),
  trust_signals: z.array(z.string().max(120)).max(6).optional(),
});

const featuresSchema = z.object({
  type: z.literal('features'),
  heading: z.string().max(200),
  subheading: z.string().max(400).optional(),
  items: z.array(z.object({
    icon: z.string().max(8),
    title: z.string().max(150),
    description: z.string().max(500),
  })).min(3).max(8),
});

const statsSchema = z.object({
  type: z.literal('stats'),
  heading: z.string().max(200).optional(),
  items: z.array(z.object({
    value: z.string().max(50),
    label: z.string().max(150),
  })).min(2).max(8),
});

const howItWorksSchema = z.object({
  type: z.literal('how-it-works'),
  heading: z.string().max(200),
  subheading: z.string().max(400).optional(),
  steps: z.array(z.object({
    title: z.string().max(150),
    description: z.string().max(500),
  })).min(3).max(7),
});

const testimonialsSchema = z.object({
  type: z.literal('testimonials'),
  heading: z.string().max(200),
  items: z.array(z.object({
    quote: z.string().max(600),
    author: z.string().max(100),
    role: z.string().max(150),
    company: z.string().max(100).optional(),
  })).min(2).max(5),
});

const faqSchema = z.object({
  type: z.literal('faq'),
  heading: z.string().max(200),
  items: z.array(z.object({
    question: z.string().max(300),
    answer: z.string().max(800),
  })).min(4).max(10),
});

const ctaSchema = z.object({
  type: z.literal('cta'),
  heading: z.string().max(200),
  subheading: z.string().max(400).optional(),
  cta_primary: z.string().max(80),
  cta_secondary: z.string().max(80).optional(),
});

const benefitsSchema = z.object({
  type: z.literal('benefits'),
  heading: z.string().max(200),
  subheading: z.string().max(400).optional(),
  items: z.array(z.object({
    icon: z.string().max(8).optional(),
    title: z.string().max(150),
    description: z.string().max(500),
  })).min(3).max(8),
});

const sectionSchema = z.discriminatedUnion('type', [
  heroSchema,
  featuresSchema,
  statsSchema,
  howItWorksSchema,
  testimonialsSchema,
  faqSchema,
  ctaSchema,
  benefitsSchema,
]);

// Pre-parse sections that arrive as JSON strings (Claude sometimes stringifies each element)
const parsedSectionSchema = z.preprocess(
  (val) => (typeof val === 'string' ? JSON.parse(val) : val),
  sectionSchema,
);

const landingPageOutputSchema = z.object({
  meta_title: z.string().max(65),
  meta_description: z.string().max(200), // relaxed — we trim before storing
  sections: z.array(parsedSectionSchema).min(5).max(10),
});

type LandingPageOutput = z.infer<typeof landingPageOutputSchema>;

// ─── Context types ────────────────────────────────────────────────────────────

export interface LandingPagePromptContext {
  primaryKeyword: string;
  secondaryKeywords?: string[];
  pageType: LandingPageType;
  companyName: string;
  companyDomain: string;
  niche: string;
  audience: string;
  tone: string;
  primaryCta: string;
  productOrService?: string;   // what is being promoted
  locationFocus?: string;      // for location pages
  uniqueValueProp?: string;    // USP to highlight
  // Brand Intelligence
  brandPrimaryColor?: string | null;
  brandVisualStyle?: string | null;
  brandPersonality?: string | null;
  // Project context
  brandVoice?: string;
  brandValues?: string;
  brandDescription?: string;
}

export interface GeneratedLandingPage {
  title: string;
  meta_description: string;
  slug: string;
  content_data: LandingPageContentData;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

const PAGE_TYPE_GUIDANCE: Record<LandingPageType, string> = {
  service: 'Service landing page: explain the service, who it helps, process, proof, FAQ, CTA.',
  product: 'Product landing page: showcase features, benefits, social proof, pricing hint, FAQ, CTA.',
  location: 'Location-based landing page: include city/region in headline, local proof, service list, map/contact CTA.',
  feature: 'Feature/use-case landing page: deep dive one specific capability, technical benefits, workflow, testimonials, CTA.',
  'lead-capture': 'Lead capture landing page: focus on a single compelling offer, minimal friction, trust signals, strong CTA.',
  comparison: 'Comparison landing page: highlight advantages over alternatives, feature table, proof points, CTA.',
  campaign: 'Campaign landing page: urgency-driven, time-limited offer, social proof, single CTA.',
};

function buildPrompt(ctx: LandingPagePromptContext): string {
  const kw = ctx.primaryKeyword.trim();
  const secKw = ctx.secondaryKeywords?.length ? ctx.secondaryKeywords.slice(0, 8).join(', ') : 'none';
  const brandHint = ctx.brandPrimaryColor
    ? `Brand primary color: ${ctx.brandPrimaryColor}. Visual style: ${ctx.brandVisualStyle ?? 'modern'}.`
    : '';
  const voiceHint = [ctx.brandVoice, ctx.brandValues, ctx.brandDescription].filter(Boolean).join(' | ');

  return `You are an expert conversion copywriter and SEO specialist. Generate a high-converting, SEO-optimised landing page as structured JSON.

## Page brief
- Primary keyword: "${kw}"
- Secondary keywords: ${secKw}
- Page type: ${ctx.pageType} — ${PAGE_TYPE_GUIDANCE[ctx.pageType]}
- Company: ${ctx.companyName} (${ctx.companyDomain})
- Industry/Niche: ${ctx.niche}
- Target audience: ${ctx.audience}
- Tone: ${ctx.tone}
- Primary CTA goal: ${ctx.primaryCta}
${ctx.productOrService ? `- Product/Service: ${ctx.productOrService}` : ''}
${ctx.locationFocus ? `- Location focus: ${ctx.locationFocus}` : ''}
${ctx.uniqueValueProp ? `- Key value proposition: ${ctx.uniqueValueProp}` : ''}
${brandHint}
${voiceHint ? `- Brand voice: ${voiceHint}` : ''}

## Required output format (JSON)
Return a JSON object with these fields:

{
  "meta_title": "SEO title ≤60 chars including the primary keyword",
  "meta_description": "Compelling meta description ≤155 chars with keyword",
  "sections": [
    // REQUIRED: must include exactly ONE 'hero', ONE 'faq', ONE 'cta' section
    // RECOMMENDED: include 'features' OR 'benefits', 'stats', 'how-it-works' or 'testimonials'
    // 5-9 sections total

    { "type": "hero", "headline": "...", "subheadline": "...", "cta_primary": "...", "cta_secondary": "...", "badge": "...", "trust_signals": ["..."] },
    { "type": "stats", "heading": "...", "items": [{ "value": "...", "label": "..." }] },
    { "type": "features", "heading": "...", "subheading": "...", "items": [{ "icon": "✅", "title": "...", "description": "..." }] },
    { "type": "benefits", "heading": "...", "subheading": "...", "items": [{ "title": "...", "description": "..." }] },
    { "type": "how-it-works", "heading": "...", "subheading": "...", "steps": [{ "title": "...", "description": "..." }] },
    { "type": "testimonials", "heading": "...", "items": [{ "quote": "...", "author": "...", "role": "...", "company": "..." }] },
    { "type": "faq", "heading": "...", "items": [{ "question": "...", "answer": "..." }] },
    { "type": "cta", "heading": "...", "subheading": "...", "cta_primary": "...", "cta_secondary": "..." }
  ]
}

## Quality rules
- Primary keyword "${kw}" must appear naturally in: hero headline, meta title, at least one section heading
- Write real, specific copy — not placeholder "lorem ipsum" text
- Testimonials must feel authentic with specific names, roles, companies
- Statistics must be plausible and specific (e.g. "saved 8 hours/week" not "saves time")
- CTA text must be action-oriented and match the primary CTA goal
- Emoji in features/benefits icons must be single relevant emoji characters
- FAQ must cover real buyer objections for ${ctx.pageType} pages in the ${ctx.niche} space

Return ONLY the JSON. No explanation, no markdown code fences.`;
}

// ─── Slug generation ──────────────────────────────────────────────────────────

function slugifyLandingPage(keyword: string, pageType: LandingPageType): string {
  const base = keyword
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)
    .replace(/-+$/, '');
  return `${base}-${pageType.replace('/', '-').replace(' ', '-')}-lp`.replace(/--+/g, '-');
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateLandingPage(
  ctx: LandingPagePromptContext
): Promise<GeneratedLandingPage> {
  const { aiGenerateStructured } = await import('@/services/ai/providers');

  const prompt = buildPrompt(ctx);

  const output: LandingPageOutput = await aiGenerateStructured(
    'landing-page',
    prompt,
    landingPageOutputSchema,
    {
      temperature: 0.72,
      maxOutputTokens: 8192,
      timeoutMs: 120_000,
    }
  );

  const sections = output.sections as LandingPageSection[];
  const hero = sections.find(s => s.type === 'hero') as typeof sections[0] & { type: 'hero' } | undefined;
  const title = (hero as { headline?: string } | undefined)?.headline ?? ctx.primaryKeyword;

  const content_data: LandingPageContentData = {
    page_type: ctx.pageType,
    meta_title: output.meta_title,
    meta_description: output.meta_description,
    primary_keyword: ctx.primaryKeyword,
    secondary_keywords: ctx.secondaryKeywords ?? [],
    sections,
    audience: ctx.audience,
    tone: ctx.tone,
    primary_cta: ctx.primaryCta,
    company_name: ctx.companyName,
  };

  return {
    title,
    meta_description: output.meta_description,
    slug: slugifyLandingPage(ctx.primaryKeyword, ctx.pageType),
    content_data,
  };
}
