/**
 * Claude-based enhanced blog repair.
 *
 * Uses Claude (claude-sonnet-4-6) via direct Anthropic SDK streaming so we can:
 *  - Produce up to 32 768 output tokens (enough for a 4 500-word post).
 *  - Emit streaming progress via an optional callback (useful for SSE forwarding).
 *  - Avoid hard timeouts that caused content truncation.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { RepairBlogInput, RepairedBlog } from "@/lib/gemini";
import { countWordsInMarkdown, stripEmptyFragmentAnchorTags } from "@/lib/blog-content";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function normalizeHost(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

function safeHost(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return null; }
}

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "repaired-post";
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Repair / enhance a blog post using Claude.
 *
 * Two modes, controlled by whether `contentAnalysisBundle` is provided:
 *  - FULL ENHANCEMENT: comprehensive rewrite targeting all rubric/gap/issue findings.
 *  - REPAIR: minimal surgical fix addressing only the listed audit issues.
 *
 * @param input  The repair input (same interface used by the Gemini version).
 * @param opts.onChunk  Optional callback fired with each streaming text chunk.
 */
export async function repairBlogPost(
  input: RepairBlogInput,
  opts?: { onChunk?: (text: string) => void }
): Promise<RepairedBlog> {
  const {
    sourceUrl,
    originalMarkdown,
    issues,
    contentGaps,
    internalLinkPool,
    primaryKeyword,
    secondaryKeywords,
    brief,
    project,
    contentAnalysisBundle,
  } = input;

  const targetWords = Math.min(
    4500,
    Math.max(1400, input.wordCount ?? countWordsInMarkdown(originalMarkdown) + 250)
  );

  const originalTitle =
    input.originalTitle?.trim() ||
    originalMarkdown.match(/^#\s+(.+)$/m)?.[1]?.replace(/\*+/g, "").trim() ||
    "";

  const titleNeedsRepair = issues.some(i =>
    /title|h1|headline|keyword in title|target keyword/i.test(`${i.label} ${i.detail} ${i.fix}`)
  );
  const metaNeedsRepair = issues.some(i =>
    /meta description|meta tag|description/i.test(`${i.label} ${i.detail} ${i.fix}`)
  );

  // ── Context blocks ──────────────────────────────────────────────────────────

  const issueBlock = issues.length
    ? issues.map((i, idx) => {
        const cat = i.category ? ` · ${i.category.toUpperCase()}` : "";
        const wim = i.why_it_matters ? `\n   Why it matters: ${i.why_it_matters}` : "";
        return `${idx + 1}. [${i.severity.toUpperCase()}${cat}] ${i.label}\n   What's wrong: ${i.detail}${wim}\n   Fix: ${i.fix}`;
      }).join("\n")
    : "(no explicit issues — focus on depth, clarity, and answer-first intro)";

  const gapsBlock = contentGaps.length
    ? contentGaps.map(g => `- ${g}`).join("\n")
    : "(the LLM did not flag explicit content gaps)";

  const fullBundle = Boolean(contentAnalysisBundle);

  const rubricNeedsWork =
    contentAnalysisBundle?.quality_rubric?.filter(r => r.status === "fail" || r.status === "warn") ?? [];
  const rubricBlock = rubricNeedsWork.length
    ? rubricNeedsWork.map((r, idx) => `${idx + 1}. [${r.status.toUpperCase()}] ${r.label}\n   ${r.detail}`).join("\n")
    : "";

  const analysisOverview = contentAnalysisBundle
    ? `EDITORIAL VERDICT (${contentAnalysisBundle.conclusion_verdict}): ${contentAnalysisBundle.conclusion_summary}

Article summary (stay on this topic): ${contentAnalysisBundle.summary}

Key diagnosis: ${contentAnalysisBundle.plain_language_verdict}`
    : "";

  const linkPool = internalLinkPool.filter(u => u !== sourceUrl).slice(0, 25);
  const linkPoolBlock = linkPool.length ? linkPool.map(u => `- ${u}`).join("\n") : "(no peer URLs available)";

  const briefLine = brief
    ? `Company voice (for tone ONLY — do not hijack the topic): ${brief.summary} · Products: ${brief.products.slice(0, 3).join(", ") || "n/a"}`
    : "";

  const originalBudget = fullBundle ? 20_000 : 10_000;
  const originalHead = originalMarkdown.slice(0, originalBudget);

  const rubricSection =
    fullBundle && rubricBlock
      ? `QUALITY RUBRIC — STILL NEEDS WORK (address each; if an item is marginal, strengthen it anyway):\n${rubricBlock}\n\n`
      : "";

  const quickWinsSection =
    fullBundle && contentAnalysisBundle?.quick_wins?.length
      ? `QUICK WINS (implement each):\n- ${contentAnalysisBundle.quick_wins.join("\n- ")}\n\n`
      : "";

  // ── Single consolidated prompt ──────────────────────────────────────────────

  const modeIntro = fullBundle
    ? `You are a senior SEO editor. The user clicked "Generate enhanced" after a full content-quality analysis. Your job is to produce a **strong, search-ready** version of the SAME article: same core topic, same audience, same primary keyword intent — but comprehensively upgraded for clarity, depth, E-E-A-T, on-page SEO, and reader UX.

This is NOT a pivot and NOT a brand-new article from scratch. Reuse strong existing paragraphs where they already work; rewrite or expand anywhere needed to satisfy **every** requirement block below (all audit issues, all rubric rows that are not pass, all quick wins, all content gaps).`
    : `You are a senior SEO + content editor. Repair an existing public blog post by making the smallest useful changes needed to address the audit issues below. This is NOT a net-new article generation task.`;

  const modeRules = fullBundle
    ? `IMPORTANT RULES (FULL ENHANCEMENT):
- Keep the same topic, angle, and reader promise as the original. Do NOT pivot industry, product, or audience.
- Target PRIMARY KEYWORD naturally in the H1 (if TITLE_NEEDS_REPAIR), first ~120 words, at least one H2, and sporadically in body — never keyword stuffing.
- Aim for roughly ${targetWords} words (±15%). If the draft was thin, add substantive sections; if long, tighten fluff without losing coverage of gaps/issues.
- Output valid Markdown only. No HTML.
- Do not include schema JSON-LD, raw JSON, or implementation code blocks in the article body.
- Start with one H1 (# Title).
- Immediately under the H1, write one "answer-first" paragraph in ≤80 words that states the direct takeaway (optimized for AI Overviews / featured snippets).
- Use clear modular H2/H3 hierarchy (RAG-friendly). Merge redundant headings; fix weak single-sentence sections.
- Include a "## Frequently Asked Questions" section with 5–9 Q&A pairs (### question as heading, answer paragraph). Address real reader objections and long-tail phrasing.
- Include **at least 3 and at most 8** credible external citations as markdown links in the body. Find the PRIMARY SOURCE of each claim — the actual research report, government dataset, academic paper, or official standards page, NOT a blog post or news article summarising it. Preferred domains: .gov, .edu, PubMed/NCBI, WHO, CDC, McKinsey, Gartner, Deloitte, PwC, EY, Accenture, Forrester, Statista report pages, SHRM, IEEE, ISO, peer-reviewed journals. Never link to root domains or competitor blogs. No Wikipedia.
- Use **at least 2** INTERNAL LINK POOL URLs verbatim in contextually relevant sentences.
- Always preserve any PDF download links (links pointing to .pdf files) from the original page/content in your generated/repaired content verbatim. Place them in the corresponding sections where they were originally located.
- Respect PDF promised content: If the original blog title/H1 promises a specific number or list of items (e.g., "60+ questions", "100+ templates") that are delivered via a downloadable PDF, do NOT inline those items into the blog body. The PDF remains the delivery vehicle — keep the on-page prose as context, explanation, and guidance only.
- Remove crutch phrases ("in today's world", "in recent years", "it's important to note", "game-changer", "leverage" without substance).
- If the original used base64 or data-URI images, replace with descriptive markdown image placeholders or prose (no raw base64).
- Tables of contents are optional; only add "## Table of contents" if the post has 4+ H2 sections and it improves UX.
- IMPORTANT: If the ORIGINAL PAGE section contains any text that appears to be extracted from an embedded PDF document (interview questions, Q&A dumps, page-number markers, etc.), ignore it entirely. Focus only on the actual web article content (intro text, headings, paragraphs written as a blog post).`
    : `IMPORTANT RULES (REPAIR):
- This is a REPAIR of an existing page — the topic must stay the same. Do NOT pivot to a different product, industry, or audience.
- Target the same primary keyword unless the audit explicitly says the keyword is dead; then re-target to the closest secondary keyword listed.
- Preserve every section, claim, example, and phrasing that is already correct. Only rewrite the parts connected to the listed audit issues or missing subtopics.
- Output must be valid Markdown. No HTML.
- Do not include schema JSON-LD, raw JSON, or implementation code blocks in the article body.
- Start with an H1 (# Title).
- Include an "answer-first" paragraph directly under the H1 in ≤80 words that plainly answers "what is this post about and what will the reader learn".
- Add H2/H3 structure, FAQ, internal links, external links, examples, or data ONLY where the audit says those are missing or weak.
- Link to peer URLs from the INTERNAL LINK POOL only if internal links are missing/weak or the repair naturally touches those sections. Use verbatim URLs. Never invent URLs.
- Link to credible external sources only if the audit says citations/data are missing or a changed section needs proof. Find the PRIMARY SOURCE of each citation — the actual research report, government dataset, or academic paper, NOT a blog or news article summarising it. Preferred domains: .gov, .edu, PubMed/NCBI, WHO, CDC, McKinsey, Gartner, Deloitte, PwC, EY, Accenture, Forrester, Statista report pages, SHRM, IEEE, ISO, peer-reviewed journals. Never link to root domains or competitor blogs. No Wikipedia.
- Always preserve any PDF download links (links pointing to .pdf files) from the original page/content in your generated/repaired content verbatim. Place them in the corresponding sections where they were originally located.
- Respect PDF promised content: If the original blog title/H1 promises a specific number or list of items (e.g., "60+ questions", "100+ templates") that are delivered via a downloadable PDF, do NOT inline those items into the blog body. The PDF remains the delivery vehicle — keep the on-page prose as context, explanation, and guidance only.
- Keep length close to the original unless the audit says thin content / missing depth. If expanding, add only the listed missing subtopics.
- IMPORTANT: If the ORIGINAL PAGE section contains any text that appears to be extracted from an embedded PDF document (interview questions, Q&A dumps, page-number markers, etc.), ignore it entirely. Focus only on the actual web article content (intro text, headings, paragraphs written as a blog post).`;

  const titleMetaBlock = `- Do not change the title/H1 unless TITLE_NEEDS_REPAIR is true. If false, the H1 must remain exactly: "${originalTitle || "(keep original H1)"}".
- Do not change the meta description unless META_NEEDS_REPAIR is true. If false, keep the same marketing angle as the original page (do not invent a new pitch).`;

  const prompt = `${modeIntro}

${titleMetaBlock}

${modeRules}

SOURCE URL (the live page being repaired): ${sourceUrl}
ORIGINAL TITLE/H1: ${originalTitle || "(unknown)"}
TITLE_NEEDS_REPAIR: ${titleNeedsRepair ? "true" : "false"}
META_NEEDS_REPAIR: ${metaNeedsRepair ? "true" : "false"}
PRIMARY KEYWORD: ${primaryKeyword || "(infer from title)"}
SECONDARY KEYWORDS: ${secondaryKeywords.join(", ") || "(none)"}
TARGET LENGTH: ~${targetWords} words (${fullBundle ? "full enhancement" : "repair"} mode)
${briefLine}

AUDIENCE: ${project.target_audience}
REGION: ${project.target_region}

${analysisOverview ? `${analysisOverview}\n\n` : ""}AUDIT ISSUES TO FIX (address every row):
${issueBlock}

${rubricSection}${quickWinsSection}MISSING SUBTOPICS TO COVER:
${gapsBlock}

INTERNAL LINK POOL (you MUST use at least 2 of these, verbatim):
${linkPoolBlock}

ORIGINAL PAGE (first ~${Math.round(originalBudget / 1000)}k chars of markdown, for reference — do not copy verbatim; rewrite):
---
${originalHead}
---

Write the repaired blog now. End the blog content, then on the next line output EXACTLY:
---META---
{"meta_description":"150–160 chars only if META_NEEDS_REPAIR, otherwise preserve the original angle","slug":"url-slug-from-title","external_links":["url1"],"internal_links":["url1","url2"],"repair_notes":["Done: specific fix applied and where","Still to do: optional manual follow-up, or 'Still to do: none'"]}`;

  // ── Call Claude with streaming so large outputs don't time out ────────────
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const anthropic = new Anthropic({ apiKey, maxRetries: 5 });

  let fullText = "";
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 32_768,
    messages: [{ role: "user", content: prompt }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      fullText += event.delta.text;
      opts?.onChunk?.(event.delta.text);
    }
  }

  // ── Parse the response ────────────────────────────────────────────────────
  const sepIdx = fullText.indexOf("---META---");
  let content = fullText.trim();
  let meta_description = "";
  let slug = slugify(primaryKeyword || "repaired-post");
  let external_links: string[] = [];
  let internal_links: string[] = [];
  let repair_notes: string[] = [];

  if (sepIdx !== -1) {
    content = fullText.substring(0, sepIdx).trim();
    try {
      const metaRaw = fullText.substring(sepIdx + 10).trim();
      const metaJson = JSON.parse(metaRaw);
      meta_description = metaJson.meta_description ?? "";
      slug = metaJson.slug ?? slug;
      external_links = Array.isArray(metaJson.external_links) ? metaJson.external_links : [];
      internal_links = Array.isArray(metaJson.internal_links) ? metaJson.internal_links : [];
      repair_notes = Array.isArray(metaJson.repair_notes) ? metaJson.repair_notes : [];
    } catch { /* use defaults */ }
  }

  content = stripEmptyFragmentAnchorTags(content);

  // Re-scan markdown to collect links the LLM embedded but omitted from meta.
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const ownHost = normalizeHost(project.domain ?? "");
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(content))) {
    const url = m[2];
    const host = safeHost(url);
    const internal = Boolean(host && ownHost && (host === ownHost || host.endsWith(`.${ownHost}`)));
    if (internal) {
      if (!internal_links.includes(url)) internal_links.push(url);
    } else if (!external_links.includes(url)) {
      external_links.push(url);
    }
  }
  const relInternalRegex = /\[([^\]]+)\]\((\/[^)]+)\)/g;
  while ((m = relInternalRegex.exec(content))) {
    const path = m[2];
    const absoluteUrl = project.domain ? `https://${project.domain}${path}` : path;
    content = content.replace(`](${path})`, `](${absoluteUrl})`);
    if (!internal_links.includes(absoluteUrl)) internal_links.push(absoluteUrl);
  }

  const word_count = content.split(/\s+/).filter(Boolean).length;
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/\*/g, "").trim() : `Repaired: ${primaryKeyword}`;

  return {
    title,
    content,
    meta_description,
    slug,
    word_count,
    research_sources: 1,
    external_links: [...new Set(external_links)].slice(0, 10),
    internal_links: [...new Set(internal_links)].slice(0, 12),
    repair_notes: repair_notes.slice(0, 10),
  };
}
