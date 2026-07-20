/**
 * Rankshoot AI memory (server-only) — two layers.
 *
 * LAYER 1 — project_content_memory (user-owned, per project):
 *   Structured entries the AI accumulates as the user works: topics covered,
 *   style learnings, preferences, audience insights, workflow activity.
 *   Injected into every generation prompt so the agent "remembers" the project
 *   across keywords → calendar → blogs → audits. Fully visible and editable in
 *   project Settings. Deleting is REAL: a deleted entry is gone and is never
 *   used again; memory only returns as new entries accumulate from fresh work.
 *
 * LAYER 2 — global_style_heuristics (backend-only, admin-visible):
 *   Anonymized, style-only patterns that hold across ALL users ("question-led
 *   H2s get cited more"). NEVER contains business names, domains, products, or
 *   any tenant data — enforced by `isAnonymousHeuristic` before insert, using
 *   the project's own identifying strings as a blocklist. Read into prompts as
 *   light guidance; shown only in the admin "AI Memory" tab.
 *
 * Cost design: memory extraction runs on Gemini Flash directly (cheapest text
 * model in the stack; the provider logs usage + cost via recordAiCall), is
 * fire-and-forget (never blocks or fails a generation), and is capped to one
 * small call per blog.
 */

import { supabaseAdmin } from '@/lib/supabase';

