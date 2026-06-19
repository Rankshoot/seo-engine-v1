import type { ResearchContext } from '@/lib/research';
import { formatResearchForPrompt } from '@/lib/research';
import type { BusinessBrief } from '@/lib/business-brief';
import type { Project } from '@/lib/types';

export interface BlogPromptContext {
  entry: {
    focus_keyword: string;
    title: string;
    article_type: string;
    secondary_keywords?: string[];
  };
  project: Project;
  wordCount: number;
  research?: ResearchContext | null;
  existingBlogs?: Array<{ title: string; slug: string; target_keyword: string }>;
  brief?: BusinessBrief | null;
  ahrefsContext?: any;
  writerNotes?: string;
  brandPersona?: string;
  customInstructions?: string;
  deepAnalysisSummary?: string;
}

function formatAhrefsContextForPrompt(ahrefs: any): string {
  // DEBUG: Log incoming data to terminal
  console.log('[blog-prompt] formatAhrefsContextForPrompt called with:', {
    hasMatchingTerms: !!ahrefs?.matchingTerms?.length,
    hasQuestions: !!ahrefs?.questions?.length,
    hasSerp: !!ahrefs?.serp?.length,
    hasSecondaryKeywords: !!ahrefs?.secondaryKeywords?.length,
    hasFaqKeywords: !!ahrefs?.faqKeywords?.length,
    matchingTermsCount: ahrefs?.matchingTerms?.length ?? 0,
    questionsCount: ahrefs?.questions?.length ?? 0,
    secondaryKeywordsCount: ahrefs?.secondaryKeywords?.length ?? 0,
    faqKeywordsCount: ahrefs?.faqKeywords?.length ?? 0,
    secondaryKeywords: ahrefs?.secondaryKeywords?.slice(0, 3),
    faqKeywords: ahrefs?.faqKeywords?.slice(0, 3),
  });

  const matching = (ahrefs.matchingTerms ?? [])
    .slice(0, 10)
    .map((k: any) => `- ${k.keyword} (vol: ${k.volume ?? 0})`)
    .join('\n');
  const questions = (ahrefs.questions ?? [])
    .slice(0, 10)
    .map((k: any) => `- ${k.keyword} (vol: ${k.volume ?? 0})`)
    .join('\n');
  const serp = (ahrefs.serp ?? [])
    .slice(0, 8)
    .map((s: any) => `- Position ${s.position}: ${s.title} (${s.url})`)
    .join('\n');

  // NEW: Secondary keywords for blog headings (from API #3)
  const secondaryKeywords = (ahrefs.secondaryKeywords ?? [])
    .slice(0, 7)
    .map((k: any) => `- ${k.keyword} (vol: ${k.volume ?? 0}${k.difficulty !== null ? `, KD: ${k.difficulty}` : ''})`)
    .join('\n');

  // NEW: FAQ keywords for blog FAQ section (from API #4)
  const faqKeywords = (ahrefs.faqKeywords ?? [])
    .slice(0, 5)
    .map((k: any) => `- ${k.keyword} (vol: ${k.volume ?? 0}${k.difficulty !== null ? `, KD: ${k.difficulty}` : ''})`)
    .join('\n');

  let result = `
AHREFS LIVE KEYWORD & SERP CONTEXT:
Matching terms:
${matching || '(none)'}

Questions:
${questions || '(none)'}

Top SERP competitors:
${serp || '(none)'}
`;

  // Add secondary keywords section if available
  if (secondaryKeywords) {
    result += `\nSECONDARY KEYWORDS (USE EXACTLY AS PROVIDED):\nUse these keywords EXACTLY as written below — do NOT rephrase, pluralize, shorten, expand, or change word order.\nInclude them naturally in the blog content, preferably in relevant H2/H3 headings.\nIf a keyword does not fit as a heading, use it naturally in paragraph text exactly as provided:\n${secondaryKeywords}\n`;
  }

  // Add FAQ keywords section if available
  if (faqKeywords) {
    result += `\nFAQ KEYWORDS/QUESTIONS (USE AS-IS, MERGE DUPLICATES):\nUse these questions EXACTLY as written below — do NOT rephrase, alter meaning, or change wording.\nIf two questions are duplicates or have the same meaning, merge them into ONE comprehensive FAQ.\nInclude ALL unique questions in the FAQ section with crisp, useful answers (~50 words each):\n${faqKeywords}\n`;
  }

  return result;
}

