# SEO Engine — Product Overview & Use Cases

**Version:** 1.3.0  
**Last Updated:** 2026-07-15  
**Status:** Production-level tool

---

## Executive Summary

**SEO Engine** (aka Rankshoot) is a **traffic-generation content platform** that helps businesses and digital marketers create, optimize, and publish SEO-friendly content at scale. The platform transforms keyword research, content creation, and performance auditing into a single, automated workflow.

**The core promise:** Enter your company, domain, niche, audience, region, and competitors → receive ranked content that drives real organic traffic to your domain.

---

## Primary Use Case

### Target Users
- **B2B SaaS companies** needing consistent, organic lead generation
- **Digital agencies** managing content for multiple clients
- **Content marketers** scaling content production without hiring
- **SEO professionals** optimizing content performance across portfolios

### The User Journey

```
1. Create Project
   ↓
2. Brief Analysis (your domain + competitors)
   ↓
3. Keyword Discovery (data-driven keyword ideas)
   ↓
4. Content Generation (blogs, ebooks, whitepapers, LinkedIn posts)
   ↓
5. Content Calendar (schedule & organize output)
   ↓
6. Publishing (WordPress, Shopify, or manual)
   ↓
7. Content Audit (track performance & identify gaps)
   ↓
8. Content Repair (fix underperforming content)
```

---

## Core Features (Current)

### 1. **Project Setup & Brief Analysis**
- User provides: company name, domain, niche, audience, region, competitors
- System scrapes user's own domain (home, about, products/services, sitemap)
- System scrapes competitor homepages
- **Output:** `project_briefs` JSON cached in database
  - Seeds (brand entities, products)
  - Tone & voice
  - Internal-link candidates
  - Topic entities
- **Why it matters:** The brief is the source of truth for all downstream operations (keyword seeding, tone consistency, internal linking)

### 2. **Keyword Discovery**
- **Input:** Project brief
- **API:** DataForSEO `keyword_ideas/live`
- **Processing:**
  - Seed keywords from brief (not templates)
  - Fetch live keyword ideas with volume, KD (keyword difficulty), CPC, trend
  - Classify by funnel stage: **TOFU** (awareness) / **MOFU** (consideration) / **BOFU** (decision)
  - Filter off-topic ideas via embedding similarity against brief
- **Output:** Ranked keyword table with:
  - Monthly volume
  - Keyword difficulty
  - CPC
  - Trend
  - Funnel classification
  - Status (draft / approved / scheduled / generated)
- **Key rule:** Never use placeholder metrics; always fetch from real APIs

### 3. **Content Generation**
**Phase 1 (Shipped):** Blogs  
**Future phases:** Ebooks, Whitepapers, LinkedIn posts, Instagram content

#### Blog Generation Process
1. **Input:** Keyword + Brief
2. **LLM Call:** Gemini (`gemini-flash-latest`)
3. **Constraints:**
   - Direct answer in first 80 words (AI Overviews optimization)
   - Modular H2/H3 sections (RAG-friendly)
   - `FAQPage` + `Article` JSON-LD schema
   - Cite real sources with inline external links
   - 2–4 natural internal links from brief's `internal_link_candidates`
   - No filler phrases ("in today's world", "in recent years")
   - No keyword stuffing
4. **Output:**
   - Blog markdown
   - Metadata (primary keyword, target funnel stage, entities)
   - Internal link map
   - Schema blocks
   - Optional: AI-generated cover image

#### Image Generation
- Real images via Google Search (Serper)
- Automatic placeholder generation during stream processing
- Cover image uploaded to WordPress on publish

### 4. **Content Calendar**
- **Visual:** Calendar grid with content cards
- **Features:**
  - Schedule multiple content pieces per day
  - View content type at a glance (Blog / Ebook / Whitepaper / LinkedIn)
  - Drag-to-reschedule with instant updates
  - Busy-day indicator (dots under dates)
  - Quick "+Add" button on hover
- **Connected to:** Keyword discovery (generate directly from calendar)
- **Why it matters:** Enforces sustainable, plannable content pipelines

### 5. **Content Audit Studio**
- **Input:** Any blog/article URL or pasted draft
- **Process:**
  1. **Pre-flight check:** HEAD/GET request to verify URL
     - 404 / 410 / 5xx / homepage-redirect → skip LLM, log as broken
  2. **LLM audit:** Evaluate on own merits (NOT diffed against brief)
     - Categories: `technical | seo | content | keyword_demand | ux`
     - Each issue includes: label, detail, why_it_matters, fix, impact
     - Plain non-technical language
  3. **Keyword vitals:** DataForSEO `keyword_overview/live` (after LLM)
     - Attach monthly volume + trend to primary keyword
     - Show if keyword is still trending or demand is dying
  4. **Batch processing:** 10 URLs at a time
