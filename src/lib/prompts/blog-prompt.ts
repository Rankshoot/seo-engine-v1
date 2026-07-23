import type { ResearchContext } from '@/lib/research';
import { formatResearchForPrompt } from '@/lib/research';
import type { BusinessBrief, InternalLinkCandidate } from '@/lib/business-brief';
import type { Project } from '@/lib/types';
import { minCitationYear } from '@/lib/blog-content';
import { selectBlogArchetype } from '@/lib/blog-archetype';
import type { DeepResearchResult } from '@/lib/deep-research';
import { formatDeepResearchForPrompt } from '@/lib/deep-research';
import type { RetrievedSource } from '@/lib/content-sources/retrieve';

export interface BlogPromptContext {
  entry: {
    focus_keyword: string;
    title: string;
    article_type: string;
    secondary_keywords?: string[];
  };
  project: Project;
  wordCount: number;
  /** SERP intent for the keyword ("informational" | "commercial" | ...), when known — feeds archetype selection. */
  keywordIntent?: string | null;
  /** Stored TOFU/MOFU/BOFU for the keyword, when known — feeds archetype selection. */
  funnelStage?: string | null;
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
  /**
   * Pre-formatted PROJECT MEMORY block (from formatProjectMemoryForPrompt) —
   * what the Rankshoot AI has learned about this project: covered topics,
   * style learnings, user preferences. "" / undefined when there's no memory.
   */
  projectMemoryBlock?: string;
  /**
   * Pre-formatted LEARNED WRITING GUIDANCE block (from
   * formatGlobalHeuristicsForPrompt) — anonymized global style patterns.
   */
  globalHeuristicsBlock?: string;
  /**
   * Verified facts + credible source URLs from a live deep-research pass
   * (see `researchCredibleSources`). When present, the article is built on this
   * real data and external citations are restricted to these exact URLs.
   */
  verifiedSources?: DeepResearchResult | null;
  /**
   * Relevant excerpts retrieved from the user's uploaded knowledge sources
   * (industry reports, whitepapers, reference docs). The article should cite
   * specific data points from these where they genuinely fit — never forced —
   * and interlink to each source's canonical `citeUrl`.
   */
  customSources?: RetrievedSource[];
}

/**
 * Build the CUSTOM KNOWLEDGE SOURCES prompt block. The user attached these
 * reports/docs specifically so the article draws on them, so the instruction is
 * to actively MINE each source for data relevant to this article's topic and
 * cite it — while never fabricating figures the source doesn't contain. Returns
 * "" when there are no sources.
 */
