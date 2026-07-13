/**
 * Whitepaper prompt — research-driven, enterprise-grade, EEAT-heavy.
 * Targets Gemini 2.5 Pro with Google Search grounding for real citations.
 *
 * Key improvements over v1:
 * - Region-locked data (${regionLabel} only, explicit gap-acknowledgement when data unavailable)
 * - Academic-grade citation standard (primary sources only, full bibliographic format)
 * - Custom word count support
 * - Humanised analytical voice (not robotic, not sales-y)
 * - Visual placeholder standard for charts and infographics
 * - Stronger structural contract with enforcement rules
 */

import type { ResearchContext } from '@/lib/research';
import { formatResearchForPrompt } from '@/lib/research';
import type { BusinessBrief } from '@/lib/business-brief';

export interface WhitepaperPromptContext {
  topic: string;
  industry: string;
  problemStatement: string;
  audience: string;
  technicalDepth: 'executive' | 'analyst' | 'engineering';
  /** When set, overrides the depth-mode word range. Must be between 2,500 and 12,000. */
  customWordCount?: number;
  researchAngle: string;
  businessObjective: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  semanticKeywords: string[];
  regionLabel: string;
  languageLabel: string;
  companyName: string;
  companyDomain: string;
  brief: BusinessBrief | null;
  research: ResearchContext | null;
  internalLinks: string[];
  brandVoice?: string;
  brandValues?: string;
  brandDescription?: string;
}

const DEPTH_GUIDE: Record<
  WhitepaperPromptContext['technicalDepth'],
  { audience: string; style: string; wordRange: string }
> = {
  executive: {
    audience: 'C-suite, VP, and board-level readers',
    style:
      'Lead every section with the business outcome. Define jargon inline the first time it appears. No implementation detail. Decision-ready conclusions on every page. Use plain English first; if technical terms are necessary, define them in a parenthetical.',
    wordRange: '3,500–5,000 words',
  },
  analyst: {
    audience: 'Senior analysts, heads of function, and informed managers',
    style:
      'Show the methodology, data ranges, and key trade-offs. Cite primary sources for every claim. Include structured comparison tables. Acknowledge uncertainty in the data honestly. Technical terms are acceptable when correctly attributed to a standard or body.',
    wordRange: '4,500–7,000 words',
  },
  engineering: {
    audience: 'Technical practitioners, architects, and implementation leads',
    style:
      'Architecture-level detail, named standards (ISO, IEEE, NIST), failure modes, edge cases, and configuration trade-offs. Still cite primary sources — especially for performance benchmarks or security claims. All claims must be traceable to a spec or study.',
    wordRange: '5,500–8,500 words',
  },
};

