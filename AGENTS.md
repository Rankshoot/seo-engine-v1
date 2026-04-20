<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:product-pillars -->
# SEO Engine — product pillars (do not forget these)

We are a **traffic-generation content platform**. The user enters their company, domain, niche, audience, region, and competitors, and we must deliver ranked content that drives real organic traffic to _their_ domain. Every design, prompt, heuristic, and third-party API call must be justifiable against that one metric.

## What the app must do, in order
1. **Understand the business** — scrape the user's own domain (home, about, products/services, sitemap) + competitor homepages. Cache as a `project_briefs` row (JSON). Never trust the raw niche string alone; the brief is the source of truth for seeds, tone, products, entities, and internal-link candidates.
2. **Discover real demand** — DataForSEO `keyword_ideas/live` seeded from the brief (not template strings). Every keyword is classified **TOFU / MOFU / BOFU** using intent + lexical rules. Off-topic ideas are filtered out via embedding similarity against the brief.
3. **Produce content** — phase 1 is **blogs**. Architecture must leave room for eBooks, whitepapers, journals, LinkedIn and Instagram without reshaping the data model. Treat the output table as "content assets" with a `type` field, even though blogs ship first.
4. **Optimize for GEO + SEO** — in 2026 AI Overviews appear on the majority of queries. Every generated asset must:
   - Put a direct answer in the first 80 words.
   - Use modular H2/H3 sections (RAG-friendly).
   - Include a `FAQPage` + `Article` JSON-LD schema block.
   - Cite real sources with inline external links.
   - Add 2–4 natural internal links from the brief's `internal_link_candidates`.
   - Avoid filler phrases ("in today's world", "in recent years") and keyword stuffing.

## Hard rules for every change
- **Never re-introduce placeholder metrics.** Volume, KD, CPC, trend must always come from a real API (DataForSEO today).
- **Do not run scraping/LLM calls inline without caching.** Scrape once per project into `project_briefs`, surface a "Refresh brief" button for manual invalidation.
- **All server actions that hit paid APIs must return a trace the client can `console.log`** (see the `discoveryTrace` pattern in `keyword-actions.ts`). This is how we debug in production.
- **When adding columns, write both** the change to `supabase-schema.sql` _and_ a standalone `supabase-migration-*.sql` idempotent script that existing projects can run safely.
- **Keep phases separate.** Never ship phase N+1 before phase N is verified by the user.

## Vendors in use (2026)
- Scraping: **Jina Reader** (`r.jina.ai/<url>`) — free, markdown output, zero auth. Firecrawl is the paid upgrade if full-site crawl is ever needed.
- Keyword data: **DataForSEO Labs** `keyword_ideas/live`.
- SERP + PAA + competitor gaps: **Serper**.
- LLM (content + brief extraction): **Gemini** (`gemini-flash-latest`).
- Embeddings (relevance filter): **Gemini** `text-embedding-004`.

## Funnel classification (deterministic, no extra API cost)
- **BOFU** if `intent = transactional` OR keyword matches `\b(buy|price|pricing|cost|deal|discount|demo|free trial|sign up|signup|download)\b` OR brand-navigational.
- **MOFU** if `intent = commercial` OR keyword matches `\b(best|top|vs|review|alternative|alternatives|compare|comparison|rating)\b`.
- **TOFU** if `intent = informational` AND/OR matches `^(how|what|why|when|guide|tutorial|ideas|examples|tips)\b`.
- Default fallback: TOFU.

## What "done" looks like for each feature
A change is not done until:
1. `npm run build` is clean.
2. `ReadLints` returns no new errors.
3. A standalone Supabase migration script exists for any schema change.
4. The keywords page (or relevant UI) reflects the new data end-to-end.

## Content Health audit (phase 3 — shipped)
Flow: `src/app/projects/[id]/audit/page.tsx` → `audit-actions.ts` → `content-audit.ts`.
- Every URL is **pre-flighted** (HEAD/GET). 404 / 410 / 5xx / redirect-to-homepage short-circuit into a dedicated broken-URL audit row — we do NOT spend LLM tokens on dead pages.
- The LLM prompt **audits the blog on its own merits** — we do NOT diff it against the brief. Issues are categorized (`technical | seo | content | keyword_demand | ux`), each has `label / detail / why_it_matters / fix / impact`, all in plain non-technical language.
- DataForSEO `keyword_overview/live` (`fetchKeywordVitals` in `dataforseo.ts`) is called after the LLM to attach current monthly volume + trend to the audit's primary keyword, so we can tell the user "this keyword is still trending" vs "demand is dying".
- Audits run in batches of 10 (`auditExistingBlogs({ limit: 10 })`) with `Clear all` + `Re-audit 10` controls always visible. Stale audit rows are purged on every run if the URL is no longer content or no longer in the sitemap.

## Blog repair (phase 4 — shipped)
Flow: audit card → `repair-actions.ts#repairBlogFromAudit` → `gemini.ts#repairBlogPost` → new `calendar_entries` row (`article_type='Repair'`) + `blogs` row (`article_type='Repair'`, `source_url=<original>`).
- Server action re-scrapes the live page via Jina before calling the LLM so the rewrite sees current content, not the stale snapshot stored on the audit row.
- The internal link pool is built from `analysis.internal_link_opportunities` ∪ `brief.internal_link_candidates` ∪ `brief.blog_urls`, deduped, with the source URL excluded. LLM is instructed to use ≥2 verbatim.
- Topic, voice, and audience MUST stay the same — this is a repair, not a pivot. The brief is injected as **tone context only**.
- Blog viewer (`src/app/projects/[id]/blogs/[blogId]/page.tsx`) shows a "Repair draft" banner when `article_type='Repair'` and `source_url` is set, linking back to `/audit`.
- Schema change: `blogs.source_url TEXT DEFAULT ''` — migration at `supabase-migration-blog-source-url.sql`.
<!-- END:product-pillars -->
