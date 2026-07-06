import type { ResearchContext } from '@/lib/research';
import { formatResearchForPrompt } from '@/lib/research';
import type { BusinessBrief, InternalLinkCandidate } from '@/lib/business-brief';
import type { Project } from '@/lib/types';
import { minCitationYear } from '@/lib/blog-content';

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
  /**
   * Relevance-ranked internal-link candidates sourced from the project's saved
   * sitemap. Merged into the "site" pool alongside the brief's candidates so
   * generated articles deep-link to other content pages, not just the homepage.
   * Already ranked + capped by the caller; validated upstream when possible.
   */
  extraInternalLinks?: InternalLinkCandidate[];
  /**
   * Top follow-up questions real users ask after searching the primary
   * keyword (sourced live from Perplexity, falling back to People-Also-Ask).
   * Each becomes a dedicated, AEO-optimised H2 section in the article.
   */
  followUpQuestions?: string[];
  ahrefsContext?: any;
  writerNotes?: string;
  brandPersona?: string;
  customInstructions?: string;
  deepAnalysisSummary?: string;
}

function formatAhrefsContextForPrompt(ahrefs: any): string {
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
  const { entry, project, wordCount, research, existingBlogs, brief, extraInternalLinks, followUpQuestions, ahrefsContext, writerNotes, brandPersona, customInstructions, deepAnalysisSummary } = ctx;

  // Recency window for citations: sources must be from this year or newer.
  const currentYear = new Date().getFullYear();
  const freshnessFloor = minCitationYear();

  // 1. Internal link pool block.
  //    Site pool = brief.internal_link_candidates ∪ sitemap-derived candidates
  //    (extraInternalLinks). Deduped by URL so a page that appears in both
  //    isn't listed twice. The sitemap pool is what lets the model deep-link to
  //    other blog/content pages instead of only the homepage.
  const siteCandidatesRaw = [
    ...(brief?.internal_link_candidates ?? []),
    ...(extraInternalLinks ?? []),
  ]
    .filter(l => l.url && l.url.startsWith('http'))
    .map(l => ({ url: l.url, title: l.title || l.topic || 'Page', topic: l.topic, type: 'site' as const }));

  const seenSiteUrls = new Set<string>();
  const dedupedSiteCandidates = siteCandidatesRaw.filter(c => {
    const key = c.url.replace(/\/+$/, '').toLowerCase();
    if (seenSiteUrls.has(key)) return false;
    seenSiteUrls.add(key);
    return true;
  });

  const allInternalCandidates = [
    ...dedupedSiteCandidates,
    ...(existingBlogs ?? [])
      .filter(b => b.target_keyword !== entry.focus_keyword)
      .map(b => ({
        url: `https://${project.domain}/${b.slug}`,
        title: b.title,
        topic: b.target_keyword,
        type: 'generated' as const
      }))
  ];

  const siteLinks = allInternalCandidates.filter(c => c.type === 'site').slice(0, 24);
  const generatedLinks = allInternalCandidates.filter(c => c.type === 'generated').slice(0, 8);

  // The site's Contact page (when present in the pool) — the closing CTA must
  // link to it so every article ends with a clear conversion path.
  const contactLink = siteLinks.find(l =>
    /(^|\/)(contact(-us)?|contactus|get-in-touch|getintouch|reach-us|talk-to-us|book-a-(call|demo|meeting))(\/|$|\.)/i.test(
      (() => { try { return new URL(l.url).pathname; } catch { return l.url; } })()
    ) || /contact/i.test(l.topic ?? '')
  );

  const ctaInstruction = contactLink
    ? `END the article with a short, natural call-to-action that links to the site's Contact Us page: ${contactLink.url} (this exact URL). A product/solution page link elsewhere in the body is still encouraged when the pool offers one.`
    : `END the article with a short, natural call-to-action that links to the most relevant product/solution/landing page — fall back to the site homepage https://${project.domain} only if no better page exists.`;

  let internalLinksBlock = '';
  if (siteLinks.length || generatedLinks.length) {
    const siteBlock = siteLinks.length
      ? `User's own website pages (prefer these — use the absolute URL as the link target, with natural anchor text; when several pages fit equally well, prefer the most recently updated one — "updated YYYY-MM-DD" in the topic marks recency):\n${siteLinks
          .map(l => `- ${l.title} · ${l.url}${l.topic ? ` (topic: ${l.topic})` : ''}`)
          .join('\n')}`
      : '';
    const generatedBlock = generatedLinks.length
      ? `Blog posts we've generated in this project (listed NEWEST FIRST — prefer linking the most recent posts; use absolute URLs like https://${project.domain}/blog/slug or https://${project.domain}/slug):\n${generatedLinks
          .map(b => `- "${b.title}" → ${b.url} (keyword: ${b.topic})`)
          .join('\n')}`
      : '';
    internalLinksBlock = `\nINTERNAL LINKING (use 3–7 total — NEVER more than 7 — where contextually relevant, split across the two pools, placed where they genuinely help the reader. Use only validated links from the provided pool. Do not invent internal URLs, slugs, or pages. If fewer than 3 validated internal links are available, use all available validated links instead of inventing links. When the pool contains a product / solution / pricing / landing page, include at least one such link. ${ctaInstruction}):\n${[siteBlock, generatedBlock].filter(Boolean).join('\n\n')}`;
  }

  // 1b. Live follow-up questions (Perplexity / PAA) → mandatory AEO H2 sections.
  const followUps = (followUpQuestions ?? []).map(q => q.trim()).filter(Boolean).slice(0, 3);
  const followUpsBlock = followUps.length
    ? `\nSEARCHER FOLLOW-UP QUESTIONS (fetched live for "${entry.focus_keyword}" — these are the questions real users ask next after this search):\n${followUps
        .map((q, i) => `${i + 1}. ${q}`)
        .join('\n')}\nRULES FOR FOLLOW-UP SECTIONS (mandatory):\n- Dedicate one full ## H2 section to EACH question above, using the question itself (or a near-verbatim, natural phrasing that keeps it a question) as the H2 text.\n- Immediately under each of these H2s, write a 40–55 word snippet paragraph that fully and directly answers the question, with the first sentence in **bold** — then expand with practical detail beneath it.\n- These sections count toward (and can satisfy) the question-phrased-H2 requirements in the AEO rules below.\n- Do NOT duplicate these questions again in the FAQ section — cover different questions there.\n`
    : '';

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
${writerNotesBlock}${briefBlock}${internalLinksBlock}${followUpsBlock}

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
2. TITLE KEYWORD: Primary keyword "${entry.focus_keyword}" MUST appear in the H1 title. Keep the title ≤ 60 characters so it never truncates in search results, and front-load the keyword (as close to the start as natural English allows).
3. INTRO KEYWORD: Primary keyword "${entry.focus_keyword}" MUST appear within the first 100 words of the intro paragraph.
4. KEYWORD USAGE — NATURAL, NEVER FORCED: Use "${entry.focus_keyword}" only where it genuinely reads naturally (a loose target of 0.5–2% density). Content quality and usefulness ALWAYS win over density: if a section reads better with a pronoun, a synonym, or a close variant of the keyword, use that instead — it is completely fine to land under the density target. HARD RULES: never insert the keyword into consecutive or alternating paragraphs as a pattern, never append filler sentences whose only purpose is to mention the keyword, and never repeat the exact keyword phrase twice in one paragraph. A reader must never be able to tell which phrase is "the keyword".
5. H2 HEADINGS: At least 5 × ## headings in the contentMarkdown (the scorer requires >= 3).
6. H3 SUB-HEADINGS: At least 2 × ### headings inside long H2 body sections to organize sub-topics.
7. FAQ SECTION: MUST have a heading that reads exactly "## FAQs" (or "## Frequently Asked Questions"). Include exactly 7 to 10 Q&A pairs, each question as a ### heading.
8. EXTERNAL LINKS: Include 3–7 highly credible external citations — NEVER more than 7, and never fewer than 3 when credible sources for the topic exist. Format: [anchor text](https://...). Each external link must directly support the exact claim near the link. FRESHNESS (hard requirement): every cited statistic, report, dataset, and source page must be from ${freshnessFloor} or newer — it is currently ${currentYear} and data older than ${freshnessFloor} is stale. Never cite a pre-${freshnessFloor} report, never use a URL whose path contains a year older than ${freshnessFloor} (e.g. /2019/, -2021-report), and when a source publishes recurring editions (Future of Jobs, salary surveys, market outlooks) always cite the LATEST edition. If no fresh source exists for a claim, drop or reword the claim rather than citing stale data. RULES: (a) Cite the PRIMARY SOURCE of the claim where possible — the actual research report, dataset, government page, or academic paper — not a blog post summarising it. (b) Preferred authoritative sources: .gov, .edu, WHO, CDC, World Bank, ILO, OECD, WEF, PubMed/NCBI, McKinsey, Gartner, Deloitte, PwC, EY, BCG, Bain, Accenture, Forrester, Statista, SHRM, LinkedIn official research, IEEE, ISO, peer-reviewed journals. (c) Prefer a specific report/article page, BUT a real, stable, well-known section or topic page on a credible domain is acceptable when you are not certain a deep link exists. The goal is REAL, working URLs — do not fabricate deep links just to look specific. (d) Never link to competitor blogs, vendor landing/product pages, Medium, Reddit, Quora, listicles, or any primarily-promotional URL. (e) Only cite a URL you are confident actually exists; if unsure of a specific page, use the publication's known stable page rather than guessing — never invent a URL. (f) Never use the same URL twice.
9. INTERNAL LINKS: Include 3–7 internal links — NEVER more than 7 — from the INTERNAL LINKING pool wherever contextually relevant. Format: [anchor text](/slug) or absolute URL. Use only validated links from the provided pool. Do not invent internal URLs, slugs, or pages. If fewer than 3 validated internal links are available, use all available validated links instead of inventing links. Prefer the most recently published/updated pages when several fit equally well. Include at least one link to a relevant product / solution / landing page when the pool offers one. CLOSING CTA: ${ctaInstruction}
10. META DESCRIPTION: Exactly 150–160 characters long and MUST contain "${entry.focus_keyword}".
11. NO FILLER: Avoid crutch words ("In today's world", "In recent years", "As we navigate", "game-changer", "In today's rapidly evolving landscape", "unlock the power of", "delve into"). Use specific wording and practical examples instead of vague claims.
12. INFORMATION GAIN: The article must contain at least 2 things NO competitor page covers — a unique angle, a framework/checklist the reader can act on, a contrarian but defensible position, or an original synthesis of the cited data. Search engines now score "information gain"; a pure summary of what already ranks cannot outrank it.
13. IMAGE ALT TEXT: Every image placeholder's description must be a specific, descriptive sentence fragment that names what is shown, and exactly ONE of the 2–3 image descriptions must naturally include the primary keyword. Never use generic alt text like "image", "photo" or the bare keyword alone.
14. HUMAN TONE: Write in a natural, human editorial tone with varied sentence rhythm, practical examples, small connective phrases, and smooth transitions. Avoid robotic, repetitive, overly polished AI-style phrasing. Keep paragraphs readable and natural. Do NOT use em-dashes (—) or en-dashes (–) to connect clauses or offset parenthetical phrases. These are a primary signature of AI-generated content and make the text look robotic. Instead, use standard commas, colons, parentheses, or break the sentence into two separate, short sentences.

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
   - Do NOT write "Infographic suggestion" notes, "[infographic]" placeholders, or any other meta note addressed to the writer/designer. The output must be the finished, publish-ready article — never a suggestion or instruction to add something later.
   - MARKDOWN TABLES: when you include a table, it MUST be valid GitHub-flavoured markdown — a header row, then a separator row of ONLY pipes and dashes (e.g. \`| --- | --- | --- |\`, one cell per column), then the data rows. Every row must start and end with \`|\`. Never write a malformed separator like \`|, -|, -|\`. If you cannot produce a clean table, use a bulleted list instead.
   - NEVER emit a stray fragment of comma/dash/pipe characters (e.g. a line or trailing suffix like \`, -\`) anywhere in the article, inside or outside a table. If you are not completing a full, valid table or list on that line, do not write partial table syntax at all — finish the sentence in plain prose instead.

7. NATURAL INTERLINKING & "ALSO READ" CALLOUTS:
   - Target 3–7 internal links total (NEVER more than 7), including at least one product/solution/landing page when the pool offers one. Use verified internal links only from the provided INTERNAL LINKING pool. Do NOT invent internal URLs, slugs, or pages. Prefer the NEWEST pages/posts in the pool when several fit the context equally well.
   - If fewer than 3 validated internal links are available, use all available ones — never invent additional links to hit the count.
   - If a validated internal link cannot be naturally woven into the prose of the paragraphs, you MUST include a clean callout block:
     > **Also Read:** [Anchor text / Title of the related blog](https://domain/slug)

8. CITATIONS & EXTERNAL LINKING:
   - Target 3–7 external citations total (NEVER more than 7, and never fewer than 3 when credible sources for the topic exist). Every external citation must directly support the exact claim near the link.
   - RECENCY: only cite sources, reports, and datasets published in ${freshnessFloor} or later (it is ${currentYear}). Prefer the newest available edition of any recurring publication. Never present a pre-${freshnessFloor} statistic as current — if only stale data exists, omit the claim.
   - Every external citation must point to the PRIMARY SOURCE of the claim — the actual study, report, dataset, or official page — not a blog post or article that summarises it.
   - Preferred authoritative sources: .gov, .edu, WHO, CDC, World Bank, ILO, OECD, WEF, PubMed/NCBI, McKinsey, Gartner, Deloitte, PwC, EY, BCG, Bain, Accenture, Forrester, Statista (direct report pages), SHRM, LinkedIn official research reports, IEEE, ISO, peer-reviewed journals.
   - Never link to competitor blogs, vendor landing/product pages, Medium, Reddit, Quora, listicles, or any URL that is primarily promotional.
   - Prefer a specific report/article/data page, but a real, stable, well-known section or topic page on a credible domain is acceptable when a deep link is uncertain. The priority is REAL, working URLs over fake-specific ones.
   - Never invent or guess a URL. If unsure of a specific page, cite the publication's known stable page instead of fabricating a deep link.
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

════════════════════════════════════════
GEO (GENERATIVE ENGINE OPTIMIZATION) — must satisfy all of these so AI tools like ChatGPT, Perplexity, and Google AI Overviews cite this page:
════════════════════════════════════════
GEO-1. DIRECT ANSWER FIRST: The very first paragraph (before any subheading) must contain a crisp, standalone answer to the implied search query — 2–3 sentences, no fluff. This is what AI scrapers extract.
GEO-2. DEFINITION BOXES: When introducing any technical term or concept, include a one-line bold definition immediately after its first use: **[Term]**: [definition in ≤ 20 words].
GEO-3. FACTUAL DENSITY: Include at least 6 verified, specific facts or statistics (with inline citation links). AI models weight fact-dense content higher for citation.
GEO-4. SOURCE TRANSPARENCY: Every statistic or research claim must be followed by the author/source name AND year in parentheses: e.g. "(McKinsey, ${currentYear - 1})" — this mimics academic citation style that AI models trust. The year must be ${freshnessFloor} or later; never attribute a stat to an older year.
GEO-5. ENTITY CLARITY: Explicitly name the key entities (companies, tools, standards, frameworks) relevant to this topic so AI can build a knowledge graph from this page.
GEO-6. SUMMARY SECTION: End with a "## Key Takeaways" or "## Summary" section containing 5–7 bullet points — this is the section AI models most often extract verbatim for answers.
GEO-7. QUOTATIONS: Include 1–2 short, real quotations from named experts, official reports, or organizations (with attribution, e.g. 'According to the World Economic Forum's Future of Jobs Report, "..."'). Quoted, attributed statements measurably increase how often generative engines cite a page. Only quote text you are confident is real — never fabricate a quote.
GEO-8. SELF-CONTAINED SECTIONS: Every H2 section must make sense when read in isolation (restate the subject noun instead of starting with "It" or "This"). AI engines extract sections out of context; pronoun-led sections lose the citation.

════════════════════════════════════════
AEO (ANSWER ENGINE OPTIMIZATION) — must satisfy all of these for voice search and featured snippets:
════════════════════════════════════════
AEO-1. QUESTION HEADINGS: At least 3 of the H2 headings must be phrased as questions (e.g. "What is…?", "How do you…?", "Why does…?"). Answer engines pull these into "People Also Ask" boxes.
AEO-2. SNIPPET PARAGRAPHS: Every question-phrased H2 must be followed immediately by a 40–55 word paragraph that fully answers the question — concise enough to be read aloud, factual enough to be trusted. Bold the first sentence.
AEO-3. NUMBERED / STEP-BASED ANSWERS: For process topics ("how to do X"), use a numbered list format under its own H2. Voice assistants read numbered lists verbatim for procedural queries.
AEO-4. CONCISE FAQ ANSWERS: Each FAQ answer must be 40–60 words — long enough to be useful, short enough for voice playback. Start every answer with the key noun/verb (not "Yes," or "It depends,").
AEO-5. CONVERSATIONAL LANGUAGE: Write at a Grade 8–9 reading level. Use contractions naturally ("you're", "it's", "don't") — this improves voice-search match rates significantly.

Return JSON only.`;
}