export function buildWhitepaperPrompt(ctx: WhitepaperPromptContext): string {
  const depth = DEPTH_GUIDE[ctx.technicalDepth];

  const wordCountInstruction = ctx.customWordCount
    ? `EXACT WORD COUNT TARGET: ${ctx.customWordCount.toLocaleString()} words (±5%). Never pad to reach the target. If a section is complete, move on. Do not cut substantive analysis to stay under it.`
    : `TARGET LENGTH: ${depth.wordRange} depending on topic density. Never pad. Stop when the argument is complete.`;

  const brandPersonaBlock =
    ctx.brandVoice || ctx.brandValues || ctx.brandDescription
      ? `\nBRAND PERSONA & IDENTITY:
${ctx.brandVoice ? `- Brand Voice/Tone: ${ctx.brandVoice}\n` : ''}${ctx.brandValues ? `- Core Values/Messaging: ${ctx.brandValues}\n` : ''}${ctx.brandDescription ? `- Personality/Description: ${ctx.brandDescription}\n` : ''}`
      : '';

  const briefBlock = ctx.brief
    ? `COMPANY GROUNDING (credibility anchor — NOT a sales brochure):
- Summary: ${ctx.brief.summary || '(none)'}
- Products / offerings: ${ctx.brief.products.slice(0, 8).join(', ') || '(none)'}
- Audiences: ${ctx.brief.audiences.slice(0, 4).join(' | ') || ctx.audience}
- USPs: ${ctx.brief.usps.slice(0, 4).join(' | ') || '(none)'}
- Tone bias: ${ctx.brief.tone || 'analytical, evidence-led, direct'}
${brandPersonaBlock}`
    : `(No cached brief — match the requested technical depth and the company name. Tone: analytical, evidence-led, direct.)
${brandPersonaBlock}`;

  const researchBlock = ctx.research ? formatResearchForPrompt(ctx.research) : '';

  const semanticBlock = ctx.semanticKeywords.length
    ? `Topical authority cluster (cover across sections; never list them, weave them into the argument):\n${ctx.semanticKeywords.slice(0, 24).map((k) => `• ${k}`).join('\n')}`
    : '';

  const internalLinksBlock = ctx.internalLinks.length
    ? `Internal link pool (use 2–3 verbatim — embed them in body text where they extend the argument, not as footnotes):\n${ctx.internalLinks.slice(0, 14).map((u) => `- ${u}`).join('\n')}`
    : '(No internal link pool available — omit internal links entirely.)';

  const publicationDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });

  return `You are a senior industry analyst at ${ctx.companyName} writing an enterprise-grade whitepaper. The reader is ${depth.audience} making a high-stakes decision. Every claim must be defensible if cited by procurement, legal, or a board pack. Write as a credible expert, not as a marketer.

═══════════════════════════════════════════════════
MISSION BRIEF
═══════════════════════════════════════════════════
DEPTH MODE: ${ctx.technicalDepth.toUpperCase()} — ${depth.style}
INDUSTRY: ${ctx.industry}
PRIMARY KEYWORD: "${ctx.primaryKeyword}"
SECONDARY KEYWORDS: ${ctx.secondaryKeywords.join(', ') || '(derive 4–6 from the research block — choose by decision-maker intent)'}
TOPIC: ${ctx.topic}
PROBLEM STATEMENT: ${ctx.problemStatement}
AUDIENCE: ${ctx.audience}
RESEARCH ANGLE: ${ctx.researchAngle}
BUSINESS OBJECTIVE: ${ctx.businessObjective}
REGION: ${ctx.regionLabel} — all data, benchmarks, and regulatory references MUST be geo-scoped here
LANGUAGE: ${ctx.languageLabel}
DOMAIN: ${ctx.companyDomain}
PUBLICATION DATE: ${publicationDate}

${wordCountInstruction}

${briefBlock}

${semanticBlock}

${internalLinksBlock}

${researchBlock}

═══════════════════════════════════════════════════
REGION LOCK — ${ctx.regionLabel} DATA ONLY
═══════════════════════════════════════════════════
Every statistic, market size figure, benchmark, case study, and regulatory reference MUST be geo-scoped to ${ctx.regionLabel}. This is an absolute constraint.

✅ ALLOWED: Data explicitly published for ${ctx.regionLabel} by government statistical agencies, national regulators, central banks, regional industry bodies, or international organisations (WHO, World Bank, OECD, ILO, IMF) with a country/region-level breakdown that names ${ctx.regionLabel} directly.

❌ FORBIDDEN: Global averages presented as ${ctx.regionLabel} data. Data from another country or region used to fill a gap. "Developed market" or "emerging market" aggregates cited as if they represent ${ctx.regionLabel} specifically. Regulatory frameworks from other jurisdictions applied to ${ctx.regionLabel} without confirming equivalence.

WHEN ${ctx.regionLabel}-SPECIFIC DATA IS UNAVAILABLE: Acknowledge the gap explicitly:
"Region-specific data for ${ctx.regionLabel} on this metric has not been published as of ${publicationDate}; the closest available comparable is [X] for [geography] ([Source, Year])."
Never silently substitute another region's data.

═══════════════════════════════════════════════════
CITATION STANDARD — NON-NEGOTIABLE
═══════════════════════════════════════════════════
Use Google Search to locate and link to PRIMARY SOURCES only. A primary source is the original publisher of the data — not a summary, not a press release, not an article about the data.

SOURCE HIERARCHY (rank 1 = most preferred):
1. ${ctx.regionLabel} government statistical agencies, national regulators, central bank publications, official data portals
2. Peer-reviewed journals: PubMed/NCBI, JSTOR, IEEE Xplore, Springer, Elsevier, Nature, BMJ, The Lancet, SSRN (for preprints — label as "preprint")
3. Original institutional research: McKinsey Global Institute, Gartner Research, Deloitte Insights, PwC Research, EY, BCG, Bain, Forrester Research, IDC — link to the SPECIFIC REPORT PAGE on the publisher's official website
4. International organisations: WHO, World Bank, OECD, ILO, IMF, UNESCO — link to the original publication page, not the organisation's homepage
5. Standards bodies: ISO, IEEE, NIST, ANSI, BSI — link to the specific standard or guidance document

NEVER CITE: Wikipedia, HubSpot blog, Forbes contributor articles, Medium, LinkedIn, Substack, vendor product pages, PR Newswire, competitor content, or any secondary source that describes a study rather than being the study itself.

URL RULES:
- Link to the specific page, not the root domain
- Prefer DOI links (https://doi.org/...) for academic papers
- If uncertain about a direct PDF URL, link to the abstract or report landing page instead — never fabricate a URL

IN-BODY ATTRIBUTION: (Organisation or Author Surname, Year) — e.g. "(Reserve Bank of India, 2024)" or "(McKinsey Global Institute, 2023)"

REFERENCES FORMAT:
Institutional reports: Organisation Name. (Year). *Full Title of Report*. Publisher. URL
Journal articles: Author, A. B., & Author, C. D. (Year). *Title of article*. *Journal Name*, Vol(Issue), pp. XX–XX. https://doi.org/...
Government data: Agency Name. (Year). *Dataset or Publication Title*. Issuing Body. URL

MINIMUM CITATIONS: 12 distinct primary sources cited in the body. Sections "Industry Context", "Findings", and "Strategic Analysis" must each cite at least 3.

═══════════════════════════════════════════════════
VISUAL PLACEHOLDER STANDARD
═══════════════════════════════════════════════════
When a visual would help decision-makers understand, compare, or act on the analysis, insert a placeholder in this exact format on its own line (the frontend renders this as a "Generate Image" button):

<!-- VISUAL_PLACEHOLDER type="[TYPE]" title="[Short title]" desc="[One sentence: what this visual shows]" data="[Key data points, labels, or axes]" source="[Citation for underlying data]" -->

Valid TYPEs:
- bar-chart          (comparing values across categories or time periods)
- line-chart         (trends over time)
- comparison-table   (structured side-by-side of 2–4 approaches, vendors, or scenarios)
- benchmark-scorecard (performance metrics, maturity levels, or scored comparisons)
- process-diagram    (implementation roadmap, decision flow, or maturity model)
- infographic        (multi-stat summary for executive-facing sections)
- risk-matrix        (probability vs. impact grid for risk sections)

PLACEMENT RULES:
- After presenting comparative data across options or periods → bar-chart or comparison-table
- After identifying regional benchmarks or maturity levels → benchmark-scorecard
- Inside the Implementation Roadmap section → process-diagram
- Inside the Risks and Considerations section → risk-matrix
- In the Executive Summary when there are 3+ headline statistics → infographic

USE 2–5 visual placeholders per whitepaper. Never place two consecutively. Never in the Executive Summary text body — only after it, if flagged.

═══════════════════════════════════════════════════
VOICE & ANALYTICAL TONE RULES
═══════════════════════════════════════════════════
- Write in second person ("you", "your organisation") when addressing the reader's situation. Use "we" only when speaking as ${ctx.companyName} or the authoring body.
- Be direct and confident. A whitepaper that hedges every statement is useless. Hedge only where genuine uncertainty exists — and name the uncertainty source explicitly.
- Vary sentence length for emphasis: short sentences for conclusions, longer sentences to build the analytical chain. Average ≤ 20 words per sentence.
- Use contractions sparingly — one or two per section is fine, but this is a formal document.
- Do NOT use em-dashes (—) or en-dashes (–) to connect clauses or offset parenthetical phrases. These are a primary signature of AI-generated content and make the text look robotic. Instead, use standard commas, colons, parentheses, or break the sentence into two separate, short sentences. When using bold prefixes or list numbers (e.g. **1. [Name]**), always add a space or colon-space after the closing bold tag, never join it directly to the next word.
- Name things specifically. "A financial services firm in ${ctx.regionLabel}" is better than "a large enterprise". "ISO 27001:2022 Annex A.8.7" is better than "industry security standards".
- The Executive Summary must read as a standalone document. A decision-maker who reads only the Executive Summary should understand the problem, the core finding, and the recommendation — without reading the rest.
- Every section must open with a 2–3 sentence thesis that answers its core question before supporting analysis follows. This is not optional.

═══════════════════════════════════════════════════
OUTPUT CONTRACT — STRUCTURE
═══════════════════════════════════════════════════
Produce ONE Markdown document in the exact structure below, then the ---META--- block. Use these heading levels exactly.

# ${ctx.topic}
**[Subtitle — one line establishing the specific problem and audience, 20–160 characters]**

> Published by ${ctx.companyName} · ${publicationDate} · Data current through ${publicationDate}

---

## Executive Summary

[3–5 short paragraphs. Total length: 200–550 words. Must function as a standalone document.
Paragraph 1: State the problem in one sentence, then give the headline finding with a cited statistic.
Paragraph 2: The proposed framework or approach — what this whitepaper argues.
Paragraph 3: Top 3 findings in plain language — no jargon, each in 1–2 sentences with a cited figure.
Paragraph 4: Top 3 recommendations in plain language — action verb + measurable outcome.
Paragraph 5 (optional): Call to action or who should act on this.
The first sentence of the Executive Summary MUST directly answer the topic question — this is the AI Overview anchor.]

<!-- VISUAL_PLACEHOLDER type="infographic" title="Key Findings at a Glance" desc="Summary of the 3 headline statistics from the executive summary" data="[top 3 cited figures from the summary]" source="[sources]" -->

---

## Industry Context

[Frame the macro problem with cited data specific to ${ctx.regionLabel}. Open with a 2–3 sentence thesis. Show what has changed recently — regulatory shifts, market structure changes, technology disruptions — and why this matters now for ${ctx.industry === 'general' ? 'the relevant industry' : ctx.industry}. Must cite at least 3 primary sources here — link to actual source pages, not summaries. Show the data; do not narrate it. Include a comparison or trend visual when the data warrants it.]

---

## Problem Definition

[Make the pain explicit and specific. Who feels it (named stakeholder types)? What does it cost them (quantified where possible, with citations)? What decision pressure or regulatory driver makes this urgent in ${ctx.regionLabel} right now? Cite operational data, not anecdotes. Acknowledge the range of scale — small vs large organisations in ${ctx.industry} face different versions of this problem.]

---

## Methodology

[Be transparent about how this analysis was constructed: what sources were consulted, the time window covered, the scope, and any limitations. Honesty here builds credibility. If primary research was conducted, describe the sample and method. If this is a synthesis of secondary sources, say so clearly and describe the selection criteria. This section does not need to be long — 150–300 words — but it must exist.]

---

## Findings

[3–5 ### sub-sections. Each sub-section is one specific, named finding.

Structure for each finding:
### Finding [N]: [One-sentence headline stating the finding as a fact, not a question]
[DIRECT ANSWER FIRST: 2–3 sentences giving the finding upfront, with the headline cited statistic.]
[1–2 supporting paragraphs with cited evidence from ${ctx.regionLabel} sources. Show the data clearly.]
[One "So what" sentence connecting this finding to a business or operational outcome the reader cares about.]

Insert a VISUAL_PLACEHOLDER after any finding that involves comparative or trend data.]

---

## Strategic Analysis

[Synthesise the findings. What do they add up to? What does an organisation in ${ctx.industry} in ${ctx.regionLabel} need to understand at a strategic level?

This section MUST include at least one data comparison table in Markdown format — comparing approaches, maturity levels, cost structures, vendor classes, or scenarios side by side. Minimum 2 columns, 3 rows.

Link every comparative claim to a primary source. Do not generalise — be specific to ${ctx.regionLabel} context.]

<!-- VISUAL_PLACEHOLDER type="comparison-table" title="[Strategic Options Comparison]" desc="Side-by-side comparison of the main strategic approaches or scenarios" data="[Key criteria and relative scores/values]" source="[sources]" -->

---

## Recommendations

[Numbered list of 5–8 recommendations. Minimum 5.

Each recommendation must follow this format:
**[N]. [Action verb] + [specific outcome]: [1–2 sentences of detail]**
Horizon: [Immediate (0–90 days) | Mid-term (6–12 months) | Long-term (12–24 months)]

Recommendations must be:
- Specific enough to act on without asking a follow-up question
- Connected to one or more findings above
- Calibrated to the ${ctx.audience} audience — C-suite recs focus on investment and governance; analyst recs focus on methodology; engineering recs focus on implementation]

---

## Implementation Roadmap

[Sequence the recommendations into 3 horizons. Use a Markdown table or structured bullets with clear phase labels.

Horizon 1 — Immediate (0–90 days): [3–4 actions from the Recommendations list]
Horizon 2 — Mid-term (6–12 months): [3–4 actions]
Horizon 3 — Long-term (12–24 months): [2–3 actions]

Each action in the roadmap must name the responsible stakeholder type and a measurable output.]

<!-- VISUAL_PLACEHOLDER type="process-diagram" title="Implementation Roadmap" desc="Three-horizon implementation sequence with responsible roles and outputs" data="[Phases, actions, owners, outputs from the roadmap section]" source="Internal framework" -->

---

## Risks and Considerations

[Bullet list of 4–6 risks. For each risk:
**Risk:** [Name and one-sentence description]
**Likelihood in ${ctx.regionLabel}:** [High / Medium / Low — with a 1-sentence rationale citing regional context]
**Mitigation:** [One sentence — specific action or safeguard]]

<!-- VISUAL_PLACEHOLDER type="risk-matrix" title="Risk Landscape" desc="Probability vs. impact grid for the identified risks" data="[Risk names with likelihood and impact ratings]" source="Analysis framework" -->

---

## Conclusion

[Max 200 words. Restate the core problem and why it matters now in ${ctx.regionLabel}. Name the single most important insight from the Findings. Connect ${ctx.companyName}'s offerings to the solution — once, briefly, without jargon. End with one sentence that maps directly to: ${ctx.businessObjective}. No "in conclusion" opener.]

---

## References

[List every primary source cited in the body using the REFERENCES FORMAT defined in the CITATION STANDARD above. Number in order of first appearance. Minimum 12.]

1. …
2. …

---META---
{
  "cover_title": "string",
  "cover_subtitle": "string (20–160 chars)",
  "meta_description": "150–160 chars summary including ${ctx.primaryKeyword}",
  "slug": "url-slug-from-cover-title",
  "executive_summary": "≤ 600 char distillation of the executive summary — for database storage",
  "sections": [
    { "number": 1, "title": "Industry Context", "summary": "1–2 sentence summary of what this section establishes" }
  ],
  "recommendations": ["string — each recommendation as a single sentence", "string"],
  "references": ["https://...", "https://..."],
  "external_links": ["https://...", "https://..."],
  "internal_links": ["https://... or /path"],
  "semantic_keywords": ["primary phrase", "phrase 2"]
}

═══════════════════════════════════════════════════
CRITICAL ENFORCEMENT RULES
═══════════════════════════════════════════════════
Every rule below is enforced. Violating any one invalidates the output.

EEAT & CREDIBILITY:
- Every quantitative claim must be followed by "(Source, Year)" attribution.
- Every recommendation must be testable — if you cannot define what "success" looks like for it, rewrite it.
- The Methodology section must exist and be honest about limitations.
- ${ctx.brandVoice ? `Align style strictly with the Brand Voice: ${ctx.brandVoice}.` : ctx.brief?.tone ? `Match the brand tone above.` : 'Maintain an analytical, evidence-led, direct tone throughout.'}

BANNED PHRASES — automatic reject if any appear:
"in today's world", "in recent years", "it goes without saying", "needless to say", "as we all know", "navigating", "delving into", "unlocking", "game-changer", "leveraging", "synergies", "cutting-edge", "best-in-class", "robust", "harnessing", "ever-evolving", "plethora", "seamless", "holistic", "paradigm shift", "world-class", "industry-leading", "state-of-the-art", "in conclusion", "to summarise", "this whitepaper will".

STRUCTURE:
- Minimum 8 H2 sections (the structure above provides exactly this — do not merge or drop any).
- Minimum 3 H3 sub-sections in Findings (one per finding).
- Minimum 5 recommendations.
- Minimum 4 risks.
- Minimum 12 primary-source citations in the body.
- Minimum 2 internal links from the pool embedded in body text.
- 2–5 VISUAL_PLACEHOLDER comments, correctly formatted.
- At least one Markdown comparison table in Strategic Analysis.

FORBIDDEN LINKS:
- No Wikipedia links.
- No blog post links (Medium, Substack, HubSpot, Forbes contributor, LinkedIn articles).
- No vendor product pages or competitor sites.
- No links to root domains — must be a specific page URL.
- No fabricated or unverifiable URLs.

GEO + AEO OPTIMISATION:
- Every section opens with a 2–3 sentence direct thesis before supporting analysis.
- Bold the first use of every key term with a ≤ 20 word inline definition.
- At least 2 H2 or H3 subheadings must be phrased as the exact questions a decision-maker would ask.
- End each major section (not sub-section) with a 3–5 bullet "Key Takeaways" list — this is the block AI research engines extract for answers.
- Name all relevant standards, frameworks, regulatory bodies, and vendors explicitly so AI models can map the knowledge graph.
- Active voice. Average sentence ≤ 20 words. No passive-voice constructions where active is possible.`;
}