export function buildBlogPrompt(ctx: BlogPromptContext): string {
  const { entry, project, wordCount, research, existingBlogs, brief, ahrefsContext, writerNotes, brandPersona, customInstructions, deepAnalysisSummary } = ctx;

  // 1. Internal link pool block
  const allInternalCandidates = [
    ...(brief?.internal_link_candidates ?? [])
      .filter(l => l.url && l.url.startsWith('http'))
      .map(l => ({ url: l.url, title: l.title || l.topic || 'Page', topic: l.topic, type: 'site' as const })),
    ...(existingBlogs ?? [])
      .filter(b => b.target_keyword !== entry.focus_keyword)
      .map(b => ({
        url: `https://${project.domain}/${b.slug}`,
        title: b.title,
        topic: b.target_keyword,
        type: 'generated' as const
      }))
  ];

  const siteLinks = allInternalCandidates.filter(c => c.type === 'site').slice(0, 12);
  const generatedLinks = allInternalCandidates.filter(c => c.type === 'generated').slice(0, 8);

  let internalLinksBlock = '';
  if (siteLinks.length || generatedLinks.length) {
    const siteBlock = siteLinks.length
      ? `User's own website pages (prefer these — use the absolute URL as the link target, with natural anchor text):\n${siteLinks
          .map(l => `- ${l.title} · ${l.url}${l.topic ? ` (topic: ${l.topic})` : ''}`)
          .join('\n')}`
      : '';
    const generatedBlock = generatedLinks.length
      ? `Blog posts we've generated in this project (use absolute URLs like https://${project.domain}/blog/slug or https://${project.domain}/slug):\n${generatedLinks
          .map(b => `- "${b.title}" → ${b.url} (keyword: ${b.topic})`)
          .join('\n')}`
      : '';
    internalLinksBlock = `\nINTERNAL LINKING (use 4–6 total where contextually relevant, split across the two pools, placed where they genuinely help the reader. Use only validated links from the provided pool. Do not invent internal URLs, slugs, or pages. If fewer than 4 validated internal links are available, use all available validated links instead of inventing links):\n${[siteBlock, generatedBlock].filter(Boolean).join('\n\n')}`;
  }

  // 2. External research context (competitor articles — for topic reference only, NOT for citation links)
  let researchContextBlock = '';
  if (research && research.topArticles && research.topArticles.length > 0) {
    const articles = research.topArticles.slice(0, 8);
    if (articles.length > 0) {
      researchContextBlock = `\nTOPIC RESEARCH CONTEXT (these are top-ranking competitor articles — use them to understand what angles to cover, but DO NOT link to them as citations):\n${articles
        .map(art => `- ${art.title} → ${art.url}`)
        .join('\n')}\n`;
    }
  }

  // 3. User-supplied writer notes
  const writerCap = writerNotes && writerNotes.includes("CONTENT HEALTH AUDIT") ? 12000 : 2500;
  const writerNotesBlock = writerNotes && writerNotes.length > 0
      ? `\nWRITER / EDITOR NOTES (user-supplied — follow closely; resolve conflicts in favour of these notes when they do not break factual accuracy or the structural rules below):\n${writerNotes.slice(0, writerCap)}\n`
      : "";

  // If caller passes an explicit brandPersona string (from Advanced Options), use that.
  // Otherwise fall back to project fields.
  const brandPersonaBlock = brandPersona
    ? `\nBRAND PERSONA (user-supplied for this blog — follow closely):\n${brandPersona}\n`
    : (project.brand_voice || project.brand_values || project.brand_description)
      ? `\nBRAND PERSONA:\n${project.brand_voice ? `- Brand Voice/Tone: ${project.brand_voice}\n` : ""}${project.brand_values ? `- Core Values/Messaging: ${project.brand_values}\n` : ""}${project.brand_description ? `- Brand Personality/Description: ${project.brand_description}\n` : ""}`
      : "";

  const customInstructionsBlock = customInstructions
    ? `\nCUSTOM INSTRUCTIONS (user-supplied — follow exactly; these take priority over general style guidance):\n${customInstructions}\n`
    : "";

  const deepAnalysisSummaryBlock = deepAnalysisSummary
    ? `\nCOMPETITOR CONTENT GAP ANALYSIS (derived from scraping the top 5 ranking pages — use this to ensure your blog outranks them by covering what they miss):\n${deepAnalysisSummary}\n`
    : "";

  const briefBlock = brief
    ? `\nCOMPANY CONTEXT (use as grounding — the article must sound like it was written by ${project.company}, for their audience; weave products/entities in naturally; do NOT pitch competitor names)
- Summary: ${brief.summary || '(none)'}
- Products / offerings: ${brief.products.slice(0, 10).join(', ') || '(none listed)'}
- Key entities: ${brief.entities.slice(0, 15).join(', ') || '(none)'}
- Audience segments: ${brief.audiences.slice(0, 6).join(' | ') || project.target_audience}
- USPs: ${brief.usps.slice(0, 6).join(' | ') || '(none)'}
- Tone: ${project.brand_voice || brief.tone || 'professional, expert, helpful'}
${brandPersonaBlock}`
    : brandPersonaBlock ? `\nBRAND PERSONA:\n${brandPersonaBlock}\n` : "";

  const researchBlock = research ? formatResearchForPrompt(research) : '';
  const ahrefsBlock = ahrefsContext && (
      ahrefsContext.ideas?.length ||
      ahrefsContext.serp?.length ||
      ahrefsContext.matchingTerms?.length ||
      ahrefsContext.secondaryKeywords?.length ||
      ahrefsContext.faqKeywords?.length
    )
    ? formatAhrefsContextForPrompt(ahrefsContext)
    : '';

  // Secondary keywords list
  const termsMatchList = ahrefsContext?.matchingTerms?.length
    ? ahrefsContext.matchingTerms
        .slice(0, 10)
        .map((k: any, i: number) => `${i + 1}. ${k.keyword}${k.volume ? ` (${k.volume.toLocaleString()} searches/mo)` : ''}`)
        .join('\n')
    : entry.secondary_keywords?.length
      ? entry.secondary_keywords
          .slice(0, 10)
          .map((kw, i) => `${i + 1}. ${kw}`)
          .join('\n')
      : 'none — derive 7–8 topically relevant H2s from the primary keyword';

  // FAQ Seeds
  const ahrefsQuestions = ahrefsContext?.questions?.length
    ? ahrefsContext.questions
        .slice(0, 10)
        .map((k: any) => `• ${k.keyword}${k.volume ? ` (${k.volume.toLocaleString()} searches/mo)` : ''}`)
        .join('\n')
    : '';

  const paaQuestions = research?.peopleAlsoAsk?.length
    ? research.peopleAlsoAsk
        .slice(0, 7)
        .map(q => `• ${q.question}${q.answer ? `\n  Hint: ${q.answer}` : ''}`)
        .join('\n')
    : '';

  const faqSeeds = [ahrefsQuestions, paaQuestions].filter(Boolean).join('\n') ||
    'none available — use the most common search questions around this topic';

  return `You are an expert SEO content strategist and writer. Your job is to produce a blog post that ranks in Google, gets cited by AI Overviews, and converts readers for ${project.company}.

CRITICAL OUTPUT RULE: Your response must be a single, valid JSON object ONLY. Do NOT write any markdown fences outside the JSON, do NOT write any explanation before or after, and do NOT include raw JSON blocks inside the markdown body itself. The entire output must parse successfully as JSON.

JSON SCHEMA:
{
  "title": "A compelling H1 title that MUST include the primary keyword verbatim",
  "metaDescription": "Exactly 150-160 characters long, written as a clear sentence, and MUST contain the primary keyword verbatim",
  "contentMarkdown": "Clean markdown content starting with '# [H1 Title]'. Must contain intro, modular H2/H3 sections, FAQs, and a conclusion. Do NOT leak raw JSON keys inside the markdown content.",
  "faqQuestions": ["Question 1", "Question 2", "Question 3", "Question 4", "Question 5", "Question 6", "Question 7"],
  "internalLinksUsed": ["/slug-or-absolute-url-1", "/slug-or-absolute-url-2"],
  "externalLinksUsed": ["https://url1", "https://url2", "https://url3"]
}

════════════════════════════════════════
INPUTS
════════════════════════════════════════
PRIMARY KEYWORD: "${entry.focus_keyword}"
ARTICLE TITLE:   "${entry.title}"
ARTICLE TYPE:    ${entry.article_type}
TARGET AUDIENCE: ${project.target_audience}
INDUSTRY/NICHE:  ${project.niche}
COMPANY:         ${project.company} (${project.domain})
WORD COUNT:      ~${wordCount} words
${writerNotesBlock}${briefBlock}${internalLinksBlock}

SECONDARY KEYWORDS / H2 TOPICS:
${termsMatchList}

FAQ SEEDS (People Also Ask):
${faqSeeds}

${researchBlock}
${ahrefsBlock}
${researchContextBlock}${deepAnalysisSummaryBlock}${customInstructionsBlock}

════════════════════════════════════════
SEO SCORE REQUIREMENTS — the blog must strictly satisfy all of these:
════════════════════════════════════════
1. WORD COUNT: Minimum ${Math.max(wordCount, 1500)} words (target ${wordCount}).
2. TITLE KEYWORD: Primary keyword "${entry.focus_keyword}" MUST appear in the H1 title.
3. INTRO KEYWORD: Primary keyword "${entry.focus_keyword}" MUST appear within the first 100 words of the intro paragraph.
4. KEYWORD DENSITY: Mention "${entry.focus_keyword}" naturally 1× per ~150–200 words (0.5–3% density). Spread mentions evenly — not just intro + conclusion.
5. H2 HEADINGS: At least 5 × ## headings in the contentMarkdown (the scorer requires >= 3).
6. H3 SUB-HEADINGS: At least 2 × ### headings inside long H2 body sections to organize sub-topics.
7. FAQ SECTION: MUST have a heading that reads exactly "## FAQs" (or "## Frequently Asked Questions"). Include exactly 7 to 10 Q&A pairs, each question as a ### heading.
8. EXTERNAL LINKS: Include 4–6 highly credible external citations. Format: [anchor text](https://...). Each external link must directly support the exact claim near the link. RULES: (a) Link to the PRIMARY SOURCE of every claim — the actual research report, dataset, government page, or academic paper — not a blog post summarising it. (b) Preferred authoritative sources: .gov, .edu, WHO, CDC, World Bank, ILO, OECD, WEF, PubMed/NCBI, McKinsey, Gartner, Deloitte, PwC, EY, BCG, Bain, Accenture, Forrester, Statista (direct report pages), SHRM, LinkedIn official research reports, IEEE, ISO, peer-reviewed journals. (c) Never link to root domains alone (e.g. "https://www.gartner.com") — always deep-link to the specific report or article page. (d) Never link to competitor blogs, vendor landing/product pages, Medium, Reddit, Quora, listicles, or any URL that is primarily promotional. (e) Never invent fake report URLs — if a citation is uncertain, skip it instead of adding a weak link. (f) Never use the same URL twice. Each citation must be a distinct, unique deep-linked URL.
9. INTERNAL LINKS: Include 4–6 internal links from the INTERNAL LINKING pool wherever contextually relevant. Format: [anchor text](/slug) or absolute URL. Use only validated links from the provided pool. Do not invent internal URLs, slugs, or pages. If fewer than 4 validated internal links are available, use all available validated links instead of inventing links.
10. META DESCRIPTION: Exactly 150–160 characters long and MUST contain "${entry.focus_keyword}".
11. NO FILLER: Avoid crutch words ("In today's world", "In recent years", "As we navigate", "game-changer", "In today's rapidly evolving landscape", "unlock the power of", "delve into"). Use specific wording and practical examples instead of vague claims.
12. HUMAN TONE: Write in a natural, human editorial tone with varied sentence rhythm, practical examples, small connective phrases, and smooth transitions. Avoid robotic, repetitive, overly polished AI-style phrasing. Keep paragraphs readable and natural.

════════════════════════════════════════
EDITORIAL AND FORMATTING REQUIREMENTS:
════════════════════════════════════════
1. INTRODUCTION — HOOK FIRST:
   - Do NOT open with a trend statement ("X is becoming...", "In the evolving world of...", "X is the backbone of..."). These are invisible to readers.
   - Open with ONE of these instead: (a) a specific scenario that puts the reader inside a real problem ("A plant head calls at 6:40 a.m..."), (b) a contrarian statement that challenges a common assumption ("Most companies treat this role as a shopfloor vacancy. It is a business continuity position."), or (c) a hard, specific fact that reframes the problem immediately.
   - Then within the first 100 words: state who this is for, what they'll get from reading it, and include the primary keyword "${entry.focus_keyword}" naturally.
   - You MUST include exactly 1 verifiable data point or statistic from a credible source in the intro. Do NOT invent stats.

2. VOICE — TAKE POSITIONS, NOT JUST DESCRIBE PROBLEMS:
   - Write with a point of view. Make declarative statements. Say "That's backwards." not "This approach may have limitations."
   - Call out common mistakes directly: "The most common hiring mistake is...", "Most JDs get this wrong by...", "If your process starts when someone resigns, you're already late."
   - Opinionated subheadings outperform descriptive ones. "Your hiring model is probably too narrow" beats "Hiring Challenges". Use this style where it fits naturally.
   - Avoid hedge words: "may", "could", "might", "in some cases", "it's worth noting". If a claim is true, state it. If uncertain, cite the source and move on.

3. ANSWER-FIRST SECTION DESIGN:
   - Every major heading (H2/H3) should address the reader's intent quickly before expanding.
   - Strictly avoid generic GPT-style heading words: "navigating", "nuances", "at a glance", "delve", "unlock", "landscape", "realm", "ever-evolving".
   - **Snippet Answer Rule**: Immediately under every H2 heading, you MUST add a crisp, bold 40-50 word paragraph that directly answers that H2 topic (ideal for featured snippets). Then, continue with detailed explanation.

4. CONTENT FORMATTING & READABILITY:
   - Use a healthy, balanced mix of: short paragraphs (3-4 lines max), bullet lists, and markdown tables where comparisons or data are present.
   - Sentences MUST average 10-12 words. Count mentally — if a sentence runs past 20 words, break it. This is the single biggest readability lever.
   - Use simple language that breaks complexity into simple words. Use active voice throughout.
   - Use transition words naturally to improve reading flow (e.g. "because", "for example", "however", "therefore", "meanwhile", "as a result"). Do not overuse them.

5. PRACTICAL TOOLKIT SECTIONS (include where the article type justifies it):
   - For role guides, hiring guides, or "how to hire X" articles: include a job description template section with a sample JD the reader can adapt. Format it as a structured block under its own H2.
   - For hiring or assessment guides: include an interview questions section with 4-6 questions AND a model answer or "what good looks like" note for each. This is the single most bookmarked section type in HR content.
   - For comparison or strategy articles: include at least one Markdown comparison table that lets the reader make a decision.
   - These sections are what convert readers into return visitors and earn backlinks. Do not skip them when the article type calls for them.

6. IMAGES AND INFOGRAPHICS:
   - Include exactly 2-3 relevant image placeholder suggestions inside \`contentMarkdown\` exactly in this format:
     ![Suggested image: Description of a highly contextual image matching the paragraph](image-placeholder)
     (e.g., ![Suggested image: HR team reviewing recruitment dashboard](image-placeholder))
   - Include exactly 1 relevant infographic suggestion block where it adds workflow value in this format:
     > Infographic suggestion: Description of the infographic flow/process here.
     (e.g., > Infographic suggestion: A 5-step RPO hiring workflow from requirement intake to onboarding.)

7. NATURAL INTERLINKING & "ALSO READ" CALLOUTS:
   - Target 4–6 internal links total. Use verified internal links only from the provided INTERNAL LINKING pool. Do NOT invent internal URLs, slugs, or pages.
   - If fewer than 4 validated internal links are available, use all available ones — never invent additional links to hit the count.
   - If a validated internal link cannot be naturally woven into the prose of the paragraphs, you MUST include a clean callout block:
     > **Also Read:** [Anchor text / Title of the related blog](https://domain/slug)

8. CITATIONS & EXTERNAL LINKING:
   - Target 4–6 external citations total. Every external citation must directly support the exact claim near the link.
   - Every external citation must point to the PRIMARY SOURCE of the claim — the actual study, report, dataset, or official page — not a blog post or article that summarises it.
   - Preferred authoritative sources: .gov, .edu, WHO, CDC, World Bank, ILO, OECD, WEF, PubMed/NCBI, McKinsey, Gartner, Deloitte, PwC, EY, BCG, Bain, Accenture, Forrester, Statista (direct report pages), SHRM, LinkedIn official research reports, IEEE, ISO, peer-reviewed journals.
   - Never link to competitor blogs, vendor landing/product pages, Medium, Reddit, Quora, listicles, or any URL that is primarily promotional.
   - Never link to root domains (e.g. "https://gartner.com"). Always deep-link to the specific report, article, or data page.
   - Never invent fake report URLs. If a citation is uncertain, skip it — do not add a weak link just to reach the count.
   - Never use the same URL twice. Each citation must be a distinct, unique deep-linked URL.

9. AUTHORITY-BUILDING SECTIONS & GROUNDING:
   - Weave in 2-4 headings representing authority-building angles based on ${project.company}'s niche and the focus keyword "${entry.focus_keyword}".
   - Subtly highlight how professional solutions (e.g. RPO / recruitment partnership services) solve strategic hiring challenges, without sounding overly salesy.

10. FAQ SECTION:
   - Include exactly 7 to 10 FAQs. Seed 3-4 of them directly from the provided People Also Ask/Ahrefs questions.
   - Format each question as ### [Question Text].
   - Provide direct, helpful answers (around 50 words each) that are highly practical, concise, and non-repetitive (Google snippet-friendly).

11. PERSONALIZATION FOR HEAD+ DECISION MAKERS:
   - Address Head+ designations in HR (such as CHROs, HR leaders, TA leaders, HR Heads, HRBPs, HR Managers) to appeal to thought-leadership style articles, focusing on emerging roles, recruitment transformations, and workforce changes.

Return JSON only.`;
}
