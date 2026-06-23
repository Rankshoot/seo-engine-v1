/**
 * Claude-based enhanced blog repair.
 *
 * Functionally identical to the Gemini version in gemini.ts but uses
 * Claude (claude-sonnet-4-6) via direct Anthropic SDK streaming so we can:
 *  - Avoid the 8 192-token cap in the shared aiGenerate helper.
 *  - Produce up to 32 768 output tokens (enough for a 4 500-word post).
 *  - Emit progress during the streaming via an optional callback.
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
 * Repair / enhance a blog post using Claude claude-sonnet-4-6.
 *
 * @param input   The repair input (same interface used by the Gemini version).
 * @param opts.onChunk  Optional callback called with each text chunk as Claude
 *                      streams its response — useful for forwarding SSE events.
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

  const fullBundle = Boolean(contentAnalysisBundle);
  const originalBudget = fullBundle ? 20_000 : 10_000;
  const originalHead = originalMarkdown.slice(0, originalBudget);

  const systemInstructions = `You are a senior SEO editor. Your job is to produce a strong, search-ready version of the blog post: maintaining the same core topic, same audience, and same primary keyword intent, but comprehensively upgraded for clarity, depth, E-E-A-T, on-page SEO, and reader UX by addressing all audit issues and missing subtopics.`;

  const titleMetaBlock = `- Do not change the title/H1 unless TITLE_NEEDS_REPAIR is true. If false, the H1 must remain exactly: "${originalTitle || "(keep original H1)"}".
- Do not change the meta description unless META_NEEDS_REPAIR is true. If false, keep the same marketing angle as the original page (do not invent a new pitch).`;

  const rules = `IMPORTANT RULES FOR BLOG REPAIR & ENHANCEMENT:
- TOPIC & VOICE PRESERVATION: Keep the same core topic, angle, and reader promise as the original. Do NOT pivot the industry, product, or audience. Preserve all sections, claims, examples, and phrasing that are already correct, unless they conflict with the audit issues or missing subtopics.
- KEYWORD TARGETING: Target the PRIMARY KEYWORD naturally in the H1 title, within the first 120 words of the intro, in at least one H2 heading, and naturally/sporadically throughout the body text (aim for 0.5%–3% density, do not keyword stuff).
- TARGET LENGTH & DEPTH: Aim to expand the content if the original is thin or missing key subtopics, targeting roughly ${targetWords} words (±15%). If the draft is already long and complete, focus on tightening fluff without losing coverage of gaps/issues.
- FORMATTING: Output valid Markdown only. No HTML. Do not include schema JSON-LD, raw JSON, or implementation code blocks in the article body.
- STRUCTURE:
  * Start with exactly one H1 (# Title) at the very top.
  * Immediately under the H1, write one "answer-first" paragraph in ≤80 words stating the direct takeaway/summary (optimized for AI Overviews / featured snippets).
  * Use clear modular H2/H3 headings for hierarchy.
- CITATIONS & LINKS:
  * Include/Preserve 3 to 8 credible external citations as markdown links in the body. Preferred domains: .gov, .edu, PubMed/NCBI, WHO, CDC, McKinsey, Gartner, Deloitte, PwC, EY, Accenture, Forrester, Statista, SHRM, IEEE, ISO, peer-reviewed journals. Never link to root domains or competitor blogs. No Wikipedia.
  * Weave in at least 2 internal links from the INTERNAL LINK POOL verbatim.
  * Always preserve any PDF download links (links pointing to .pdf files) from the original page/content in your generated/repaired content verbatim. Place them in the corresponding sections where they were originally located.
- FREQUENTLY ASKED QUESTIONS: Include a "## Frequently Asked Questions" section with 5–9 Q&A pairs (### question as heading, answer paragraph). Address real reader objections and search questions.
- STYLE & QUALITY:
  * Remove crutch phrases ("in today's world", "in recent years", "it's important to note", "game-changer", "leverage" without substance).
  * If the original used base64 or data-URI images, replace with descriptive markdown image placeholders or prose (no raw base64).
  * Tables of contents are optional; only add "## Table of contents" if the post has 4+ H2 sections.
- PDF CONTENT HANDLING: If the ORIGINAL PAGE contains any text that appears to be extracted from an embedded PDF document (interview questions, Q&A dumps, page-number markers, etc.), ignore it entirely. Focus only on the actual web article content (intro text, headings, paragraphs written as a blog post).`;

  const rubricSection = rubricBlock
    ? `QUALITY RUBRIC — STILL NEEDS WORK (address each; if an item is marginal, strengthen it anyway):\n${rubricBlock}\n\n`
    : "";

  const quickWinsSection = contentAnalysisBundle?.quick_wins?.length
    ? `QUICK WINS (implement each):\n- ${contentAnalysisBundle.quick_wins.join("\n- ")}\n\n`
    : "";

  const prompt = `${systemInstructions}

${titleMetaBlock}

${rules}

SOURCE URL (the live page being repaired): ${sourceUrl}
ORIGINAL TITLE/H1: ${originalTitle || "(unknown)"}
TITLE_NEEDS_REPAIR: ${titleNeedsRepair ? "true" : "false"}
META_NEEDS_REPAIR: ${metaNeedsRepair ? "true" : "false"}
PRIMARY KEYWORD: ${primaryKeyword || "(infer from title)"}
SECONDARY KEYWORDS: ${secondaryKeywords.join(", ") || "(none)"}
TARGET LENGTH: ~${targetWords} words
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