function formatCustomSourcesForPrompt(sources: RetrievedSource[]): string {
  const usable = sources.filter((s) => s.text.trim().length > 0);
  if (!usable.length) return '';

  const blocks = usable
    .map((s, i) => {
      const link = s.citeUrl
        ? `\nReport page — interlink to THIS exact URL wherever you cite this source: ${s.citeUrl}`
        : '';
      const scopeNote = s.mode === 'full'
        ? '(full document below)'
        : '(most relevant sections below — this is a large document)';
      return `─── SOURCE ${i + 1}: "${s.title}" ${scopeNote} ───${link}\n${s.text.trim()}`;
    })
    .join('\n\n');

  const nameList = usable.map((s) => `"${s.title}"`).join(', ');

  return `\n════════════════════════════════════════
CUSTOM KNOWLEDGE SOURCES — the user's own reference material (${nameList})
════════════════════════════════════════
The user attached ${usable.length === 1 ? 'this source' : 'these sources'} specifically so this article draws on ${usable.length === 1 ? 'it' : 'them'}. Treat ${usable.length === 1 ? 'it' : 'them'} as a PRIMARY, authoritative source and mine ${usable.length === 1 ? 'it' : 'them'} hard:
- Actively find the concrete statistics, figures, percentages, and named findings in the material below that are relevant to THIS article's topic, industry, and audience, and build them into the article. When the source covers this topic/industry at all, include at least 2-4 specific data points from it.
- For every data point you use, add an in-text attribution (e.g. "according to ${usable[0].title}") AND one contextual inline link to that source's report-page URL, placed next to the claim it supports.
- Use ONLY numbers, quotes, and findings that literally appear in the material below. Never invent or extrapolate a figure, and never attach the report link to a claim the source does not actually make. If the source genuinely has nothing relevant to this article, don't force it — but that should be rare when the topic overlaps.
- These report-page links are approved, expected external links — include them even if other citation rules restrict external URLs to an approved list.

${blocks}
`;
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
  const { entry, project, wordCount, keywordIntent, funnelStage, research, existingBlogs, brief, extraInternalLinks, followUpQuestions, ahrefsContext, writerNotes, brandPersona, customInstructions, deepAnalysisSummary, verifiedSources, projectMemoryBlock, globalHeuristicsBlock, customSources } = ctx;

  // Recency window for citations: sources must be from this year or newer.
  const currentYear = new Date().getFullYear();
  const freshnessFloor = minCitationYear();

  // Pick the content SHAPE for this piece (deterministic, no API cost) from the
  // keyword's phrasing + intent + the live SERP. This replaces the old one-size
  // "full SEO article" skeleton so different topics come out with different
  // structures. `req` holds ranged, soft structural targets for this archetype.
  const archetype = selectBlogArchetype({
    focusKeyword: entry.focus_keyword,
    articleType: entry.article_type,
    keywordIntent,
    funnelStage,
    wordCount,
    serpTitles: (research?.topArticles ?? []).slice(0, 8).map(a => a.title),
  });
  const req = archetype.structure;

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
    internalLinksBlock = `\nINTERNAL LINKING (aim for ${req.intMin}–${req.intMax} total, never more than ${req.intMax + 1}):
- PRIMARY: weave links as inline contextual hyperlinks INSIDE sentences — turn a natural anchor phrase in the running prose into [anchor](url) where it genuinely helps the reader go deeper. This is how most internal links should appear.
- Only use validated links from the pool below. Never invent internal URLs, slugs, or pages. If fewer than ${req.intMin} fit naturally, use fewer — do not force them.
- OPTIONAL: if one or two highly relevant posts could not be worked into the prose inline, you MAY add a short "Also Read" callout for them (format: \`> **Also Read:** [Title](url)\`). Keep these to at most two, and prefer inline links over callouts.
- When the pool contains a product / solution / pricing / landing page, work in at least one such link where relevant. ${ctaInstruction}
Pool:\n${[siteBlock, generatedBlock].filter(Boolean).join('\n\n')}`;
  }

  // 1b. Live follow-up questions (Perplexity / PAA) → mandatory AEO H2 sections.
  // Capped so short pieces aren't forced to spend their entire H2 budget on
  // follow-up sections alone — leave room for the rest of the outline.
  const followUpCap = Math.max(1, Math.min(3, req.h2Min - 1));
  const followUps = (followUpQuestions ?? []).map(q => q.trim()).filter(Boolean).slice(0, followUpCap);
  const followUpsBlock = followUps.length
    ? `\nSEARCHER FOLLOW-UP QUESTIONS (fetched live for "${entry.focus_keyword}" — the questions real users ask next after this search):\n${followUps
        .map((q, i) => `${i + 1}. ${q}`)
        .join('\n')}\nCover the ones that fit this article's angle — ideally as their own question-phrased H2 with a direct answer up top, or woven into a related section. Don't force all of them if they don't suit the piece, and don't just repeat them again in the FAQ.\n`
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

  const customSourcesBlock = customSources?.length ? formatCustomSourcesForPrompt(customSources) : "";

  // Verified facts + approved citation URLs from the live deep-research pass.
  const verifiedResearchBlock = verifiedSources ? formatDeepResearchForPrompt(verifiedSources) : "";
  const verifiedSourceCount = verifiedSources?.sources.length ?? 0;
  // Only switch to STRICT "approved URLs only" mode when the deep-research
  // pass found enough sources to actually satisfy the citation minimum on its
  // own. With 1-2 sources, "cite only these" + "cite at least 3" would
  // contradict each other, so that case gets a BLENDED instruction instead:
  // use every verified source, then find the rest yourself under the same
  // credibility bar. Below any verified sources at all, it's the plain
  // self-sourced path (unchanged).
  const citationMin = Math.max(req.extMin, 3);
  const hasVerifiedSources = verifiedSourceCount >= citationMin;
  const hasPartialVerifiedSources = verifiedSourceCount > 0 && !hasVerifiedSources;

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
      : `none — derive ${req.h2Min}–${req.h2Min + 2} topically relevant H2s from the primary keyword`;

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

  return `You are a subject-matter expert writing for ${project.company}. Write a genuinely useful blog post about "${entry.focus_keyword}" that reads like a knowledgeable person wrote it, answers what the searcher actually wants to know, and earns rankings in Google plus citations in AI answers (AI Overviews, ChatGPT, Perplexity).

Write for the reader first. A piece that truly answers the question and teaches something ranks on its own. Never sacrifice usefulness, honesty, or a natural voice just to hit a number. The structural targets below are goals to balance, not a checklist to satisfy mechanically — two articles should never come out with the same skeleton.

CRITICAL OUTPUT RULE: Your response must be a single, valid JSON object ONLY. No markdown fences outside the JSON, no explanation before or after, and no raw JSON blocks inside the markdown body. The entire output must parse as JSON.

JSON SCHEMA:
{
  "title": "MUST be exactly the requested ARTICLE TITLE: \"${entry.title.replace(/"/g, '\\"')}\" (verbatim — do not alter or rewrite it)",
  "metaDescription": "150-160 characters, a clear sentence that contains the primary keyword verbatim",
  "contentMarkdown": "Clean markdown starting with '# [H1 Title]'. Do NOT leak raw JSON keys inside the markdown.",
  "faqQuestions": ["Question 1", "Question 2", "..."],
  "internalLinksUsed": ["/slug-or-absolute-url-1", "..."],
  "externalLinksUsed": ["https://url1", "..."]
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
WORD COUNT:      ~${wordCount} words (stay within roughly ±10%; never pad with filler or restated points to hit a number, never cut substance to stay under)
${writerNotesBlock}${briefBlock}${projectMemoryBlock ?? ''}${globalHeuristicsBlock ?? ''}${internalLinksBlock}${followUpsBlock}

SECONDARY KEYWORDS / TOPICS TO WORK IN NATURALLY:
${termsMatchList}

FAQ SEEDS (real questions people search):
${faqSeeds}

${verifiedResearchBlock}
${researchBlock}
${ahrefsBlock}
${researchContextBlock}${deepAnalysisSummaryBlock}${customSourcesBlock}${customInstructionsBlock}

════════════════════════════════════════
CONTENT SHAPE — ${archetype.label}
════════════════════════════════════════
${archetype.directive}
Aim for roughly ${req.h2Min}-${req.h2Max} H2 sections sized to ~${wordCount} words. ${req.h3Min > 0 ? `Use H3s inside longer sections where sub-topics need them.` : `Add H3s only if a section genuinely needs them.`} Add tables, lists, or numbered steps where the material calls for them — not to hit a count. Vary how sections open; do not begin every section the same way, and do not staple a bold one-liner under every single heading as a formula.

════════════════════════════════════════
WRITE LIKE A HUMAN EXPERT
════════════════════════════════════════
- Have a point of view. Make declarative statements and call out common mistakes directly. Avoid hedging ("may", "could", "it's worth noting") — if a claim is true, state it; if uncertain, cite a source and move on.
- Open with a real hook: a specific scenario, a concrete fact, or a claim that reframes the topic. Do NOT open with a trend cliché ("In today's world", "X is becoming increasingly...", "In the evolving landscape of..."). Get the primary keyword into the first ~100 words naturally.
- Vary sentence rhythm and length; keep most paragraphs short (2-4 lines) and use active voice. Write around a Grade 8-9 reading level and use contractions naturally.
- Ban list (these read as AI-written): crutch phrases like "In today's world", "game-changer", "unlock the power of", "delve into", "navigating", "ever-evolving", "at a glance". And do NOT use em-dashes (—) or en-dashes (–) to join clauses or offset asides — use commas, colons, parentheses, or two short sentences instead. After a bold prefix like **1. Name**, always follow with a space or colon-space, never join it to the next word.
- Keyword usage stays invisible: use "${entry.focus_keyword}", its variants, synonyms, or pronouns wherever each reads best. Never stuff it into consecutive paragraphs, never repeat the exact phrase twice in one paragraph, never add a sentence whose only job is to mention it. A reader should not be able to tell which phrase is "the keyword".

════════════════════════════════════════
RANK AND GET CITED (balance these, don't mechanically tick them)
════════════════════════════════════════
- ANSWER FIRST: The opening paragraph should give a crisp, standalone answer to the implied query in 2-3 sentences. This is what AI engines extract. Where a section answers a distinct question, lead it with the direct answer before expanding.
- GROUND IT IN REAL DATA: ${hasVerifiedSources
    ? `Build the article's claims on the VERIFIED RESEARCH facts provided above — use those exact figures and weave in at least ${Math.max(req.factsMin, 3)} of them, each with an in-text attribution like "(McKinsey, ${currentYear - 1})" and the matching approved citation URL. Do NOT introduce statistics that are not in the verified research, and never invent a number or quote.`
    : hasPartialVerifiedSources
      ? `Use the exact figures from the VERIFIED RESEARCH facts above wherever they fit, each with an in-text attribution and the matching approved citation URL. That block alone won't cover every claim you make — for anything else, add your own specific, verifiable facts/stats from a credible primary source, same attribution style. Never invent a number or quote either way.`
      : `Include several specific, verifiable facts/stats (aim for ~${req.factsMin}+ across the piece), each with an inline citation link and an in-text attribution like "(McKinsey, ${currentYear - 1})". Only cite sources published ${freshnessFloor} or later (it is ${currentYear}); prefer the newest edition of any recurring report. If only stale data exists for a claim, drop or reword the claim. Never invent a statistic or a quote.`}