export const MEMORY_KINDS = [
  'topic_covered',
  'style',
  'preference',
  'audience_insight',
  'activity',
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export interface ProjectMemoryEntry {
  id: string;
  project_id: string;
  kind: MemoryKind | string;
  content: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface GlobalHeuristicRow {
  id: string;
  heuristic: string;
  category: string;
  evidence_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

/** Max entries kept per project — oldest are trimmed beyond this. */
const PROJECT_MEMORY_CAP = 40;
/** Max heuristics injected into a prompt. */
const GLOBAL_HEURISTICS_PROMPT_CAP = 6;
/** Max memory entries injected into a prompt. */
const PROJECT_MEMORY_PROMPT_CAP = 24;
/** Model for memory extraction — cheapest capable text model in the stack. */
const MEMORY_MODEL = 'gemini-2.5-flash';

// ── Layer 1: read ─────────────────────────────────────────────────────────────

/** Loads a project's memory entries, newest first. Best-effort: [] on error. */
export async function loadProjectMemory(
  projectId: string,
  limit = PROJECT_MEMORY_CAP
): Promise<ProjectMemoryEntry[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('project_content_memory')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as ProjectMemoryEntry[];
  } catch {
    return [];
  }
}

const KIND_LABELS: Record<string, string> = {
  topic_covered: 'Topics already covered (do not repeat the same angle)',
  style: 'Writing style learnings for this project',
  preference: 'User preferences (follow these)',
  audience_insight: 'Audience insights',
  activity: 'Recent project activity',
};

/**
 * Formats memory entries into a prompt block. Returns "" when there is no
 * memory, so callers can omit the block entirely.
 */
export function formatProjectMemoryForPrompt(entries: ProjectMemoryEntry[]): string {
  if (!entries.length) return '';
  const capped = entries.slice(0, PROJECT_MEMORY_PROMPT_CAP);

  const byKind = new Map<string, string[]>();
  for (const e of capped) {
    const content = e.content?.trim();
    if (!content) continue;
    const list = byKind.get(e.kind) ?? [];
    list.push(content);
    byKind.set(e.kind, list);
  }
  if (!byKind.size) return '';

  const sections = [...byKind.entries()]
    .map(([kind, items]) => `${KIND_LABELS[kind] ?? kind}:\n${items.map((c) => `- ${c}`).join('\n')}`)
    .join('\n\n');

  return `\nPROJECT MEMORY (what this project's AI has learned from previous work here — honor preferences, avoid repeating covered angles, and keep the voice consistent with what worked):\n${sections}\n`;
}

// ── Layer 1: write (fire-and-forget learning after a blog) ───────────────────

export interface MemoryUpdateInput {
  projectId: string;
  userId: string;
  focusKeyword: string;
  title: string;
  /** Archetype label when known (e.g. "How-to / process guide"). */
  archetype?: string;
  /** The generated article markdown (truncated internally). */
  blogMarkdown: string;
  source?: 'blog_generate' | 'repair' | 'audit';
}

/**
 * Learns from a just-generated blog: records the covered topic and asks Gemini
 * Flash for at most 2 short, NEW memory entries (style/audience/preference)
 * worth keeping. Never throws; designed to run inside `after(...)` so it can't
 * slow down or fail a generation. Also feeds the anonymized global layer.
 */
export async function updateProjectMemoryAfterBlog(input: MemoryUpdateInput): Promise<void> {
  const { projectId, userId, focusKeyword, title } = input;
  if (!projectId || !focusKeyword) return;

  try {
    // 1. Deterministic entry: the topic is now covered. No LLM cost.
    const topicEntry = `"${focusKeyword}" — ${title}${input.archetype ? ` (${input.archetype})` : ''}`;
    const rows: Array<{ kind: string; content: string }> = [
      { kind: 'topic_covered', content: topicEntry },
    ];

    // 2. LLM pass (cheap Flash): extract up to 2 genuinely reusable PROJECT
    //    learnings AND, optionally, ONE fully-anonymized GLOBAL style pattern.
    //    Both come from the same single call to keep cost at one Flash request
    //    per blog. Existing memory is provided so the model only adds NEW info.
    try {
      const existing = await loadProjectMemory(projectId, 20);
      const existingBlock = existing.length
        ? existing.map((e) => `- [${e.kind}] ${e.content}`).join('\n')
        : '(none yet)';

      const prompt = `You maintain a small long-term memory for an AI content writer working on one client project. A new article was just written.

TASK 1 — PROJECT MEMORY: Extract AT MOST 2 short, durable learnings worth remembering for FUTURE articles on this project — a style observation, an audience insight, or an implied preference. Only include a learning if it is genuinely new versus the existing memory below and will still be useful months from now. If nothing new is worth keeping, return an empty list.

TASK 2 — GLOBAL PATTERN (optional): If this article demonstrates ONE general writing/structure pattern that would help ANY business blog (nothing about this company, its industry, products, audience, or topic — pure craft, e.g. "Opening a comparison section with a one-line verdict makes the table beneath it scannable"), return it. It must contain zero identifying or topical detail. Otherwise return null.

EXISTING MEMORY:
${existingBlock}

NEW ARTICLE (keyword: "${focusKeyword}", title: "${title}"${input.archetype ? `, shape: ${input.archetype}` : ''}):
${input.blogMarkdown.slice(0, 6000)}

Return ONLY JSON: {"entries":[{"kind":"style|preference|audience_insight","content":"<one sentence, max 25 words>"}],"globalPattern":{"category":"structure|style|seo|aeo|geo","heuristic":"<one sentence, max 30 words>"} or null}`;

      const { GeminiProvider } = await import('@/services/ai/providers');
      const gemini = new GeminiProvider();
      const res = await gemini.generate(MEMORY_MODEL, prompt, {
        temperature: 0.2,
        maxOutputTokens: 500,
        jsonMode: true,
        retries: 1,
        timeoutMs: 20_000,
      });

      const parsed = JSON.parse(res.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as {
        entries?: Array<{ kind?: string; content?: string }>;
        globalPattern?: { category?: string; heuristic?: string } | null;
      };
      for (const e of (parsed.entries ?? []).slice(0, 2)) {
        const content = e.content?.trim();
        const kind = e.kind?.trim() || 'style';
        if (!content || content.length < 12) continue;
        if (!MEMORY_KINDS.includes(kind as MemoryKind)) continue;
        rows.push({ kind, content });
      }

      // Global layer: hard anonymization gate using the project's own
      // identifying strings as the blocklist — the privacy boundary between
      // tenant memory and the shared layer.
      const gp = parsed.globalPattern;
      if (gp?.heuristic) {
        const { data: proj } = await supabaseAdmin
          .from('projects')
          .select('company, domain, niche, name, target_audience')
          .eq('id', projectId)
          .maybeSingle();
        const identifiers = [
          proj?.company,
          proj?.domain,
          proj?.niche,
          proj?.name,
          proj?.target_audience,
          focusKeyword,
          title,
        ].filter((s): s is string => typeof s === 'string' && s.length > 0);
        await recordGlobalHeuristic(gp.heuristic, gp.category ?? 'style', identifiers);
      }
    } catch (e) {
      // Learning pass is optional — the deterministic topic entry still lands.
      console.warn('[ai-memory] learning extraction failed, keeping topic entry only:', e);
    }

    // 3. Persist + trim to cap.
    const { error } = await supabaseAdmin.from('project_content_memory').insert(
      rows.map((r) => ({
        project_id: projectId,
        user_id: userId,
        kind: r.kind,
        content: r.content,
        source: input.source ?? 'blog_generate',
      }))
    );
    if (error) {
      console.warn('[ai-memory] insert failed:', error.message);
      return;
    }
    await trimProjectMemory(projectId);
  } catch (e) {
    console.warn('[ai-memory] updateProjectMemoryAfterBlog failed:', e);
  }
}

/** Deletes the oldest entries beyond the per-project cap. */
async function trimProjectMemory(projectId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('project_content_memory')
      .select('id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    const ids = (data ?? []).map((r) => r.id as string);
    if (ids.length <= PROJECT_MEMORY_CAP) return;
    const excess = ids.slice(PROJECT_MEMORY_CAP);
    await supabaseAdmin.from('project_content_memory').delete().in('id', excess);
  } catch {
    /* best-effort */
  }
}

// ── Layer 2: global heuristics ────────────────────────────────────────────────

/** Loads active global heuristics for prompt injection. Best-effort: []. */
export async function loadGlobalHeuristics(
  limit = GLOBAL_HEURISTICS_PROMPT_CAP
): Promise<string[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('global_style_heuristics')
      .select('heuristic')
      .eq('status', 'active')
      .order('evidence_count', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []).map((r) => String(r.heuristic)).filter(Boolean);
  } catch {
    return [];
  }
}

/** Formats global heuristics as a light guidance block ("" when empty). */
export function formatGlobalHeuristicsForPrompt(heuristics: string[]): string {
  if (!heuristics.length) return '';
  return `\nLEARNED WRITING GUIDANCE (patterns that consistently perform well — apply where they fit, never mechanically):\n${heuristics
    .slice(0, GLOBAL_HEURISTICS_PROMPT_CAP)
    .map((h) => `- ${h}`)
    .join('\n')}\n`;
}

/**
 * Anonymization guard for the global layer. A heuristic is only allowed when
 * it contains NO tenant-identifying strings: no URLs, no email-ish tokens, and
 * none of the project's own identifying words (company, domain, niche,
 * audience, product terms). This is the hard privacy boundary between layers.
 */
export function isAnonymousHeuristic(
  heuristic: string,
  identifiers: string[]
): boolean {
  const h = heuristic.toLowerCase();
  if (!h.trim() || h.length > 240) return false;
  if (/https?:\/\/|www\.|@|\.com|\.io|\.co\b/.test(h)) return false;
  for (const raw of identifiers) {
    const id = raw?.toLowerCase().trim();
    if (!id || id.length < 4) continue;
    // Check the full identifier and its distinctive tokens.
    if (h.includes(id)) return false;
    for (const token of id.split(/[\s./-]+/)) {
      if (token.length >= 5 && h.includes(token)) return false;
    }
  }
  return true;
}

const HEURISTIC_CATEGORIES = new Set(['structure', 'style', 'seo', 'aeo', 'geo']);

/**
 * Records an anonymized global heuristic (or bumps its evidence count when the
 * same pattern is re-observed). `identifiers` must include every tenant string
 * that must not leak (company, domain, niche, products…). Silently drops
 * anything that fails the anonymization guard. Never throws.
 */
export async function recordGlobalHeuristic(
  heuristic: string,
  category: string,
  identifiers: string[]
): Promise<void> {
  try {
    const text = heuristic.trim();
    if (!isAnonymousHeuristic(text, identifiers)) return;
    const cat = HEURISTIC_CATEGORIES.has(category) ? category : 'style';

    // Bump evidence when the exact pattern already exists (unique on lower(heuristic)).
    const { data: existing } = await supabaseAdmin
      .from('global_style_heuristics')
      .select('id, evidence_count')
      .ilike('heuristic', text)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('global_style_heuristics')
        .update({
          evidence_count: (existing.evidence_count as number) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      return;
    }

    await supabaseAdmin
      .from('global_style_heuristics')
      .insert({ heuristic: text, category: cat });
  } catch (e) {
    console.warn('[ai-memory] recordGlobalHeuristic failed:', e);
  }
}
