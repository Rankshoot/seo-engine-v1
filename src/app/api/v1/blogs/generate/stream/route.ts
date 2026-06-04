import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 300;

// Lazy initialization to avoid auth error when ANTHROPIC_API_KEY is not set
function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  return new Anthropic({ apiKey });
}

/**
 * SSE streaming endpoint for blog generation with real Claude thinking tokens.
 *
 * Event types (newline-delimited JSON with "data: " prefix):
 *   { event: "stage",         stage: "context"|"research"|"outline"|"draft"|"polish", detail?: string }
 *   { event: "thinking",      chunk: string }   ← live Claude thinking token chunks
 *   { event: "thinking_done"                 }  ← thinking phase complete
 *   { event: "done",          blogId: string }
 *   { event: "error",         message: string }
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return new Response(
      `data: ${JSON.stringify({ event: "error", message: "Not authenticated" })}\n\n`,
      { status: 401, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const body = (await req.json()) as { entryId: string; wordCount?: number; writerNotes?: string };
  if (!body.entryId) {
    return new Response(
      `data: ${JSON.stringify({ event: "error", message: "Expected { entryId, wordCount?, writerNotes? }" })}\n\n`,
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (payload: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      try {
        // ── Stage 1: Load context ─────────────────────────────────────────
        emit({ event: "stage", stage: "context", detail: "Loading project brief and calendar entry…" });

        const { data: entry, error: eErr } = await supabaseAdmin
          .from("calendar_entries").select("*").eq("id", body.entryId).single();

        if (eErr || !entry) {
          emit({ event: "error", message: "Calendar entry not found" });
          controller.close();
          return;
        }

        const { data: project, error: pErr } = await supabaseAdmin
          .from("projects").select("*").eq("id", entry.project_id).eq("user_id", user.id).single();

        if (pErr || !project) {
          emit({ event: "error", message: "Project not found or unauthorized" });
          controller.close();
          return;
        }

        await supabaseAdmin.from("calendar_entries").update({ status: "generating" }).eq("id", body.entryId);

        let brief: any = null;
        try {
          const { data: briefRow } = await supabaseAdmin
            .from("project_briefs").select("brief").eq("project_id", entry.project_id).maybeSingle();
          brief = briefRow?.brief ?? null;
        } catch { /* optional */ }

        // ── Stage 2: Research ─────────────────────────────────────────────
        emit({ event: "stage", stage: "research", detail: "Gathering live SERP research and keyword context…" });

        const { researchKeyword } = await import("@/lib/research");
        let research: any = null;
        try {
          research = await researchKeyword(entry.focus_keyword, project.target_region, project.target_language);
        } catch (e) {
          console.warn("[blog stream] Research failed, continuing:", e);
        }

        let existingBlogs: { title: string; slug: string; target_keyword: string }[] = [];
        try {
          const { data: blogs } = await supabaseAdmin
            .from("blogs").select("title, slug, target_keyword")
            .eq("project_id", entry.project_id).in("status", ["generated", "approved", "published"])
            .neq("entry_id", body.entryId).limit(15);
          existingBlogs = blogs ?? [];
        } catch { /* optional */ }

        // ── Stage 3: Outline ──────────────────────────────────────────────
        emit({ event: "stage", stage: "outline", detail: "Building SEO structure and topical outline…" });

        const { formatContentHealthAuditForWriter } = await import("@/lib/content-health-calendar");
        const contentHealthRaw = (entry as any).content_health_audit;
        const auditWriterBlock = formatContentHealthAuditForWriter(contentHealthRaw);
        const mergedWriterNotes = [body.writerNotes?.trim(), auditWriterBlock || ""]
          .filter(Boolean).join("\n\n---\n\n");

        // Build the blog prompt (same structure as generateBlogPost in gemini.ts)
        const blogPrompt = await buildBlogPrompt({
          entry, project, research, existingBlogs, brief, writerNotes: mergedWriterNotes || undefined,
          wordCount: body.wordCount ?? 2500,
        });

        // ── Stage 4: Draft with streaming thinking ────────────────────────
        emit({ event: "stage", stage: "draft", detail: "Claude Sonnet is thinking and drafting your blog post…" });

        // Determine model from routing settings
        const { getProviderForRoute } = await import("@/services/ai/providers");
        const { model: routedModel } = await getProviderForRoute("blog");
        // Use Claude for thinking — fallback to claude-sonnet-4-6 if Gemini was selected
        const claudeModel = routedModel.startsWith("claude") ? routedModel : "claude-sonnet-4-6";

        // Stream with extended thinking enabled
        let fullThinking = "";
        let fullContent = "";
        let thinkingEmitted = false;

        const anthropic = getAnthropicClient();
        const claudeStream = await anthropic.messages.stream({
          model: claudeModel,
          max_tokens: 16000,
          thinking: { type: "enabled", budget_tokens: 8000 },
          messages: [{ role: "user", content: blogPrompt }],
          system: `You are an expert SEO content strategist and writer for ${project.company}. Think through the structure carefully before writing. Return ONLY valid JSON matching the required schema.`,
        });

        for await (const event of claudeStream) {
          if (event.type === "content_block_start") {
            if (event.content_block.type === "thinking") {
              thinkingEmitted = true;
            }
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "thinking_delta") {
              fullThinking += event.delta.thinking;
              // Stream thinking in larger chunks (min 40 chars) to avoid flooding
              if (event.delta.thinking.length >= 10) {
                emit({ event: "thinking", chunk: event.delta.thinking });
              }
            } else if (event.delta.type === "text_delta") {
              fullContent += event.delta.text;
            }
          }
        }

        // Signal thinking complete
        if (thinkingEmitted) {
          emit({ event: "thinking_done" });
        }

        // ── Stage 5: Polish ───────────────────────────────────────────────
        emit({ event: "stage", stage: "polish", detail: "Generating images and running SEO polish…" });

        // Parse the JSON from Claude's text response
        const { parseGeneratedBlogJson } = await import("@/lib/gemini");
        const blogData = parseGeneratedBlogJson(fullContent, entry, project, research);

        const { generateBlogImages, insertBlogImages } = await import("@/services/openAiImages");
        const { sanitizeBlogContent } = await import("@/lib/blog-content");

        const images = await generateBlogImages({
          title: blogData.title,
          targetKeyword: entry.focus_keyword,
          articleType: entry.article_type,
          niche: project.niche,
          audience: project.target_audience,
          company: project.company,
          wordCount: blogData.word_count,
        });

        const rawContent = insertBlogImages(blogData.content, images);
        const sanitized = await sanitizeBlogContent(rawContent, { ownDomain: project.domain ?? "" });
        const finalContent = sanitizeBlogMarkdown(sanitized.content);
        const finalWordCount = countWords(finalContent);

        // ── Save to DB ────────────────────────────────────────────────────
        const { data: existing } = await supabaseAdmin
          .from("blogs").select("id").eq("entry_id", body.entryId).maybeSingle();

        const upsertPayload = {
          title: blogData.title,
          content: finalContent,
          meta_description: blogData.meta_description,
          slug: blogData.slug,
          word_count: finalWordCount,
          target_keyword: entry.focus_keyword,
          article_type: entry.article_type,
          status: "generated",
          research_sources: blogData.research_sources,
          external_links: sanitized.externalLinks.slice(0, 10),
          internal_links: sanitized.internalLinks.slice(0, 12),
          source_url: "",
          repair_notes: [] as string[],
          updated_at: new Date().toISOString(),
        };

        let blogId: string;
        if (existing) {
          const { data, error } = await supabaseAdmin
            .from("blogs").update(upsertPayload).eq("id", existing.id).select("id").single();
          if (error) throw error;
          blogId = data.id;
        } else {
          const { data, error } = await supabaseAdmin
            .from("blogs").insert({ ...upsertPayload, entry_id: body.entryId, project_id: entry.project_id })
            .select("id").single();
          if (error) throw error;
          blogId = data.id;
        }

        await supabaseAdmin
          .from("calendar_entries").update({ status: "generated", title: blogData.title })
          .eq("id", body.entryId);

        emit({ event: "done", blogId });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Generation failed";
        console.error("[blog stream] Error:", message);
        try {
          await supabaseAdmin.from("calendar_entries").update({ status: "scheduled" }).eq("id", body.entryId);
        } catch { /* best effort */ }
        emit({ event: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ── Prompt builder (mirrors generateBlogPost in gemini.ts) ───────────────────
async function buildBlogPrompt(opts: {
  entry: any; project: any; research: any; existingBlogs: any[];
  brief: any; writerNotes?: string; wordCount: number;
}): Promise<string> {
  const { entry, project, research, existingBlogs, brief, writerNotes, wordCount } = opts;
  const { formatResearchForPrompt } = await import("@/lib/research");
  const { validateExternalUrl } = await import("@/lib/blog-content");

  // Internal link pool
  const allCandidates = [
    ...(brief?.internal_link_candidates ?? []).filter((l: any) => l.url?.startsWith("http"))
      .map((l: any) => ({ url: l.url, title: l.title || l.topic || "Page", type: "site" })),
    ...(existingBlogs ?? []).filter((b: any) => b.target_keyword !== entry.focus_keyword)
      .map((b: any) => ({ url: `https://${project.domain}/${b.slug}`, title: b.title, type: "generated" })),
  ];

  const validatedLinks = (await Promise.allSettled(
    allCandidates.map(async (c) => ({ c, ok: await validateExternalUrl(c.url, 4000) }))
  )).filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value.ok)
    .map((r) => r.value.c);

  const siteLinks = validatedLinks.filter((c: any) => c.type === "site").slice(0, 12);
  const generatedLinks = validatedLinks.filter((c: any) => c.type === "generated").slice(0, 8);

  const internalLinksBlock = (siteLinks.length || generatedLinks.length)
    ? `\nINTERNAL LINKING (pick 2–4 total):\n${[
        siteLinks.length ? `User's own site pages:\n${siteLinks.map((l: any) => `- ${l.title} · ${l.url}`).join("\n")}` : "",
        generatedLinks.length ? `Generated blogs:\n${generatedLinks.map((b: any) => `- "${b.title}" → ${b.url}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n")}`
    : "";

  // External sources validation
  let verifiedExternalBlock = "";
  if (research?.topArticles?.length) {
    const validated = (await Promise.allSettled(
      research.topArticles.slice(0, 8).map(async (art: any) => ({ art, ok: await validateExternalUrl(art.url, 4000) }))
    )).filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value.ok)
      .map((r) => r.value.art);
    if (validated.length) {
      verifiedExternalBlock = `\nVERIFIED EXTERNAL SOURCES (use ONLY these for external links):\n${validated.map((a: any) => `- ${a.title} → ${a.url}`).join("\n")}\n`;
    }
    research.topArticles = research.topArticles.filter((art: any) =>
      (validated as any[]).some((va: any) => va.url === art.url)
    );
  }

  const writerNotesBlock = writerNotes?.length
    ? `\nWRITER NOTES (follow closely):\n${writerNotes.slice(0, 2500)}\n` : "";

  const brandPersonaBlock = (project.brand_voice || project.brand_values || project.brand_description)
    ? `\nBRAND PERSONA & IDENTITY:\n${project.brand_voice ? `- Brand Voice/Tone: ${project.brand_voice}\n` : ""}${project.brand_values ? `- Core Values/Messaging: ${project.brand_values}\n` : ""}${project.brand_description ? `- Brand Personality/Description: ${project.brand_description}\n` : ""}`
    : "";

  const briefBlock = brief
    ? `\nCOMPANY CONTEXT:\n- Summary: ${brief.summary || "(none)"}\n- Products: ${brief.products?.slice(0, 10).join(", ") || "(none)"}\n- Audience: ${brief.audiences?.slice(0, 6).join(" | ") || project.target_audience}\n- USPs: ${brief.usps?.slice(0, 6).join(" | ") || "(none)"}\n- Tone: ${project.brand_voice || brief.tone || "professional, expert, helpful"}\n${brandPersonaBlock}`
    : brandPersonaBlock ? `\nBRAND PERSONA & IDENTITY:\n${brandPersonaBlock}\n` : "";

  const researchBlock = research ? formatResearchForPrompt(research) : "";

  const secondaryKeywords = entry.secondary_keywords?.length
    ? entry.secondary_keywords.slice(0, 10).map((kw: string, i: number) => `${i + 1}. ${kw}`).join("\n")
    : "none — derive 7–8 topically relevant H2s from the primary keyword";

  const faqSeeds = research?.peopleAlsoAsk?.length
    ? research.peopleAlsoAsk.slice(0, 7).map((q: any) => `• ${q.question}${q.answer ? `\n  Hint: ${q.answer}` : ""}`).join("\n")
    : "none available — use the most common search questions around this topic";

  return `You are an expert SEO content strategist. Produce a blog post that ranks in Google and converts readers for ${project.company}.

CRITICAL: Your response must be a single valid JSON object ONLY. No markdown fences outside the JSON.

JSON SCHEMA:
{
  "title": "A compelling H1 title that MUST include the primary keyword verbatim",
  "metaDescription": "Exactly 150-160 characters, MUST contain the primary keyword",
  "contentMarkdown": "Clean markdown starting with '# [H1 Title]'. Include intro, H2/H3 sections, FAQs, conclusion.",
  "faqQuestions": ["Question 1", "Question 2", "Question 3", "Question 4", "Question 5"],
  "internalLinksUsed": ["/slug-or-absolute-url"],
  "externalLinksUsed": ["https://url"]
}

PRIMARY KEYWORD: "${entry.focus_keyword}"
ARTICLE TITLE:   "${entry.title}"
ARTICLE TYPE:    ${entry.article_type}
TARGET AUDIENCE: ${project.target_audience}
INDUSTRY/NICHE:  ${project.niche}
COMPANY:         ${project.company} (${project.domain})
WORD COUNT:      ~${wordCount} words
${writerNotesBlock}${briefBlock}${internalLinksBlock}

SECONDARY KEYWORDS / H2 TOPICS:
${secondaryKeywords}

FAQ SEEDS (People Also Ask):
${faqSeeds}

${researchBlock}
${verifiedExternalBlock}

SEO REQUIREMENTS:
1. Minimum ${Math.max(wordCount, 1500)} words
2. Primary keyword "${entry.focus_keyword}" in H1, first 100 words, and meta description
3. At least 5 H2 headings, 2 H3 sub-headings
4. FAQ section under "## FAQs" with 7-10 Q&A pairs (### headings)
5. At least 5 external links (from verified sources only), 2 internal links
6. Meta description 150-160 characters exactly
7. No filler: avoid "In today's world", "game-changer", "delve", "unlock", "landscape"

Return JSON only.`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function countWords(markdown: string): number {
  return markdown.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ").replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/[#>*_\-[\]()` ~]/g, " ").split(/\s+/).filter(Boolean).length;
}

function sanitizeBlogMarkdown(markdown: string): string {
  let cleaned = markdown
    .replace(/^\s*```(?:markdown|md)?\s*/i, "").replace(/\s*```\s*$/i, "")
    .replace(/!\[[^\]]*\]\(\s*IMAGE_PLACEHOLDER\s*\)\s*\n?/gi, "")
    .replace(/Image placeholder missing a source\. Use edit mode to regenerate this image\./gi, "");

  const metaIdx = cleaned.indexOf("---META---");
  if (metaIdx !== -1) cleaned = cleaned.substring(0, metaIdx);

  return cleaned
    .replace(/^\s*"(?:external_links|internal_links|meta_description|slug|title|contentMarkdown)"\s*:\s*(?:\[.*?\]|"[^"]*")\s*,?\s*$/gm, "")
    .replace(/^\s*[{}]\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n").trim();
}
