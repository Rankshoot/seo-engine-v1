import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import { buildBlogPrompt } from "@/lib/prompts/blog-prompt";

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

  const body = (await req.json()) as {
    entryId?: string;
    projectId?: string;
    keyword?: string;
    topic?: string;
    audience?: string;
    tone?: string;
    goal?: string;
    ctaObjective?: string;
    secondaryKeywords?: string[];
    wordCount?: number;
    writerNotes?: string;
  };
  if (!body.entryId && (!body.projectId || !body.keyword)) {
    return new Response(
      `data: ${JSON.stringify({ event: "error", message: "Expected entryId OR { projectId, keyword }" })}\n\n`,
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

      let wasStalled = false;
      let stallTimeoutId: NodeJS.Timeout | undefined;

      try {
        // ── Stage 1: Load context ─────────────────────────────────────────
        emit({ event: "stage", stage: "context", detail: "Loading project brief…" });

        let project: any = null;
        let brief: any = null;
        let entry: any = null;
        let projectId = "";

        if (body.entryId) {
          const { data: entryRow, error: eErr } = await supabaseAdmin
            .from("calendar_entries").select("*").eq("id", body.entryId).single();

          if (eErr || !entryRow) {
            emit({ event: "error", message: "Calendar entry not found" });
            controller.close();
            return;
          }
          entry = entryRow;
          projectId = entry.project_id;
          await supabaseAdmin.from("calendar_entries").update({ status: "generating" }).eq("id", body.entryId);
        } else {
          projectId = body.projectId!;
          const kw = body.keyword!;
          // Build a synthetic entry object for direct generation
          entry = {
            focus_keyword: kw,
            title: body.topic || kw,
            article_type: "Blog Post",
            secondary_keywords: body.secondaryKeywords || [],
            content_health_audit: null,
            slug: kw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80),
          };
        }

        const { data: projectRow, error: pErr } = await supabaseAdmin
          .from("projects").select("*").eq("id", projectId).eq("user_id", user.id).single();

        if (pErr || !projectRow) {
          emit({ event: "error", message: "Project not found or unauthorized" });
          controller.close();
          return;
        }
        project = projectRow;

        try {
          const { data: briefRow } = await supabaseAdmin
            .from("project_briefs").select("brief").eq("project_id", projectId).maybeSingle();
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
            .eq("project_id", projectId).in("status", ["generated", "approved", "published"])
            .neq("entry_id", body.entryId || "").limit(15);
          existingBlogs = blogs ?? [];
        } catch { /* optional */ }

        // ── Stage 3: Outline ──────────────────────────────────────────────
        emit({ event: "stage", stage: "outline", detail: "Building SEO structure and topical outline…" });

        let mergedWriterNotes = "";
        if (body.entryId) {
          const { formatContentHealthAuditForWriter } = await import("@/lib/content-health-calendar");
          const contentHealthRaw = (entry as any).content_health_audit;
          const auditWriterBlock = formatContentHealthAuditForWriter(contentHealthRaw);
          mergedWriterNotes = [body.writerNotes?.trim(), auditWriterBlock || ""]
            .filter(Boolean).join("\n\n---\n\n");
        } else {
          mergedWriterNotes = `Audience: ${body.audience || ""}\nTone: ${body.tone || ""}\nGoal: ${body.goal || ""}\nCTA: ${body.ctaObjective || ""}\nSecondary Keywords: ${(body.secondaryKeywords || []).join(", ")}`;
          if (body.writerNotes) {
            mergedWriterNotes = `${body.writerNotes.trim()}\n\n---\n\n${mergedWriterNotes}`;
          }
        }

        // Pre-validate the internal link candidates
        const { validateExternalUrl } = await import("@/lib/blog-content");
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

        const filteredBrief = brief
          ? {
              ...brief,
              internal_link_candidates: brief.internal_link_candidates.filter((c: any) =>
                validatedLinks.some((vl: any) => vl.type === 'site' && vl.url === c.url)
              )
            }
          : null;

        const filteredExistingBlogs = existingBlogs
          ? existingBlogs.filter((b: any) =>
              validatedLinks.some((vl: any) => vl.type === 'generated' && vl.url === `https://${project.domain}/${b.slug}`)
            )
          : [];

        // Pre-validate external research sources (Serper topArticles)
        if (research && research.topArticles && research.topArticles.length > 0) {
          const articlesToValidate = research.topArticles.slice(0, 8);
          const validatedResearchResults = await Promise.allSettled(
            articlesToValidate.map(async (art: any) => {
              const ok = await validateExternalUrl(art.url, 4000);
              return { art, ok };
            })
          );

          const verifiedArticles = validatedResearchResults
            .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value.ok)
            .map(r => r.value.art);

          research.topArticles = research.topArticles.filter((art: any) =>
            verifiedArticles.some((va: any) => va.url === art.url)
          );
        }

        // Fetch blog-specific Ahrefs context (secondary keywords for headings, FAQ keywords)
        let ahrefsContext: any = undefined;
        try {
          const { fetchBlogAhrefsContext } = await import("@/lib/blog-ahrefs-context");
          const blogAhrefsCtx = await fetchBlogAhrefsContext(
            entry.focus_keyword,
            project.target_region,
            user.id
          );
          console.log('[blog stream] Blog Ahrefs context:', {
            fromAhrefs: blogAhrefsCtx.fromAhrefs,
            secondaryKeywords: blogAhrefsCtx.secondaryKeywords.length,
            faqKeywords: blogAhrefsCtx.faqKeywords.length,
            secondaryKeywordsData: blogAhrefsCtx.secondaryKeywords,
            faqKeywordsData: blogAhrefsCtx.faqKeywords,
          });
          if (blogAhrefsCtx.fromAhrefs) {
            ahrefsContext = {
              matchingTerms: blogAhrefsCtx.secondaryKeywords,
              questions: blogAhrefsCtx.faqKeywords,
              ideas: [],
              serp: [],
              secondaryKeywords: blogAhrefsCtx.secondaryKeywords,
              faqKeywords: blogAhrefsCtx.faqKeywords,
            };
          } else {
            console.warn('[blog stream] ⚠️ Plan gate blocked Ahrefs blog APIs for user:', user.id);
          }
        } catch (e) {
          console.warn('[blog stream] Failed to fetch blog Ahrefs context, continuing without:', e);
        }

        // Build the blog prompt
        const blogPrompt = buildBlogPrompt({
          entry: {
            focus_keyword: entry.focus_keyword,
            title: entry.title,
            article_type: entry.article_type || 'Blog Post',
            secondary_keywords: entry.secondary_keywords,
          },
          project,
          wordCount: body.wordCount ?? 2500,
          research,
          existingBlogs: filteredExistingBlogs,
          brief: filteredBrief,
          ahrefsContext,
          writerNotes: mergedWriterNotes || undefined,
        });

        // Log the full prompt for debugging
        console.log('[blog stream] ===== FULL PROMPT BEING SENT TO CLAUDE =====');
        console.log(blogPrompt);
        console.log('[blog stream] ===== END PROMPT =====');

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

        const abortController = new AbortController();
        if (req.signal) {
          req.signal.addEventListener("abort", () => {
            abortController.abort();
          });
        }

        wasStalled = false;
        stallTimeoutId = undefined;
        const resetStallTimeout = () => {
          if (stallTimeoutId) clearTimeout(stallTimeoutId);
          stallTimeoutId = setTimeout(() => {
            wasStalled = true;
            abortController.abort();
          }, 45000);
        };

        resetStallTimeout();

        const anthropic = getAnthropicClient();
        const claudeStream = await anthropic.messages.stream({
          model: claudeModel,
          max_tokens: 16000,
          thinking: { type: "enabled", budget_tokens: 8000 },
          messages: [{ role: "user", content: blogPrompt }],
          system: `You are an expert SEO content strategist and writer for ${project.company}. Think through the structure carefully before writing. Return ONLY valid JSON matching the required schema.`,
        }, {
          signal: abortController.signal,
        });

        for await (const event of claudeStream) {
          resetStallTimeout();
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

        if (stallTimeoutId) clearTimeout(stallTimeoutId);

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
          audience: body.audience || project.target_audience || "",
          company: project.company,
          wordCount: blogData.word_count,
        });

        const rawContent = insertBlogImages(blogData.content, images);
        const sanitized = await sanitizeBlogContent(rawContent, { ownDomain: project.domain ?? "" });
        const finalContent = sanitizeBlogMarkdown(sanitized.content);
        const finalWordCount = countWords(finalContent);

        // ── Save to DB ────────────────────────────────────────────────────
        const upsertPayload = {
          title: blogData.title,
          content: finalContent,
          meta_description: blogData.meta_description,
          slug: blogData.slug,
          word_count: finalWordCount,
          target_keyword: entry.focus_keyword,
          article_type: entry.article_type,
          status: "generated" as const,
          research_sources: blogData.research_sources,
          external_links: sanitized.externalLinks.slice(0, 10),
          internal_links: sanitized.internalLinks.slice(0, 12),
          source_url: "",
          repair_notes: [] as string[],
          updated_at: new Date().toISOString(),
        };

        let blogId: string;
        if (body.entryId) {
          const { data: existing } = await supabaseAdmin
            .from("blogs").select("id").eq("entry_id", body.entryId).maybeSingle();

          if (existing) {
            const { data, error } = await supabaseAdmin
              .from("blogs").update(upsertPayload).eq("id", existing.id).select("id").single();
            if (error) throw error;
            blogId = data.id;
          } else {
            const { data, error } = await supabaseAdmin
              .from("blogs").insert({ ...upsertPayload, entry_id: body.entryId, project_id: projectId })
              .select("id").single();
            if (error) throw error;
            blogId = data.id;
          }

          await supabaseAdmin
            .from("calendar_entries").update({ status: "generated", title: blogData.title })
            .eq("id", body.entryId);
        } else {
          const { data, error } = await supabaseAdmin
            .from("blogs").insert({ ...upsertPayload, entry_id: null, project_id: projectId })
            .select("id").single();
          if (error) throw error;
          blogId = data.id;
        }

        emit({ event: "done", blogId });
      } catch (err: any) {
        let message = err instanceof Error ? err.message : "Generation failed";
        if (wasStalled || (err && (err.name === "AbortError" || err.name === "APIConnectionTimeoutError" || err.message?.includes("aborted")))) {
          message = "Gateway Timeout";
        }
        console.error("[blog stream] Error:", message);
        if (body.entryId) {
          try {
            await supabaseAdmin.from("calendar_entries").update({ status: "scheduled" }).eq("id", body.entryId);
          } catch { /* best effort */ }
        }
        emit({ event: "error", message });
      } finally {
        if (stallTimeoutId) clearTimeout(stallTimeoutId);
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