- **Outputs:**
  - Audit report (exportable)
  - Repair recommendations
  - Performance comparison (vs competitors)
- **Why it matters:** Identifies existing content gaps and optimization opportunities

### 6. **Content Repair**
- **Input:** Audit findings + original blog URL
- **Process:**
  1. Re-scrape live page via Jina (for current content)
  2. LLM repair call (Gemini) with:
     - Audit findings as context
     - Internal link pool (opportunities + brief candidates + existing blogs)
     - Instruction: ≥2 internal links verbatim
     - **Constraint:** Topic, voice, audience stay the same
  3. Create new row: `calendar_entries` + `blogs` with `article_type='Repair'`
  4. UI shows "Repair draft" banner linking back to audit
- **Why it matters:** Amplifies value of existing content without full rewrite

### 7. **Publishing**
- **Integrations:**
  - WordPress (direct API integration)
  - Shopify (e-commerce)
  - Manual export (Markdown, HTML, formatted doc)
- **Features:**
  - One-click publish
  - Schema blocks included
  - Image handling (cover + in-article)
  - Metadata synced (internal links, SEO tags)

---

## Architecture & Technical Principles

### Tech Stack
- **Frontend:** Next.js 16 (App Router), React 19, TailwindCSS 4
- **Backend:** Next.js Server Actions (no separate API)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Clerk
- **LLM:** Google Gemini (`gemini-flash-latest`, `text-embedding-004`)
- **External APIs:**
  - **DataForSEO Labs** → keyword volume, difficulty, trends
  - **Serper** → SERP results, PAA (People Also Ask), competitor gaps, images
  - **Jina Reader** → web scraping (markdown output)
  - **Google Search** → image search for cover images

### Directory Structure
```
src/
├── app/
│   ├── actions/          # Server actions (business logic)
│   │   ├── keyword-actions.ts
│   │   ├── blog-actions.ts
│   │   ├── content-actions.ts
│   │   ├── calendar-actions.ts
│   │   ├── audit-actions.ts
│   │   ├── repair-actions.ts
│   │   └── ...
│   ├── api/              # API routes (webhooks, integrations)
│   ├── projects/         # Project pages (UI)
│   ├── admin/            # Admin dashboard
│   └── pricing/          # Billing & plans
├── components/           # Reusable React components
├── lib/                  # Utilities & services
│   ├── ai/               # AI-related (Gemini, embeddings)
│   ├── scraping/         # Web scraping (Jina)
│   ├── keyword-research/ # DataForSEO integration
│   ├── supabase/         # Database queries & migrations
│   └── ...
├── services/             # External integrations
├── types/                # TypeScript types
└── constants/            # App constants
```

### Data Model (Supabase)

**Core Tables:**
- `projects` — user's project (domain, niche, region)
- `project_briefs` — cached brief (JSON: seeds, tone, internal links)
- `keywords` — discovered keywords (volume, KD, CPC, trend, funnel classification)
- `blogs` — generated or repaired blog content
- `calendar_entries` — scheduled content (date, type, linked keyword/blog)
- `content_audits` — audit results (URL, issues, recommendations)
- `publish_logs` — WordPress/Shopify publish history

---

## Hard Rules for Developers

### Rule 1: Never Re-introduce Placeholder Metrics
- Volume, KD (difficulty), CPC, trend **must always** come from a real API (DataForSEO)
- No hardcoded fallbacks like "volume: 0" or "kd: 'N/A'"
- If API is unavailable, show user a clear error, never fake data

### Rule 2: Cache Scraping & LLM Calls
- **Scrape once per project into `project_briefs`**
  - Never scrape the same domain twice in a flow
  - Provide a "Refresh brief" button for manual invalidation
- **LLM calls must be traceable**
  - Return a `trace` object the client can `console.log`
  - Example: `discoveryTrace` in `keyword-actions.ts`
  - This is how we debug in production

### Rule 3: All Schema Changes Include Migrations
- When adding columns: edit `supabase-schema.sql` AND create a standalone migration
- Migration files: `supabase-migration-*.sql` (idempotent, safe for existing projects)
- Example: `supabase-migration-blog-source-url.sql`

### Rule 4: Keep Phases Separate
- Never ship phase N+1 before phase N is verified
- Current phases:
  - ✅ Phase 1: Blogs (shipped, v1.0+)
  - ✅ Phase 2: Brief + Keywords (shipped, v1.0+)
  - ✅ Phase 3: Audit (shipped, v1.1+)
  - ✅ Phase 4: Repair (shipped, v1.1+)
  - ⏳ Phase 5: Ebooks, Whitepapers, LinkedIn (future)

