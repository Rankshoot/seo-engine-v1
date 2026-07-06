/**
 * Perplexity follow-up questions for blog generation (server-only).
 *
 * When a user searches a keyword on Perplexity, the answer ends with a
 * "Follow-ups" list — the questions real searchers ask next. Baking the top
 * follow-ups into a blog as question-phrased H2 sections (with snippet-style
 * answers) is one of the highest-leverage AEO moves available, because those
 * are literally the queries answer engines are already routing.
 *
 * Design constraints (production):
 *   - NEVER blocks or fails generation: every path degrades to `[]` or to the
 *     Serper People-Also-Ask fallback. A missing key, a timeout, an API shape
 *     change — the blog still generates.
 *   - Bounded latency: single request, hard timeout, no retries (generation
 *     already has its own long-running budget; a follow-up fetch is garnish).
 *   - Deduped + sanitized output: trimmed, question-cased, capped.
 *
 * Env:
 *   PERPLEXITY_API_KEY   — required for live follow-ups (fallback used if absent)
 *   PERPLEXITY_MODEL     — optional, defaults to "sonar"
 */

import { recordPerplexityCall } from '@/lib/admin/logging/record-provider-call';

const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const DEFAULT_TIMEOUT_MS = 12_000;

export interface FollowUpOptions {
  /** Max questions returned. Product spec: top 3. */
  limit?: number;
  timeoutMs?: number;
}

/** Normalize one candidate question: trim, strip list markers/quotes, ensure "?" */
function normalizeQuestion(raw: string): string | null {
  let q = (raw ?? '')
    .replace(/^[\s>*•·\-\d.)(]+/, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (q.length < 8 || q.length > 160) return null;
  // Reject anything that isn't a question-shaped phrase (statements, URLs, JSON noise).
  if (/https?:\/\//i.test(q) || /[{}[\]"]/.test(q)) return null;
  if (!q.endsWith('?')) q += '?';
  return q.charAt(0).toUpperCase() + q.slice(1);
}

function dedupeQuestions(questions: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of questions) {
    if (!raw) continue;
    const q = normalizeQuestion(raw);
    if (!q) continue;
    const key = q.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= limit) break;
  }
  return out;
}

/** Best-effort extraction of a JSON string array from a model reply. */
function parseQuestionsFromText(text: string): string[] {
  if (!text) return [];
  const arrayMatch = text.match(/\[[\s\S]*?\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      /* fall through to line parsing */
    }
  }
  // Fallback: one question per line.
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && /\?\s*$/.test(l));
}

/**
 * Fetch the top follow-up questions Perplexity surfaces for a keyword.
 * Returns `[]` on ANY failure — callers must treat this as best-effort.
 */
export async function fetchPerplexityFollowUps(
  keyword: string,
  opts: FollowUpOptions = {}
): Promise<string[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  const kw = keyword?.trim();
  if (!apiKey || !kw) return [];

  const limit = opts.limit ?? 3;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const model = process.env.PERPLEXITY_MODEL?.trim() || 'sonar';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const res = await fetch(PERPLEXITY_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        // Ask the question a real searcher would ask so the related-questions
        // engine has natural intent to work with.
        messages: [
          {
            role: 'user',
            content: `What should I know about ${kw}?`,
          },
        ],
        max_tokens: 300,
        temperature: 0.2,
        // First-class API feature: Perplexity returns the same follow-up
        // questions its product UI shows, in `related_questions`.
        return_related_questions: true,
      }),
    });

    if (!res.ok) {
      recordPerplexityCall('chat_completions', false, Date.now() - started, `HTTP ${res.status}`);
      return [];
    }

    const json = (await res.json()) as {
      related_questions?: unknown;
      choices?: Array<{ message?: { content?: string } }>;
    };
    recordPerplexityCall('chat_completions', true, Date.now() - started);

    // Primary: the structured related_questions field.
    const related = Array.isArray(json.related_questions)
      ? json.related_questions.filter((x): x is string => typeof x === 'string')
      : [];
    let questions = dedupeQuestions(related, limit);

    // Secondary: some models omit related_questions — mine the answer text.
    if (questions.length < limit) {
      const content = json.choices?.[0]?.message?.content ?? '';
      questions = dedupeQuestions([...questions, ...parseQuestionsFromText(content)], limit);
    }

    return questions;
  } catch (e) {
    recordPerplexityCall(
      'chat_completions',
      false,
      Date.now() - started,
      e instanceof Error ? e.message : String(e)
    );
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pure merge: keep Perplexity questions first, top up from People-Also-Ask,
 * dedupe near-identical phrasings, cap at `limit`.
 */
export function mergeFollowUpQuestions(
  primary: string[],
  peopleAlsoAsk: Array<{ question: string }> | null | undefined,
  limit = 3
): string[] {
  const paa = (peopleAlsoAsk ?? []).map(q => q.question);
  return dedupeQuestions([...primary, ...paa], limit);
}

/**
 * Resolve the follow-up questions to bake into a blog: Perplexity first,
 * topped up from People-Also-Ask when Perplexity returns fewer than `limit`
 * (no key configured, timeout, thin topic). Always resolves; never throws.
 */
export async function resolveFollowUpQuestions(
  keyword: string,
  peopleAlsoAsk?: Array<{ question: string }> | null,
  opts: FollowUpOptions = {}
): Promise<string[]> {
  const limit = opts.limit ?? 3;
  let questions: string[] = [];
  try {
    questions = await fetchPerplexityFollowUps(keyword, { ...opts, limit });
  } catch {
    questions = []; // fetchPerplexityFollowUps never throws, but belt-and-braces
  }
  if (questions.length >= limit) return questions;
  return mergeFollowUpQuestions(questions, peopleAlsoAsk, limit);
}