- INFORMATION GAIN: Include at least two things competitor pages miss — an original framework, checklist, contrarian-but-defensible take, or a fresh synthesis of the data. A summary of what already ranks cannot outrank it.
- STRUCTURE FOR EXTRACTION: Make each section understandable on its own (restate the subject noun instead of starting with "It"/"This"). Where they fit the topic, phrase about ${req.questionH2Min}${req.questionH2Min > 0 ? '+' : ''} H2s as real questions with a direct answer up top, and end with a short "## Key Takeaways" (${req.summaryBulletsMin}-${req.summaryBulletsMax} bullets) when it serves the reader — skip it if it would feel bolted on.
- EXTERNAL CITATIONS (strict): Include at least 3 credible external citations (aim for ${citationMin}-${req.extMax}). ${hasVerifiedSources
    ? `Every external link MUST be one of the exact approved citation URLs from the VERIFIED RESEARCH block above — do NOT use, guess, or invent any other external URL. Place each citation next to the specific claim it supports.`
    : hasPartialVerifiedSources
      ? `Use every URL from the VERIFIED RESEARCH approved-citation list above first — do not skip any of them. That list alone is short of the ${citationMin}-citation floor, so find the rest yourself: cite the PRIMARY source (the actual report/dataset/official page), not a blog summarising it, from an authoritative domain (.gov, .edu, WHO, World Bank, OECD, WEF, PubMed, McKinsey, Gartner, Deloitte, Statista, peer-reviewed journals). Never cite competitor blogs, vendor landing pages, Medium, Reddit, Quora, or listicles, and never fabricate a URL.`
      : `Cite the PRIMARY source (the actual report/dataset/official page), not a blog summarising it. Prefer authoritative domains (.gov, .edu, WHO, World Bank, OECD, WEF, PubMed, McKinsey, Gartner, Deloitte, Statista, peer-reviewed journals). Never cite competitor blogs, vendor landing pages, Medium, Reddit, Quora, or listicles. Only use a URL you are confident exists — if unsure of a deep page, use the publication's known stable page; never fabricate a URL.`} Never reuse the same URL twice.
- FAQ: Include a "## FAQs" (or "## Frequently Asked Questions") section with ${req.faqMin}-${req.faqMax} Q&As, each question as a ### heading, seeding ${req.faqSeedMin}+ from the real questions above. Answers ~40-60 words, starting with the key noun/verb, non-repetitive with the body.
- META DESCRIPTION: 150-160 characters, contains "${entry.focus_keyword}" verbatim.

════════════════════════════════════════
FORMATTING GUARDRAILS
════════════════════════════════════════
- Do NOT insert image markdown or "[image]" / "infographic" placeholders — images are added automatically after generation. Just write the article.
- Markdown tables must be valid GitHub-flavoured markdown: a header row, then a separator row of only pipes and dashes (e.g. \`| --- | --- | --- |\`), then data rows, every row starting and ending with \`|\`. If you can't produce a clean table, use a bulleted list. Never emit a stray fragment like \`, -\` anywhere.
- Company grounding: weave in ${project.company}'s products/entities naturally where relevant (from COMPANY CONTEXT above); never pitch competitor names. ${ctaInstruction}

Return JSON only.`;
}