### Rule 5: Content Must Optimize for AI Overviews
Every generated asset must:
1. Put a direct answer in the first 80 words
2. Use modular H2/H3 sections (RAG-friendly)
3. Include `FAQPage` + `Article` JSON-LD schema
4. Cite real sources with inline external links (not just at the end)
5. Add 2–4 natural internal links from brief's `internal_link_candidates`
6. Avoid filler phrases and keyword stuffing

### Rule 6: Treat the Audit as a Standalone Tool
- Audit the blog on its own merits (NOT diffed against brief)
- Issues are categorized and explained in plain non-technical language
- DataForSEO vitals are attached AFTER LLM to show current trends
- Pre-flight checks prevent wasted tokens on dead pages

### Rule 7: Funnel Classification Is Deterministic
No extra API calls needed. Apply rules in order:
```
BOFU if:
  intent = transactional
  OR keyword matches \b(buy|price|pricing|cost|deal|discount|demo|free trial|sign up|signup|download)\b
  OR brand-navigational

MOFU if:
  intent = commercial
  OR keyword matches \b(best|top|vs|review|alternative|alternatives|compare|comparison|rating)\b

TOFU otherwise (informational intent by default)
```

### Rule 8: Verify Before Shipping
A change is not done until:
1. `npm run build` is clean
2. `ReadLints` returns no new errors
3. A standalone Supabase migration exists (if schema changed)
4. The relevant UI reflects the new data end-to-end

---

## Key Metrics & Success Criteria

### For the User
- **Organic traffic growth** (primary success metric)
- **Keyword rankings** (position in SERPs)
- **Click-through rate** from search results
- **Content publication velocity** (posts/month)
- **Internal link click distribution** (user engagement)

### For the Platform
- **Brief quality** (how well we capture the business)
- **Keyword accuracy** (do our suggestions convert to traffic?)
- **Content quality** (audit scores, user satisfaction)
- **API cost efficiency** (don't waste tokens on bad data)
- **User retention** (monthly active projects)

---

## Design & UI Principles (Cohere 2026)

The product UI follows Cohere's **enterprise AI interface** design system:
- **Austere, white editorial space** with restrained product bands
- **Deep green-black sections** for product features
- **Rounded media cards** (8px–22px radius)
- **Pill CTAs** in near-black on light surfaces
- **Monumental display typography** with tight line height
- **Zero decorative chrome**; color arrives through photography, coral taxonomy chips, blue links

**For developers:** Consistency is critical. Review `/DESIGN.md` before adding UI, and stay within the established color, typography, and component library.

---

## Environment & Development

### Running Locally
```bash
npm run dev          # starts on http://localhost:3000
npm run build        # validates TypeScript + Next.js
npm run lint         # ESLint
```

### Required Environment Variables (`.env.local`)
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
DATAFORSEO_LOGIN=...
DATAFORSEO_PASSWORD=...
SERPER_API_KEY=...
```

### Critical Gotchas
- **Clerk key format is strict:** `pk_test_` + base64(`<domain>$`)
- **Node.js 22 LTS** required (use `nvm`)
- **`.env.local` is gitignored** — create it in each session
- **Middleware deprecation warning** in Next.js 16 is cosmetic (does not affect function)

---

## Future Roadmap (Conceptual)

### Phase 5: Content Diversification
- Ebooks (long-form, downloadable)
- Whitepapers (gated, lead-gen focused)
- LinkedIn posts (social-optimized, link to blogs)
- Instagram (short-form, visual)

### Phase 6: Advanced Optimization
- Competitor gap analysis (what are they ranking for, we're not?)
- Topic cluster mapping (auto-group keywords for pillar pages)
- E-E-A-T scoring (expertise, experience, authoritativeness, trustworthiness)

### Phase 7: Performance Feedback Loop
- GSC integration (search impressions, CTR, position trends)
- Automated content refresh (update date, citations, links)
- A/B testing framework (headline, CTA, internal link variations)

---

## Quick Reference: When to Use This Doc

**Before adding a feature:**
1. Does it align with "traffic-generation content platform"?
2. Have you read the hard rules for your change type?
3. Did you check the relevant phase (is it in roadmap or future)?

**Before shipping:**
1. Does the code follow the stated design principles?
2. Are API calls cached and traceable?
3. Is the new data real (not placeholder)?
4. Did you include a Supabase migration?
5. Does the UI reflect the new data end-to-end?

**Before editing a page/action:**
1. Which feature does it belong to? (brief, keywords, content, calendar, audit, repair)
2. What's the contract between frontend and backend?
3. What happens if an API fails?
4. Have you run `npm run build`?

---

## Related Documentation
- [`AGENTS.md`](./AGENTS.md) — detailed product pillars, vendor specs, "done" checklist
- [`DESIGN.md`](./DESIGN.md) — Cohere UI system, colors, typography, components
- [`CHANGELOG.md`](./CHANGELOG.md) — feature release history by version

---

**Last reviewed:** 2026-07-15  
**Maintainer:** Product & Engineering teams
