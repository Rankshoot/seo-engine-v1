import { supabaseAdmin } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import { buildBlogPrompt } from "@/lib/prompts/blog-prompt";

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  return new Anthropic({ apiKey, maxRetries: 5 });
}

export interface BlogGenerationParams {
  /** Clerk user id — owns the project and is billed for quota. */
  userId: string;
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
}

export type BlogGenProgress =
  | { event: "stage"; stage: string; detail?: string }
  | { event: "thinking"; chunk: string }
  | { event: "thinking_done" };

export interface BlogGenerationOptions {
  /** Progress sink — SSE route forwards these as events; the job ignores them. */
  onProgress?: (e: BlogGenProgress) => void;
  /** Client/request abort signal — aborts the Claude draft if the caller cares. */
  signal?: AbortSignal;
}

/**
 * Core blog-generation pipeline. Extracted from the SSE route so it runs with
 * identical behavior in two contexts:
 *   • the streaming route — `onProgress` forwards SSE events, `signal` is the
 *     client request (a disconnect aborts the draft);
 *   • the durable `blog_generate` background job — no client, survives refresh.
 *
 * Resolves with the saved blog id, or throws with a user-facing message on
 * failure (the calendar entry, if any, is reset to "scheduled" first).
 */
export async function runBlogGeneration(
  params: BlogGenerationParams,
  opts: BlogGenerationOptions = {},
): Promise<{ blogId: string }> {
  const { onProgress, signal } = opts;
  // Progress sink. `done`/`error` are NOT emitted here — success returns the id
  // and failure throws — so this only ever forwards stage/thinking updates.
  const emit = (payload: BlogGenProgress) => onProgress?.(payload);

  if (!params.entryId && (!params.projectId || !params.keyword)) {
    throw new Error("Expected entryId OR { projectId, keyword }");
  }

  let wasStalled = false;
  let stallTimeoutId: NodeJS.Timeout | undefined;
  // True when the user changed the keyword from what was scheduled.
  // When set, the generated blog is treated as standalone — the original
  // calendar entry is left completely untouched (stays "scheduled" for its
  // original keyword). The blog is NOT linked back to it via entry_id.
  let keywordChanged = false;

      try {
        // ── Stage 1: Load context ─────────────────────────────────────────
        emit({ event: "stage", stage: "context", detail: "Loading project brief…" });

        let project: any = null;
        let brief: any = null;
        let entry: any = null;
        let projectId = "";

        if (params.entryId) {
          const { data: entryRow, error: eErr } = await supabaseAdmin
            .from("calendar_entries").select("*").eq("id", params.entryId).single();

          if (eErr || !entryRow) {
            throw new Error("Calendar entry not found");
          }
          entry = entryRow;
          projectId = entry.project_id;

          // The generator form pre-fills from this calendar entry, but the user
          // may have edited the keyword/topic/secondary keywords before hitting
          // Generate. Apply form values to the local entry object so generation
          // uses them, then decide what to persist back.
          const editedKeyword = params.keyword?.trim();
          const originalKeyword = entry.focus_keyword as string;
          keywordChanged = Boolean(editedKeyword && editedKeyword !== originalKeyword);

          // Always apply all form values to the local entry so the prompt is correct.
          if (editedKeyword) entry.focus_keyword = editedKeyword;
          const editedTopic = params.topic?.trim();
          const originalTitle = entry.title as string;
          if (editedTopic) entry.title = editedTopic;
          if (params.secondaryKeywords?.length) entry.secondary_keywords = params.secondaryKeywords;

          if (keywordChanged) {
            // Keyword was changed: leave the original calendar slot completely
            // untouched. The blog will be saved as a standalone piece with no
            // entry_id — the original scheduled keyword remains pending.
          } else {
            // Keyword unchanged: sync any other form edits back and mark generating.
            const entryUpdates: Record<string, unknown> = { status: "generating" };
            if (editedTopic && editedTopic !== originalTitle) entryUpdates.title = editedTopic;
            if (params.secondaryKeywords && JSON.stringify(params.secondaryKeywords) !== JSON.stringify(entryRow.secondary_keywords ?? []))
              entryUpdates.secondary_keywords = params.secondaryKeywords;
            await supabaseAdmin.from("calendar_entries").update(entryUpdates).eq("id", params.entryId);
          }
        } else {
          projectId = params.projectId!;
          const kw = params.keyword!;
          entry = {
            focus_keyword: kw,
            title: params.topic || kw,
            article_type: "Blog Post",
            secondary_keywords: params.secondaryKeywords || [],
            content_health_audit: params.contentHealthAudit || null,
            slug: kw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80),
          };
        }

        const { data: projectRow, error: pErr } = await supabaseAdmin
          .from("projects").select("*").eq("id", projectId).eq("user_id", params.userId).single();

        if (pErr || !projectRow) {
          throw new Error("Project not found or unauthorized");
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
        const auditData = params.contentHealthAudit || (entry ? (entry as any).content_health_audit : null);
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
              await supabaseAdmin.from("calendar_entries").update({ status: "scheduled" }).eq("id", params.entryId);
              throw new Error("Could not read the original article content to enhance. Re-run the audit and try again.");
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
                // What the top-5 ranking blogs do better — so the enhanced
                // version is built to beat them, not just fix its own issues.
                competitorInsights: (analysis.competitor_insights ?? []).map((c: any) => ({
                  url: c.url,
                  advantages: c.advantages ?? [],
                })),
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

            // ── Verify the enhancement actually beat the original + competitors ──
            // Deterministic, no extra cost: confirm the flagged structural issues
            // are resolved and the piece is now at least as deep as the top-5
            // benchmark. The result is stored in repair_notes so the user sees
            // exactly what was fixed and whether it out-covers the competitors.
            const finalWords = countWords(finalContent);
            const compWordCounts: number[] = (analysis.competitor_insights ?? [])
              .map((c: any) => Number(c.word_count) || 0)
              .filter((n: number) => n > 0);
            const benchmarkWords = compWordCounts.length ? Math.max(...compWordCounts) : 0;
            const checks = {
              hasFaq: /^##+\s*(faqs?|frequently asked)/im.test(finalContent),
              hasAnswerFirst: finalContent.replace(/^#.*$/m, "").trim().slice(0, 400).length > 120,
              h2Count: (finalContent.match(/^##\s+/gm) ?? []).length,
              externalLinks: sanitized.externalLinks.length,
              internalLinks: sanitized.internalLinks.length,
              beatsCompetitorDepth: benchmarkWords === 0 || finalWords >= benchmarkWords * 0.95,
            };
            const verification = [
              `Enhanced to ${finalWords} words${benchmarkWords ? ` (top-5 benchmark ~${benchmarkWords})` : ""}.`,
              `FAQ section: ${checks.hasFaq ? "present" : "still missing"}.`,
              `${checks.h2Count} H2 sections · ${checks.externalLinks} external citations · ${checks.internalLinks} internal links.`,
              checks.beatsCompetitorDepth
                ? "Depth matches or exceeds the top-ranking blogs."
                : "Still thinner than the top-ranking blogs — consider expanding further.",
            ];
            emit({ event: "stage", stage: "verify", detail: verification[0] });

            const { normalizeMetaDescription: normalizeRepairMeta } = await import("@/lib/blog-markdown-polish");
            const repairPayload = {
              title: repaired.title,
              content: finalContent,
              meta_description: normalizeRepairMeta(repaired.meta_description || analysis.summary, finalContent),
              slug: repaired.slug,
              word_count: finalWords,
              target_keyword: entry.focus_keyword,
              article_type: "Repair",
              status: "generated" as const,
              research_sources: repaired.research_sources,
              // Full arrays (no cap) — these must mirror the links actually
              // present in the content so the previewer sidebar always matches.
              external_links: sanitized.externalLinks,
              internal_links: sanitized.internalLinks,
              source_url: repairPlan.url,
              repair_notes: [...(repaired.repair_notes ?? []), ...verification],
              updated_at: new Date().toISOString(),
            };

            let existingRepair = null;
            if (params.entryId) {
              const { data } = await supabaseAdmin
                .from("blogs").select("id").eq("entry_id", params.entryId).maybeSingle();
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
                .from("blogs").insert({ ...repairPayload, entry_id: params.entryId || null, project_id: projectId })
                .select("id").single();
              if (error) throw error;
              repairBlogId = data.id;
            }

            if (params.entryId) {
              await supabaseAdmin
                .from("calendar_entries").update({ status: "generated", title: repaired.title })
                .eq("id", params.entryId);
            }

            return { blogId: repairBlogId };
          }
        }

        // ── Stage 2: Research ─────────────────────────────────────────────
        emit({ event: "stage", stage: "research", detail: "Gathering live SERP research and keyword context…" });

        const { researchKeyword } = await import("@/lib/research");
        const { fetchPerplexityFollowUps, mergeFollowUpQuestions } = await import("@/lib/perplexity");
        const { researchCredibleSources } = await import("@/lib/deep-research");
        const {
          loadProjectMemory,
          formatProjectMemoryForPrompt,
          loadGlobalHeuristics,
          formatGlobalHeuristicsForPrompt,
        } = await import("@/lib/ai-memory");

        // SERP research, Perplexity follow-ups, the deep-research pass, and the
        // Rankshoot AI memory load run in parallel — all are best-effort and
        // none may block generation.
        let research: any = null;
        let verifiedSources: import("@/lib/deep-research").DeepResearchResult | null = null;
        const [researchSettled, followUpsSettled, deepResearchSettled, memorySettled, heuristicsSettled] = await Promise.allSettled([
          researchKeyword(entry.focus_keyword, project.target_region, project.target_language),
          fetchPerplexityFollowUps(entry.focus_keyword, { limit: 3 }),
          researchCredibleSources(entry.focus_keyword),
          loadProjectMemory(projectId),
          loadGlobalHeuristics(),
        ]);

        // Project memory + global heuristics → prompt blocks ("" when empty).
        const projectMemoryBlock = memorySettled.status === "fulfilled"
          ? formatProjectMemoryForPrompt(memorySettled.value)
          : "";
        const globalHeuristicsBlock = heuristicsSettled.status === "fulfilled"
          ? formatGlobalHeuristicsForPrompt(heuristicsSettled.value)
          : "";
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
            .neq("entry_id", params.entryId || "")
            // Newest first so the internal-link pool favours the latest posts.
            .order("created_at", { ascending: false })
            .limit(15);
          existingBlogs = blogs ?? [];
        } catch { /* optional */ }

        // ── Deep analysis stages (if requested) ──────────────────────────
        let deepAnalysisSummary: string | undefined;

        if (params.useDeepAnalysis && params.deepAnalysisPages && params.deepAnalysisPages.length > 0) {
          const { QuotaService } = await import("@/services/quota");

          // Check credit before doing work
          const quotaStatus = await QuotaService.getUserQuotaStatus(params.userId);
          if (quotaStatus.deep_analysis.remaining <= 0) {
            throw new Error("No Deep Analysis credits remaining.");
          }

          // Scrape stage
          emit({ event: "stage", stage: "deep_scrape", detail: "Scraping competitor pages…" });

          const { readUrlViaJinaReader } = await import("@/lib/jina");
          const scrapedPages: Array<{ title: string; url: string; content: string }> = [];

          for (const page of params.deepAnalysisPages) {
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
          await QuotaService.deductQuota(params.userId, "deep_analysis", 1);
        }

        // ── Stage 3: Outline ──────────────────────────────────────────────
        emit({ event: "stage", stage: "outline", detail: "Building SEO structure and topical outline…" });

        let mergedWriterNotes = "";
        if (params.entryId) {
          const { formatContentHealthAuditForWriter } = await import("@/lib/content-health-calendar");
          const contentHealthRaw = (entry as any).content_health_audit;
          const auditWriterBlock = formatContentHealthAuditForWriter(contentHealthRaw);
          // Live form edits (audience/tone/goal/CTA/secondary keywords) made in the
          // generator review step — not just whatever was stored when the entry
          // was first scheduled.
          const liveNotesBlock = (params.audience || params.tone || params.goal || params.ctaObjective || params.secondaryKeywords?.length)
            ? `Audience: ${params.audience || ""}\nTone: ${params.tone || ""}\nGoal: ${params.goal || ""}\nCTA: ${params.ctaObjective || ""}\nSecondary Keywords: ${(params.secondaryKeywords || []).join(", ")}`
            : "";
          mergedWriterNotes = [params.writerNotes?.trim(), liveNotesBlock, auditWriterBlock || ""]
            .filter(Boolean).join("\n\n---\n\n");
        } else {
          mergedWriterNotes = `Audience: ${params.audience || ""}\nTone: ${params.tone || ""}\nGoal: ${params.goal || ""}\nCTA: ${params.ctaObjective || ""}\nSecondary Keywords: ${(params.secondaryKeywords || []).join(", ")}`;
          if (params.writerNotes) {
            mergedWriterNotes = `${params.writerNotes.trim()}\n\n---\n\n${mergedWriterNotes}`;
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
        if (params.useAhrefsData && (params.ahrefsH2s?.length || params.ahrefsFaqs?.length)) {
          ahrefsContext = {
            matchingTerms: [],
            questions: [],
            ideas: [],
            serp: [],
            secondaryKeywords: params.ahrefsH2s ?? [],
            faqKeywords: params.ahrefsFaqs ?? [],
          };

          // Deduct credits for the data that was used
          const { QuotaService } = await import("@/services/quota");
          if (params.ahrefsH2s?.length) await QuotaService.deductQuota(params.userId, "ahrefs_h2s", 1);
          if (params.ahrefsFaqs?.length) await QuotaService.deductQuota(params.userId, "ahrefs_faqs", 1);
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
          wordCount: params.wordCount ?? 2500,
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
          brandPersona: params.brandPersona,
          customInstructions: params.customInstructions,
          deepAnalysisSummary,
          projectMemoryBlock,
          globalHeuristicsBlock,
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
        if (signal) {
          signal.addEventListener("abort", () => abortController.abort());
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
          if (params.entryId) {
            try {
              await supabaseAdmin.from("calendar_entries").update({ status: "scheduled" }).eq("id", params.entryId);
            } catch { /* best effort */ }
          }
          throw new Error(
            `The draft failed quality validation (${lastValidation?.fatalCodes.join(", ") || "unknown"}). No broken content was saved — please generate again.`,
          );
        }

        const { blogData, sanitized, finalContent } = built;
        // Images are AI-generated only. The content keeps its AI-image
        // placeholders (inserted during buildFinal); the user generates on-brand
        // images per slot in the editor (Gemini/Imagen). Stock/SERP sourcing
        // (Openverse/Wikimedia/Pexels) was intentionally removed — those photos
        // were frequently irrelevant to the article.

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
          // No auto-sourced cover/credits — images are AI-generated in the editor,
          // which writes cover_image_url into content_data at that point.
          content_data: {},
        };

        // When the keyword was changed from what was scheduled, the generated
        // blog is standalone — don't link it to the original calendar entry.
        const linkedEntryId = keywordChanged ? null : (params.entryId ?? null);

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

        // Rankshoot AI memory: learn from this blog after we return — one cheap
        // Flash call recording the covered topic + any durable style/preference
        // learnings. Fire-and-forget via next's `after`; a failure here can
        // never affect the generation the user just received.
        try {
          const { after } = await import("next/server");
          const memoryInput = {
            projectId,
            userId: params.userId,
            focusKeyword: entry.focus_keyword as string,
            title: blogData.title as string,
            blogMarkdown: finalContent,
            source: "blog_generate" as const,
          };
          after(async () => {
            const { updateProjectMemoryAfterBlog } = await import("@/lib/ai-memory");
            await updateProjectMemoryAfterBlog(memoryInput);
          });
        } catch (memErr) {
          console.warn("[blog generate] memory learning scheduling failed:", memErr);
        }

        return { blogId };
      } catch (err: any) {
        let message = err instanceof Error ? err.message : "Generation failed";
        if (wasStalled || err?.name === "AbortError" || err?.name === "APIConnectionTimeoutError" || err?.message?.includes("aborted")) {
          message = "Gateway Timeout";
        }
        console.error("[blog generate] Error:", message);
        if (params.entryId && !keywordChanged) {
          try {
            await supabaseAdmin.from("calendar_entries").update({ status: "scheduled" }).eq("id", params.entryId);
          } catch { /* best effort */ }
        }
        throw new Error(message);
      } finally {
        if (stallTimeoutId) clearTimeout(stallTimeoutId);
      }
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
