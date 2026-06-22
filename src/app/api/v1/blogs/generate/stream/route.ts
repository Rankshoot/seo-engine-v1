import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import { buildBlogPrompt } from "@/lib/prompts/blog-prompt";

export const runtime = "nodejs";
export const maxDuration = 300;

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  return new Anthropic({ apiKey });
}

/**
 * SSE streaming endpoint for blog generation with real Claude thinking tokens.
 *
 * Event types:
 *   { event: "stage",        stage: string, detail?: string }
 *   { event: "thinking",     chunk: string }
 *   { event: "thinking_done"              }
 *   { event: "done",         blogId: string }
 *   { event: "error",        message: string }
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
    contentHealthAudit?: Record<string, any>;
    // Advanced options
    brandPersona?: string;
    useAhrefsData?: boolean;
    ahrefsH2s?: Array<{ keyword: string; volume: number; difficulty: number | null }>;
    ahrefsFaqs?: Array<{ keyword: string; volume: number; difficulty: number | null }>;
    useDeepAnalysis?: boolean;
    deepAnalysisPages?: Array<{ url: string; title: string; domain: string; position: number }>;
    customInstructions?: string;
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
          entry = {
            focus_keyword: kw,
            title: body.topic || kw,
            article_type: "Blog Post",
            secondary_keywords: body.secondaryKeywords || [],
            content_health_audit: body.contentHealthAudit || null,
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

        // ── Surgical repair branch (Content Audit Studio → Generate Enhanced) ──
        // When the calendar entry carries a content-health audit in repair mode,
        // we DON'T regenerate from scratch — we surgically fix the audited issues
        // while preserving everything that already passes. Runs over SSE so it
        // never hits the gateway timeout.
        const auditData = body.contentHealthAudit || (entry ? (entry as any).content_health_audit : null);
        if (auditData) {
          const { parseContentHealthRepairPlan } = await import("@/lib/content-health-calendar");
          const repairPlan = parseContentHealthRepairPlan(auditData);
          if (repairPlan) {
            emit({ event: "stage", stage: "repair_scrape", detail: "Reading the original article…" });

            // Prefer the markdown we already scraped during the audit (works for
            // both URL audits and uploaded content); fall back to a fresh scrape.
            let originalMarkdown = "";
            try {
              const { data: auditRow } = await supabaseAdmin
                .from("blog_audits")
                .select("scraped_markdown")
                .eq("project_id", projectId)
                .eq("url", repairPlan.url)
                .maybeSingle();
              originalMarkdown = (auditRow?.scraped_markdown as string) || "";
            } catch { /* fall through to scrape */ }

            if (originalMarkdown.trim().length < 400 && /^https?:\/\//i.test(repairPlan.url)) {
              const { hybridReadUrl } = await import("@/services/hybridScraper");
              const fresh = await hybridReadUrl(repairPlan.url, { timeoutMs: 25_000 });
              if (fresh.ok) originalMarkdown = fresh.markdown;
            }

            if (originalMarkdown.trim().length < 400) {
              emit({ event: "error", message: "Could not read the original article content to enhance. Re-run the audit and try again." });
              await supabaseAdmin.from("calendar_entries").update({ status: "scheduled" }).eq("id", body.entryId);
              controller.close();
              return;
            }

            emit({ event: "stage", stage: "repair_draft", detail: "Applying audit fixes while preserving strong sections…" });

            const analysis: any = repairPlan.analysis;
            const fromAudit = (analysis.internal_link_opportunities ?? []).map((i: any) => i.target_url);
            const fromBrief = (brief?.internal_link_candidates ?? []).map((c: any) => c.url);
            const internalLinkPool = Array.from(new Set([...fromAudit, ...fromBrief])).filter(
              (u) => u && u !== repairPlan.url
            ) as string[];

            const { repairBlogPost } = await import("@/lib/gemini");

            const repaired = await repairBlogPost({
              sourceUrl: repairPlan.url,
              originalTitle: repairPlan.title || "",
              originalMarkdown,
              issues: (analysis.issues ?? []).map((i: any) => ({
                label: i.label,
                detail: i.detail,
                fix: i.fix,
                severity: i.severity,
                category: i.category,
                why_it_matters: i.why_it_matters,
              })),
              contentGaps: analysis.content_gaps ?? [],
              internalLinkPool,
              primaryKeyword: analysis.primary_keyword || repairPlan.primary_keyword || entry.focus_keyword,
              secondaryKeywords: analysis.secondary_keywords ?? [],
              brief,
              project,
              wordCount: Math.min(4500, Math.max(1400, countWords(originalMarkdown) + 250)),
            });

            emit({ event: "stage", stage: "polish", detail: "Polishing markdown and validating links…" });

            const { insertBlogImagePlaceholders } = await import("@/services/openAiImages");
            const { sanitizeBlogContent } = await import("@/lib/blog-content");

            const withImages = insertBlogImagePlaceholders(repaired.content, {
              title: repaired.title,
              targetKeyword: entry.focus_keyword,
              wordCount: countWords(repaired.content),
            });
            const sanitized = await sanitizeBlogContent(sanitizeBlogMarkdown(withImages), {
              ownDomain: project.domain ?? "",
            });
            const finalContent = sanitizeBlogMarkdown(sanitized.content);

            const repairPayload = {
              title: repaired.title,
              content: finalContent,
              meta_description: analysis.summary || repaired.meta_description,
              slug: repaired.slug,
              word_count: countWords(finalContent),
              target_keyword: entry.focus_keyword,
              article_type: "Repair",
              status: "generated" as const,
              research_sources: repaired.research_sources,
              external_links: sanitized.externalLinks.slice(0, 10),
              internal_links: sanitized.internalLinks.slice(0, 12),
              source_url: repairPlan.url,
              repair_notes: repaired.repair_notes ?? [],
              updated_at: new Date().toISOString(),
            };

            let existingRepair = null;
            if (body.entryId) {
              const { data } = await supabaseAdmin
                .from("blogs").select("id").eq("entry_id", body.entryId).maybeSingle();
              existingRepair = data;
            } else if (repairPlan.url) {
              const { data } = await supabaseAdmin
                .from("blogs")
                .select("id")
                .eq("project_id", projectId)
                .eq("source_url", repairPlan.url)
                .is("entry_id", null)
                .maybeSingle();
              existingRepair = data;
            }

            let repairBlogId: string;
            if (existingRepair) {
              const { data, error } = await supabaseAdmin
                .from("blogs").update(repairPayload).eq("id", existingRepair.id).select("id").single();
              if (error) throw error;
              repairBlogId = data.id;
            } else {
              const { data, error } = await supabaseAdmin
                .from("blogs").insert({ ...repairPayload, entry_id: body.entryId || null, project_id: projectId })
                .select("id").single();
              if (error) throw error;
              repairBlogId = data.id;
            }

            if (body.entryId) {
              await supabaseAdmin
                .from("calendar_entries").update({ status: "generated", title: repaired.title })
                .eq("id", body.entryId);
            }

            emit({ event: "done", blogId: repairBlogId });
            controller.close();
            return;
          }
        }

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

        // ── Deep analysis stages (if requested) ──────────────────────────
        let deepAnalysisSummary: string | undefined;

        if (body.useDeepAnalysis && body.deepAnalysisPages && body.deepAnalysisPages.length > 0) {
          const { QuotaService } = await import("@/services/quota");

          // Check credit before doing work
          const quotaStatus = await QuotaService.getUserQuotaStatus(user.id);
          if (quotaStatus.deep_analysis.remaining <= 0) {
            emit({ event: "error", message: "No Deep Analysis credits remaining." });
            controller.close();
            return;
          }

          // Scrape stage
          emit({ event: "stage", stage: "deep_scrape", detail: "Scraping competitor pages…" });

          const { readUrlViaJinaReader } = await import("@/lib/jina");
          const scrapedPages: Array<{ title: string; url: string; content: string }> = [];

          for (const page of body.deepAnalysisPages) {
            emit({ event: "stage", stage: "deep_scrape", detail: `Scraping ${page.domain}…` });
            try {
              const result = await readUrlViaJinaReader(page.url);
              scrapedPages.push({ title: page.title, url: page.url, content: result.markdown.slice(0, 4000) });
            } catch {
              scrapedPages.push({ title: page.title, url: page.url, content: "(failed to scrape)" });
            }
          }

          // Analyse stage
          emit({ event: "stage", stage: "deep_analyze", detail: "Analysing content gaps across competitors…" });

          const analysisPrompt = `You are an expert SEO strategist. Below are excerpts from the top ${scrapedPages.length} ranking pages for the keyword "${entry.focus_keyword}".

Your task: Identify what these pages cover well, what they miss, and what a new blog post must include to outrank them. Be specific — name exact topics, questions, angles, and depth gaps.

${scrapedPages.map((p, i) => `--- Page ${i + 1}: ${p.title} (${p.url}) ---\n${p.content}`).join("\n\n")}

Respond with a concise but rich analysis (300–500 words) structured as:
1. What they all cover (the baseline)
2. Key gaps and missed angles
3. Unique depth opportunities
4. Specific topics/questions to cover that will give a new blog a ranking edge`;

          const anthropic = getAnthropicClient();
          const analysisRes = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1024,
            messages: [{ role: "user", content: analysisPrompt }],
          });

          deepAnalysisSummary = (analysisRes.content[0] as any).text ?? "";

          // Deduct the credit
          await QuotaService.deductQuota(user.id, "deep_analysis", 1);
        }

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

        // Validate internal link candidates
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
                validatedLinks.some((vl: any) => vl.type === "site" && vl.url === c.url)
              ),
            }
          : null;

        const filteredExistingBlogs = (existingBlogs ?? []).filter((b: any) =>
          validatedLinks.some((vl: any) => vl.type === "generated" && vl.url === `https://${project.domain}/${b.slug}`)
        );

        // Validate external research sources
        if (research?.topArticles?.length) {
          const articlesToValidate = research.topArticles.slice(0, 8);
          const validatedResearch = await Promise.allSettled(
            articlesToValidate.map(async (art: any) => ({ art, ok: await validateExternalUrl(art.url, 4000) }))
          );
          const verified = validatedResearch
            .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value.ok)
            .map((r) => r.value.art);
          research.topArticles = research.topArticles.filter((art: any) =>
            verified.some((va: any) => va.url === art.url)
          );
        }

        // Build the Ahrefs context from pre-fetched frontend data (if provided)
        let ahrefsContext: any = undefined;
        if (body.useAhrefsData && (body.ahrefsH2s?.length || body.ahrefsFaqs?.length)) {
          ahrefsContext = {
            matchingTerms: [],
            questions: [],
            ideas: [],
            serp: [],
            secondaryKeywords: body.ahrefsH2s ?? [],
            faqKeywords: body.ahrefsFaqs ?? [],
          };

          // Deduct credits for the data that was used
          const { QuotaService } = await import("@/services/quota");
          if (body.ahrefsH2s?.length) await QuotaService.deductQuota(user.id, "ahrefs_h2s", 1);
          if (body.ahrefsFaqs?.length) await QuotaService.deductQuota(user.id, "ahrefs_faqs", 1);
        }

        // Build the blog prompt
        const blogPrompt = buildBlogPrompt({
          entry: {
            focus_keyword: entry.focus_keyword,
            title: entry.title,
            article_type: entry.article_type || "Blog Post",
            secondary_keywords: entry.secondary_keywords,
          },
          project,
          wordCount: body.wordCount ?? 2500,
          research,
          existingBlogs: filteredExistingBlogs,
          brief: filteredBrief,
          ahrefsContext,
          writerNotes: mergedWriterNotes || undefined,
          brandPersona: body.brandPersona,
          customInstructions: body.customInstructions,
          deepAnalysisSummary,
        });

        // ── Stage 4: Draft with streaming thinking ────────────────────────
        emit({ event: "stage", stage: "draft", detail: "Claude is thinking and drafting your blog post…" });

        const { getProviderForRoute } = await import("@/services/ai/providers");
        const { model: routedModel } = await getProviderForRoute("blog");
        const claudeModel = routedModel.startsWith("claude") ? routedModel : "claude-sonnet-4-6";

        let fullContent = "";
        let thinkingEmitted = false;

        const abortController = new AbortController();
        if (req.signal) {
          req.signal.addEventListener("abort", () => abortController.abort());
        }

        wasStalled = false;
        stallTimeoutId = undefined;
        const resetStallTimeout = () => {
          if (stallTimeoutId) clearTimeout(stallTimeoutId);
          stallTimeoutId = setTimeout(() => {
            wasStalled = true;
            abortController.abort();
          }, 120000);
        };

        resetStallTimeout();

        const anthropic = getAnthropicClient();
        const claudeStream = anthropic.messages.stream({
          model: claudeModel,
          max_tokens: 32000,
          thinking: { type: "enabled", budget_tokens: 8000 },
          messages: [{ role: "user", content: blogPrompt }],
          system: `You are an expert SEO content strategist and writer for ${project.company}. Think through the structure carefully before writing. Return ONLY valid JSON matching the required schema.`,
        }, { signal: abortController.signal });

        for await (const event of claudeStream) {
          resetStallTimeout();
          if (event.type === "content_block_start") {
            if (event.content_block.type === "thinking") thinkingEmitted = true;
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "thinking_delta") {
              if (event.delta.thinking.length >= 10) {
                emit({ event: "thinking", chunk: event.delta.thinking });
              }
            } else if (event.delta.type === "text_delta") {
              fullContent += event.delta.text;
            }
          }
        }

        if (stallTimeoutId) clearTimeout(stallTimeoutId);
        if (thinkingEmitted) emit({ event: "thinking_done" });

        // ── Stage 5: Polish ───────────────────────────────────────────────
        emit({ event: "stage", stage: "polish", detail: "Generating images and running SEO polish…" });

        const { parseGeneratedBlogJson } = await import("@/lib/gemini");
        const blogData = parseGeneratedBlogJson(fullContent, entry, project, research);

        const { insertBlogImagePlaceholders } = await import("@/services/openAiImages");
        const { sanitizeBlogContent } = await import("@/lib/blog-content");

        const rawContent = insertBlogImagePlaceholders(blogData.content, {
          title: blogData.title,
          targetKeyword: entry.focus_keyword,
          wordCount: blogData.word_count,
        });
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
        if (wasStalled || err?.name === "AbortError" || err?.name === "APIConnectionTimeoutError" || err?.message?.includes("aborted")) {
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
