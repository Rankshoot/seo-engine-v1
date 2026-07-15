import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import { buildBlogPrompt } from "@/lib/prompts/blog-prompt";

export const runtime = "nodejs";
export const maxDuration = 300;

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  return new Anthropic({ apiKey, maxRetries: 5 });
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
    useRealImages?: boolean;
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
      // True when the user changed the keyword from what was scheduled.
      // When set, the generated blog is treated as standalone — the original
      // calendar entry is left completely untouched (stays "scheduled" for its
      // original keyword). The blog is NOT linked back to it via entry_id.
      // Declared outside try so the catch block can read it.
      let keywordChanged = false;

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

          // The generator form pre-fills from this calendar entry, but the user
          // may have edited the keyword/topic/secondary keywords before hitting
          // Generate. Apply form values to the local entry object so generation
          // uses them, then decide what to persist back.
          const editedKeyword = body.keyword?.trim();
          const originalKeyword = entry.focus_keyword as string;
          keywordChanged = Boolean(editedKeyword && editedKeyword !== originalKeyword);

          // Always apply all form values to the local entry so the prompt is correct.
          if (editedKeyword) entry.focus_keyword = editedKeyword;
          const editedTopic = body.topic?.trim();
          const originalTitle = entry.title as string;
          if (editedTopic) entry.title = editedTopic;
          if (body.secondaryKeywords?.length) entry.secondary_keywords = body.secondaryKeywords;

          if (keywordChanged) {
            // Keyword was changed: leave the original calendar slot completely
            // untouched. The blog will be saved as a standalone piece with no
            // entry_id — the original scheduled keyword remains pending.
          } else {
            // Keyword unchanged: sync any other form edits back and mark generating.
            const entryUpdates: Record<string, unknown> = { status: "generating" };
            if (editedTopic && editedTopic !== originalTitle) entryUpdates.title = editedTopic;
            if (body.secondaryKeywords && JSON.stringify(body.secondaryKeywords) !== JSON.stringify(entryRow.secondary_keywords ?? []))
              entryUpdates.secondary_keywords = body.secondaryKeywords;
            await supabaseAdmin.from("calendar_entries").update(entryUpdates).eq("id", body.entryId);
          }
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

        // Keyword intent + funnel stage feed the content-archetype picker so the
        // article's structure adapts to search intent. Best-effort; never blocks.
        // Skipped when the user changed the keyword (the stored intent no longer
        // matches) — the archetype picker then derives shape from the keyword text.
        let keywordIntent: string | null = null;
        let keywordFunnelStage: string | null = null;
        try {
          if (!keywordChanged && entry.keyword_id) {
            const { data: kwRow } = await supabaseAdmin
              .from("keywords").select("intent, funnel_stage").eq("id", entry.keyword_id).maybeSingle();
            keywordIntent = kwRow?.intent ?? null;
            keywordFunnelStage = kwRow?.funnel_stage ?? null;
          }
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
            const { loadRankedSitemapInternalLinks: loadRepairSitemapLinks } = await import("@/lib/internal-links");
            const repairSitemapLinks = (await loadRepairSitemapLinks(projectId, {
              focusKeyword: analysis.primary_keyword || repairPlan.primary_keyword || entry.focus_keyword,
              title: repairPlan.title || "",
              secondaryKeywords: analysis.secondary_keywords ?? [],
              excludeUrls: [repairPlan.url],
              limit: 18,
            })).map((l) => l.url);
            const fromAudit = (analysis.internal_link_opportunities ?? []).map((i: any) => i.target_url);
            const fromBrief = (brief?.internal_link_candidates ?? []).map((c: any) => c.url);
            const internalLinkPool = Array.from(new Set([...fromAudit, ...fromBrief, ...repairSitemapLinks])).filter(
              (u) => u && u !== repairPlan.url
            ) as string[];

            // ── Strip PDF artefacts before passing to the repair LLM ──────
            // Pages that embed PDF viewers can have their full PDF text
            // extracted by Jina/Playwright. Without this, the repaired blog
            // ends up being just a dump of the PDF content.
            const { stripPdfArtifacts, hasPdfContent } = await import("@/lib/pdf-content");
            let cleanedMarkdown = originalMarkdown;
            if (hasPdfContent(originalMarkdown)) {
              const { cleaned, strippedPdf } = stripPdfArtifacts(originalMarkdown);
              cleanedMarkdown = cleaned;
              if (strippedPdf) {
                emit({ event: "stage", stage: "repair_clean", detail: "Detected embedded PDF — separating article content from document content…" });
              }
            }

            const { repairBlogPost } = await import("@/lib/claude-blog-repair");

            const repaired = await repairBlogPost(
              {
                sourceUrl: repairPlan.url,
                originalTitle: repairPlan.title || "",
                originalMarkdown: cleanedMarkdown,
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
                wordCount: Math.min(4500, Math.max(1400, countWords(cleanedMarkdown) + 250)),
              },
              {
                // Forward Claude's streaming chunks as thinking events so the
                // UI can show the generation progress in real time.
                onChunk: (chunk) => emit({ event: "thinking", chunk }),
              }
            );

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

            const { normalizeMetaDescription: normalizeRepairMeta } = await import("@/lib/blog-markdown-polish");
            const repairPayload = {
              title: repaired.title,
              content: finalContent,
              meta_description: normalizeRepairMeta(repaired.meta_description || analysis.summary, finalContent),
              slug: repaired.slug,
              word_count: countWords(finalContent),
              target_keyword: entry.focus_keyword,
              article_type: "Repair",
              status: "generated" as const,
              research_sources: repaired.research_sources,
              // Full arrays (no cap) — these must mirror the links actually
              // present in the content so the previewer sidebar always matches.
              external_links: sanitized.externalLinks,
              internal_links: sanitized.internalLinks,
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
        const { fetchPerplexityFollowUps, mergeFollowUpQuestions } = await import("@/lib/perplexity");
        const { researchCredibleSources } = await import("@/lib/deep-research");

        // SERP research, Perplexity follow-ups, and the deep-research pass run in
        // parallel — all are best-effort and none may block generation.
        let research: any = null;
        let verifiedSources: import("@/lib/deep-research").DeepResearchResult | null = null;
        const [researchSettled, followUpsSettled, deepResearchSettled] = await Promise.allSettled([
          researchKeyword(entry.focus_keyword, project.target_region, project.target_language),
          fetchPerplexityFollowUps(entry.focus_keyword, { limit: 3 }),
          researchCredibleSources(entry.focus_keyword),
        ]);
        if (researchSettled.status === "fulfilled") {
          research = researchSettled.value;
        } else {
          console.warn("[blog stream] Research failed, continuing:", researchSettled.reason);
        }

        // Deep research → verified facts + approved citation URLs the writer must
        // build on and cite. Best-effort; the prompt degrades gracefully if empty.
        if (deepResearchSettled.status === "fulfilled") {
          verifiedSources = deepResearchSettled.value;
          if (verifiedSources.sources.length) {
            emit({ event: "stage", stage: "research", detail: `Verified ${verifiedSources.sources.length} credible sources with ${verifiedSources.facts.length} data points…` });
          }
        } else {
          console.warn("[blog stream] Deep research failed, continuing:", deepResearchSettled.reason);
        }

        // Follow-ups: Perplexity's live "Follow-ups" for the primary keyword,
        // topped up from People-Also-Ask so the AEO H2 sections always have
        // real searcher questions to answer even without a Perplexity key.
        const perplexityFollowUps = followUpsSettled.status === "fulfilled" ? followUpsSettled.value : [];
        const followUpQuestions = mergeFollowUpQuestions(perplexityFollowUps, research?.peopleAlsoAsk, 3);
        if (followUpQuestions.length) {
          emit({ event: "stage", stage: "research", detail: `Found ${followUpQuestions.length} follow-up questions searchers ask next…` });
        }

        let existingBlogs: { title: string; slug: string; target_keyword: string }[] = [];
        try {
          const { data: blogs } = await supabaseAdmin
            .from("blogs").select("title, slug, target_keyword")
            .eq("project_id", projectId).in("status", ["generated", "approved", "published"])
            .neq("entry_id", body.entryId || "")
            // Newest first so the internal-link pool favours the latest posts.
            .order("created_at", { ascending: false })
            .limit(15);
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
          // Live form edits (audience/tone/goal/CTA/secondary keywords) made in the
          // generator review step — not just whatever was stored when the entry
          // was first scheduled.
          const liveNotesBlock = (body.audience || body.tone || body.goal || body.ctaObjective || body.secondaryKeywords?.length)
            ? `Audience: ${body.audience || ""}\nTone: ${body.tone || ""}\nGoal: ${body.goal || ""}\nCTA: ${body.ctaObjective || ""}\nSecondary Keywords: ${(body.secondaryKeywords || []).join(", ")}`
            : "";
          mergedWriterNotes = [body.writerNotes?.trim(), liveNotesBlock, auditWriterBlock || ""]
            .filter(Boolean).join("\n\n---\n\n");
        } else {
          mergedWriterNotes = `Audience: ${body.audience || ""}\nTone: ${body.tone || ""}\nGoal: ${body.goal || ""}\nCTA: ${body.ctaObjective || ""}\nSecondary Keywords: ${(body.secondaryKeywords || []).join(", ")}`;
          if (body.writerNotes) {
            mergedWriterNotes = `${body.writerNotes.trim()}\n\n---\n\n${mergedWriterNotes}`;
          }
        }

        // Internal-link pool: brief candidates + relevance-ranked sitemap URLs.
        // The sitemap pool is what lets the article deep-link to other content
        // pages instead of only the homepage / landing page.
        const { validateExternalUrl } = await import("@/lib/blog-content");
        const { loadRankedSitemapInternalLinks } = await import("@/lib/internal-links");

        const currentArticleUrl = entry.slug ? `https://${project.domain}/${entry.slug}` : "";
        const sitemapCandidates = await loadRankedSitemapInternalLinks(projectId, {
          focusKeyword: entry.focus_keyword,
          title: entry.title,
          secondaryKeywords: entry.secondary_keywords ?? [],
          excludeUrls: currentArticleUrl ? [currentArticleUrl] : [],
          limit: 18,
        });

        const allCandidates = [
          ...(brief?.internal_link_candidates ?? []).filter((l: any) => l.url?.startsWith("http"))
            .map((l: any) => ({ url: l.url, title: l.title || l.topic || "Page", type: "site" })),
          ...sitemapCandidates
            .map((l) => ({ url: l.url, title: l.title || l.topic || "Page", type: "sitemap" })),
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

        // Sitemap-derived links that passed validation → fed to the prompt as
        // an extra internal-link pool (merged + deduped inside buildBlogPrompt).
        const validatedSitemapUrls = new Set(
          validatedLinks.filter((vl: any) => vl.type === "sitemap").map((vl: any) => vl.url)
        );
        const extraInternalLinks = sitemapCandidates.filter((c) => validatedSitemapUrls.has(c.url));

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
          keywordIntent,
          funnelStage: keywordFunnelStage,
          research,
          verifiedSources,
          existingBlogs: filteredExistingBlogs,
          brief: filteredBrief,
          extraInternalLinks,
          followUpQuestions,
          ahrefsContext,
          writerNotes: mergedWriterNotes || undefined,
          brandPersona: body.brandPersona,
          customInstructions: body.customInstructions,
          deepAnalysisSummary,
        });

        // ── Stage 4 + 5: Draft → parse → validate, with bounded auto-retry ──
        // A malformed draft (raw JSON envelope leaking into the body, truncation,
        // placeholder-only content) is regenerated up to MAX_GEN_ATTEMPTS times.
        // Broken content is NEVER persisted — see the quality gate after the loop.
        const MAX_GEN_ATTEMPTS = 2;

        const { getProviderForRoute } = await import("@/services/ai/providers");
        const { model: routedModel } = await getProviderForRoute("blog");
        const claudeModel = routedModel.startsWith("claude") ? routedModel : "claude-sonnet-4-6";

        const { parseGeneratedBlogJson } = await import("@/lib/gemini");
        const { insertBlogImagePlaceholders } = await import("@/services/openAiImages");
        const { sanitizeBlogContent } = await import("@/lib/blog-content");
        const {
          validateGeneratedContent,
          looksLikeRawJsonEnvelope,
          recoverContentFromEnvelope,
          summarizeValidation,
        } = await import("@/lib/content-validation");

        const abortController = new AbortController();
        if (req.signal) {
          req.signal.addEventListener("abort", () => abortController.abort());
        }
        const resetStallTimeout = () => {
          if (stallTimeoutId) clearTimeout(stallTimeoutId);
          stallTimeoutId = setTimeout(() => {
            wasStalled = true;
            abortController.abort();
          }, 120000);
        };

        const anthropic = getAnthropicClient();

        // One streamed Claude draft → accumulated raw model text. On a retry we
        // append what failed last time so the model corrects it instead of
        // rolling the same dice again.
        const draftOnce = async (correction?: string): Promise<string> => {
          let fullContent = "";
          let thinkingEmitted = false;
          resetStallTimeout();
          const promptForAttempt = correction
            ? `${blogPrompt}\n\nIMPORTANT — your previous draft was rejected by automated quality validation for: ${correction}. Fix these problems in this draft. Remember: output ONLY the single valid JSON object.`
            : blogPrompt;
          const claudeStream = anthropic.messages.stream({
            model: claudeModel,
            max_tokens: 32000,
            thinking: { type: "enabled", budget_tokens: 8000 },
            messages: [{ role: "user", content: promptForAttempt }],
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
          return fullContent;
        };

        // Parse + recover + sanitize one raw draft into shippable content.
        const buildFinal = async (fullContent: string) => {
          let blogData = parseGeneratedBlogJson(fullContent, entry, project, research);
          // Cheap recovery: if the body leaked the JSON envelope, pull the real
          // contentMarkdown out instead of discarding an otherwise-good draft.
          if (looksLikeRawJsonEnvelope(blogData.content)) {
            const recovered =
              recoverContentFromEnvelope(blogData.content) ?? recoverContentFromEnvelope(fullContent);
            if (recovered) {
              blogData = { ...blogData, content: recovered, word_count: countWords(recovered) };
            }
          }
          let rawContent = insertBlogImagePlaceholders(blogData.content, {
            title: blogData.title,
            targetKeyword: entry.focus_keyword,
            wordCount: blogData.word_count,
          });

          const sanitized = await sanitizeBlogContent(rawContent, { ownDomain: project.domain ?? "" });
          const finalContent = sanitizeBlogMarkdown(sanitized.content);
          // Clamp the meta description to Google's usable window (and derive
          // one from the intro if the model returned nothing usable) so a bad
          // meta never ships.
          const { normalizeMetaDescription } = await import("@/lib/blog-markdown-polish");
          blogData = { ...blogData, meta_description: normalizeMetaDescription(blogData.meta_description, finalContent) };
          return { blogData, sanitized, finalContent };
        };

        let built: Awaited<ReturnType<typeof buildFinal>> | null = null;
        let lastValidation: ReturnType<typeof validateGeneratedContent> | null = null;

        for (let attempt = 1; attempt <= MAX_GEN_ATTEMPTS; attempt++) {
          emit({
            event: "stage",
            stage: "draft",
            detail: attempt === 1
              ? "Claude is thinking and drafting your blog post…"
              : `Re-drafting (attempt ${attempt}/${MAX_GEN_ATTEMPTS}) to fix a malformed draft…`,
          });
          wasStalled = false;
          const fullContent = await draftOnce(
            attempt > 1 && lastValidation ? summarizeValidation(lastValidation) : undefined
          );

          emit({ event: "stage", stage: "polish", detail: "Generating images and running SEO polish…" });
          const candidate = await buildFinal(fullContent);

          const verdict = validateGeneratedContent(candidate.finalContent, {
            type: "blog",
            metaDescription: candidate.blogData.meta_description,
            focusKeyword: entry.focus_keyword,
          });
          lastValidation = verdict;

          if (verdict.ok) {
            built = candidate;
            break;
          }

          console.warn(`[blog stream] draft attempt ${attempt} failed validation: ${summarizeValidation(verdict)}`);
          if (attempt < MAX_GEN_ATTEMPTS) {
            emit({ event: "stage", stage: "revalidate", detail: "Draft failed quality checks — regenerating a clean version…" });
          }
        }

        // Quality gate: never persist a broken draft. Reset the entry and ask the
        // client to retry instead of saving raw JSON the viewer can't render.
        if (!built) {
          if (body.entryId) {
            try {
              await supabaseAdmin.from("calendar_entries").update({ status: "scheduled" }).eq("id", body.entryId);
            } catch { /* best effort */ }
          }
          emit({
            event: "error",
            message: `The draft failed quality validation (${lastValidation?.fatalCodes.join(", ") || "unknown"}). No broken content was saved — please generate again.`,
          });
          controller.close();
          return;
        }

        let { blogData, sanitized, finalContent } = built;
        let coverImageUrl: string | null = null;
        const imageCredits: import("@/lib/images/image-search").ImageCredit[] = [];

        // Source copyright-safe images (Openverse/Wikimedia/Pexels), convert to
        // webp, and record attribution — run ONCE on the final approved content.
        if (body.useRealImages) {
          emit({ event: "stage", stage: "polish", detail: "Sourcing and uploading licensed images…" });
          const { searchLicensedImages } = await import("@/lib/images/image-search");
          const { fetchConvertAndUploadImage } = await import("@/lib/server/blog-images");
          const imgBlogId = projectId || body.entryId || "unknown";

          const usedSourceUrls = new Set<string>();

          // Tries each candidate image until one fetches+converts+uploads cleanly.
          // Records the license/attribution of whichever candidate succeeded.
          const uploadFirstWorking = async (
            candidates: import("@/lib/images/image-search").LicensedImage[],
            placement: "cover" | "section"
          ): Promise<string | null> => {
            for (const img of candidates) {
              const key = img.imageUrl.split("?")[0].toLowerCase();
              if (usedSourceUrls.has(key)) continue;
              const uploaded = await fetchConvertAndUploadImage(img.imageUrl, imgBlogId);
              if (uploaded) {
                usedSourceUrls.add(key);
                imageCredits.push({
                  storedUrl: uploaded.publicUrl,
                  author: img.author,
                  license: img.license,
                  licenseUrl: img.licenseUrl,
                  sourcePage: img.sourcePage,
                  provider: img.provider,
                  placement,
                });
                return uploaded.publicUrl;
              }
            }
            return null;
          };

          // 1. Cover image — search on the focus keyword (concise), with the
          // article title as a secondary fallback. The old `keyword + full title`
          // query was too specific and returned nothing from the CC catalogs.
          try {
            const images = await searchLicensedImages(entry.focus_keyword, 6, {
              fallbackQuery: blogData.title,
            });
            coverImageUrl = await uploadFirstWorking(images, "cover");
          } catch (err) {
            console.error("[blog-stream] Failed to fetch cover image", err);
          }

          // 2. Section placeholders
          const placeholderRegex = /!\[([^\]]+)\]\((https:\/\/placehold\.co\/[^\)]+)\)/g;
          let match;
          const matches: Array<{ full: string; alt: string }> = [];
          while ((match = placeholderRegex.exec(finalContent)) !== null) {
            matches.push({ full: match[0], alt: match[1] });
          }

          for (const item of matches) {
            try {
              // Search the section heading, falling back to the focus keyword so
              // a niche heading still gets a relevant on-topic photo.
              const images = await searchLicensedImages(item.alt, 6, {
                fallbackQuery: entry.focus_keyword,
              });
              const uploadedUrl = await uploadFirstWorking(images, "section");
              if (uploadedUrl) {
                finalContent = finalContent.replace(item.full, `![${item.alt}](${uploadedUrl})`);
              }
            } catch (err) {
              console.error(`[blog-stream] Failed to fetch section image for "${item.alt}"`, err);
            }
          }
        }

        // No visible "Image credits" block: `searchLicensedImages` only ever
        // returns CC0 / public-domain / Pexels-License images (see
        // image-search.ts), none of which require a displayed attribution, so
        // there is nothing that legally needs to be shown. `imageCredits` is
        // still persisted below (content_data) as an internal sourcing record.

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
          // Full arrays (no cap) — these must mirror the links actually
          // present in the content so the previewer sidebar always matches.
          external_links: sanitized.externalLinks,
          internal_links: sanitized.internalLinks,
          source_url: "",
          repair_notes: [] as string[],
          updated_at: new Date().toISOString(),
          content_data: {
            ...(coverImageUrl ? { cover_image_url: coverImageUrl } : {}),
            ...(imageCredits.length ? { image_credits: imageCredits } : {}),
          },
        };

        // When the keyword was changed from what was scheduled, the generated
        // blog is standalone — don't link it to the original calendar entry.
        const linkedEntryId = keywordChanged ? null : (body.entryId ?? null);

        let blogId: string;
        if (linkedEntryId) {
          const { data: existing } = await supabaseAdmin
            .from("blogs").select("id").eq("entry_id", linkedEntryId).maybeSingle();

          if (existing) {
            const { data, error } = await supabaseAdmin
              .from("blogs").update(upsertPayload).eq("id", existing.id).select("id").single();
            if (error) throw error;
            blogId = data.id;
          } else {
            const { data, error } = await supabaseAdmin
              .from("blogs").insert({ ...upsertPayload, entry_id: linkedEntryId, project_id: projectId })
              .select("id").single();
            if (error) throw error;
            blogId = data.id;
          }

          await supabaseAdmin
            .from("calendar_entries").update({ status: "generated", title: blogData.title })
            .eq("id", linkedEntryId);
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
        if (body.entryId && !keywordChanged) {
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
    .replace(/<!--\s*Schema:\s*[\s\S]*?-->/gi, "")
    .replace(/!\[[^\]]*\]\(\s*IMAGE_PLACEHOLDER\s*\)\s*\n?/gi, "")
    .replace(/Image placeholder missing a source\. Use edit mode to regenerate this image\./gi, "");

  const metaIdx = cleaned.indexOf("---META---");
  if (metaIdx !== -1) cleaned = cleaned.substring(0, metaIdx);

  return cleaned
    .replace(/^\s*"(?:external_links|internal_links|meta_description|slug|title|contentMarkdown)"\s*:\s*(?:\[.*?\]|"[^"]*")\s*,?\s*$/gm, "")
    .replace(/^\s*[{}]\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n").trim();
}
