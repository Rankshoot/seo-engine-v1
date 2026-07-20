# Rankshoot v1.4.0 — Release Notes

**Release date:** 2026-07-20
**Scope:** 33 commits · 137 files · +12,408 / −3,749

---

## 1. Client-facing summary (safe to share)

Our biggest update yet. Highlights:

- **Content Audit Studio (new).** Audit any published blog by URL or pasted content and get SEO / AI-search (GEO) / answer-engine (AEO) / quality / keyword / freshness scores plus the specific issues to fix. Run a free, no-credit **whole-site scan** to prioritise, then a **deep audit** on the weak pages, and **one-click "Generate Enhanced"** to produce an improved, ready-to-rank rewrite. Schedule enhancements to the calendar and export a PDF report.
- **Background generation + notifications.** Blogs generate on the server, so they finish even if you refresh or close the tab. Queue several at once, watch them fill in live on Content History, and get an in-app + optional desktop/browser notification when each is ready.
- **More human, more search-ready articles.** Natural phrasing that's harder for AI detectors to flag, answer-first intros, FAQs, credible primary-source citations, internal links, and no stray em-dashes or formatting artifacts.
- **Images.** Real licensed images + AI-generated fallbacks, delivered as fast WebP; correct WordPress cover images.
- **Keyword Discovery.** Incremental AI scoring (scores appear as they compute), clearer difficulty labels, faster bulk scheduling.
- **Editing & UX.** Reworked Ask-AI editing, in-place selection rewrites, multiple topic ideas, auto-saved forms, and no more hard refreshes.

Full client changelog: see `CHANGELOG.md` (v1.4).

---

## 2. Technical highlights (internal)

**Durable background jobs**
- Generic `background_jobs` queue with atomic claim, idempotency keys, in-process `after()` dispatch + cron-drain backstop, and resumable-after-refresh polling.
- Job types: `blog_generate`, `content_audit`, `site_audit_scan`.
- Blog generation core extracted to `src/lib/blog-generation/generate-blog.ts`; SSE route retained as an optional "watch live" path.

**Notifications**
- Source-agnostic Redux `notifications` slice + notification center bell.
- `TaskNotificationWatcher` — one poll loop / one query drives notifications for all job types (config-driven per type); site-scan chunks aggregated into one notification.
- VAPID Web Push (service worker `public/sw.js`, `push_subscriptions` table); OS push while a tab is open, server push when closed.

**Content Audit Studio**
- Two audit tiers sharing one `blog_audits` table: `quick` (LLM-free deterministic scan, whole-site) and `deep` (full LLM + DataForSEO + competitor scrape). A quick row upgrades to deep in place; a scan never downgrades a deep row.
- Enhanced-blog generation runs as a durable `blog_generate` job stamped with the audit URL; shared Redux "generating" state keeps the full-audit view and history rows in lock-step.
- Enhance quality: repair prompt now runs in FULL-ENHANCEMENT mode via a `contentAnalysisBundle` carrying the audit's quality rubric, so generation is held to the same criteria the audit scores on.

**Output hygiene (all generation paths, via `polishBlogMarkdown` in `sanitizeBlogContent`)**
- Strips heading `{#anchor}` attribute lists, inline tables of contents, leaked prompt tokens, and converts em/en-dashes to natural punctuation.
- Tolerant `---META---` split (anchors on the meta JSON) so the separator/metadata can't leak into the article body.
- Instruction-leak guard on meta descriptions.

**Other**
- Server-side pagination on audit history; content-history live "Generating…" rows.
- Form-draft persistence (`formDrafts` slice + `useFormDraft`); position-matched skeletons via `DataRegion`.
- Licensed image search + AI image generation + WebP uploads; project-scoped AI style-memory heuristics; incremental keyword AI scoring.

---

## 3. Deploy checklist ⚠️

**Run these new Supabase migrations (idempotent, safe on existing projects):**

- `supabase-migration-push-subscriptions.sql`
- `supabase-migration-ai-memory.sql`
- `supabase-migration-keyword-ai-scoring-runs.sql`
- (plus any earlier migrations not yet applied — see `supabase-schema.sql`)

**Environment variables (set in prod):**

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — required for Web Push (Web Push needs HTTPS in prod; localhost is fine for dev).
- Optional: `INTERNAL_BASE_URL` / `INTERNAL_JOBS_SECRET` for an external job-worker dispatch (otherwise the in-process `after()` + cron drain handles it).

**Verify after deploy:**
- `npm run build` is clean.
- A blog generation completes end-to-end and fires a notification.
- A single-URL content audit completes and a whole-site scan drains.

**Breaking changes:** none.

---

## 4. Known follow-ups

- Whitepaper / ebook / LinkedIn generators still use awaited server actions (not durable jobs) — candidates for the durable-job rail next.
- Enhanced-blog quality currently reuses deep-audit competitor data rather than re-scraping the live top-5 at enhance time.
