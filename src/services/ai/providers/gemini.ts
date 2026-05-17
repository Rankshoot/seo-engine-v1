/**
 * Gemini provider abstraction (May 2026).
 *
 * Two model tiers:
 *
 *   geminiPro   — `gemini-2.5-pro` for long-form generation, deep reasoning,
 *                 research synthesis, ebook + whitepaper drafting.
 *   geminiFlash — `gemini-2.5-flash` for lightweight assistant calls, instant
 *                 suggestions, classification, JSON-shape responses.
 *
 * The legacy `geminiGenerate` in `src/lib/gemini.ts` (gemini-flash-latest)
 * stays in place for the existing blog pipeline so phase 5 ships without
 * regressions; new content types use the providers below.
 */

import {
  extractGeminiTokenUsage,
  recordGeminiCall,
} from '@/lib/admin/logging/record-provider-call';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const POLLINATIONS_CHAT_URL = 'https://gen.pollinations.ai/v1/chat/completions';

type GeminiModelId = 'gemini-2.5-pro' | 'gemini-2.5-flash';

export interface GeminiCallOptions {
  /** 0–1 sampling temperature. Long-form ≈ 0.65–0.85; classification ≈ 0.2. */
  temperature?: number;
  /** Hard cap on output tokens. Pro supports very long contexts; default 16k. */
  maxOutputTokens?: number;
  /** Enable Google Search grounding (live citations + URL discovery). */
  useGoogleSearch?: boolean;
  /** Force JSON output. Pair with `responseSchema` for structured tools. */
  jsonMode?: boolean;
  /** Optional `responseSchema` payload (Gemini schema dialect). */
  responseSchema?: Record<string, unknown>;
  /** Top-p nucleus sampling. */
  topP?: number;
  /** Number of times to retry on transient/429 errors. */
  retries?: number;
}

interface GeminiInternal extends GeminiCallOptions {
  model: GeminiModelId;
  prompt: string;
}

/** Long-form, premium reasoning. Use for ebook chapters, whitepaper synthesis, audits. */
export function geminiPro(prompt: string, opts: GeminiCallOptions = {}): Promise<string> {
  return geminiCall({
    model: 'gemini-2.5-pro',
    prompt,
    temperature: opts.temperature ?? 0.78,
    maxOutputTokens: opts.maxOutputTokens ?? 16384,
    useGoogleSearch: opts.useGoogleSearch ?? false,
    jsonMode: opts.jsonMode ?? false,
    responseSchema: opts.responseSchema,
    topP: opts.topP,
    retries: opts.retries ?? 3,
  });
}

/** Lightweight, low-latency. Use for suggestions, classification, JSON outputs. */
export function geminiFlash(prompt: string, opts: GeminiCallOptions = {}): Promise<string> {
  return geminiCall({
    model: 'gemini-2.5-flash',
    prompt,
    temperature: opts.temperature ?? 0.6,
    maxOutputTokens: opts.maxOutputTokens ?? 4096,
    useGoogleSearch: opts.useGoogleSearch ?? false,
    jsonMode: opts.jsonMode ?? false,
    responseSchema: opts.responseSchema,
    topP: opts.topP,
    retries: opts.retries ?? 3,
  });
}

async function geminiCall(opts: GeminiInternal): Promise<string> {
  const { assertProviderEnabled } = await import('@/lib/admin/platform-settings-runtime');
  await assertProviderEnabled('gemini');

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const retries = Math.max(1, opts.retries ?? 3);
  const url = `${GEMINI_BASE}/${opts.model}:generateContent`;

  /**
   * Single network try. `withSchema=false` is used for retry-without-schema
   * after a 400 (some Gemini snapshots reject responseSchema for Flash).
   */
  const tryOnce = async (withSchema: boolean): Promise<string> => {
    const started = Date.now();
    const generationConfig: Record<string, unknown> = {
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
    };
    if (opts.topP !== undefined) generationConfig.topP = opts.topP;
    if (opts.jsonMode) generationConfig.responseMimeType = 'application/json';
    if (withSchema && opts.responseSchema) generationConfig.responseSchema = opts.responseSchema;

    const body: Record<string, unknown> = {
      contents: [{ parts: [{ text: opts.prompt }] }],
      generationConfig,
    };
    if (opts.useGoogleSearch) {
      body.tools = [{ googleSearch: {} }];
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 400 && withSchema && opts.responseSchema) {
      const errText = await res.text();
      console.warn(
        `[gemini] ${opts.model} rejected responseSchema; retrying without it.`,
        errText.slice(0, 200),
      );
      return tryOnce(false);
    }

    if (res.status === 429) {
      // JSON-mode callers expect strict JSON; the Pollinations fallback
      // returns narrative text and would corrupt the contract. Surface
      // rate-limit errors so the caller can choose whether to retry,
      // wait, or fall back to a different model tier.
      if (opts.jsonMode) {
        recordGeminiCall({
          model: opts.model,
          prompt: opts.prompt,
          ok: false,
          latencyMs: Date.now() - started,
          errorMessage: 'rate_limited_json_mode',
          featureSuffix: 'rate_limit',
        });
        throw new Error(`Gemini ${opts.model} rate-limited (JSON mode — no Pollinations fallback)`);
      }
      const fallback = await pollinationsFallback(opts.prompt, opts.temperature ?? 0.6);
      if (fallback) {
        recordGeminiCall({
          model: process.env.POLLINATIONS_TEXT_MODEL || 'pollinations/gemini-fast',
          prompt: opts.prompt,
          response: fallback,
          ok: true,
          latencyMs: Date.now() - started,
          featureSuffix: 'pollinations_fallback',
        });
        return fallback;
      }
      recordGeminiCall({
        model: opts.model,
        prompt: opts.prompt,
        ok: false,
        latencyMs: Date.now() - started,
        errorMessage: 'rate_limited_no_fallback',
      });
      throw new Error('Gemini rate-limited and Pollinations fallback unavailable');
    }

    if (!res.ok) {
      const err = await res.text();
      recordGeminiCall({
        model: opts.model,
        prompt: opts.prompt,
        ok: false,
        latencyMs: Date.now() - started,
        errorMessage: `${res.status}: ${err.slice(0, 200)}`,
      });
      throw new Error(`Gemini ${res.status}: ${err.slice(0, 400)}`);
    }

    const json = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      promptFeedback?: { blockReason?: string };
      usageMetadata?: Record<string, unknown>;
    };
    const cand = json.candidates?.[0];
    const text = cand?.content?.parts?.[0]?.text;
    if (!text) {
      const blockReason = json.promptFeedback?.blockReason;
      const reason = cand?.finishReason ?? blockReason ?? 'EMPTY';
      recordGeminiCall({
        model: opts.model,
        prompt: opts.prompt,
        ok: false,
        latencyMs: Date.now() - started,
        errorMessage: String(reason),
      });
      if (typeof reason === 'string' && reason.includes('SAFETY')) {
        throw new Error('Gemini blocked the response (safety filter).');
      }
      throw new Error(`Gemini returned empty output (${reason})`);
    }
    const usage = extractGeminiTokenUsage(json);
    recordGeminiCall({
      model: opts.model,
      prompt: opts.prompt,
      response: text,
      tokensInput: usage.tokensInput,
      tokensOutput: usage.tokensOutput,
      ok: true,
      latencyMs: Date.now() - started,
    });
    return text;
  };

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await tryOnce(Boolean(opts.responseSchema));
    } catch (e) {
      if (attempt === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  throw new Error(`Gemini ${opts.model} failed after ${retries} retries`);
}

async function pollinationsFallback(prompt: string, temperature = 0.7): Promise<string | null> {
  const apiKey = process.env.POLLINATIONS_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(POLLINATIONS_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.POLLINATIONS_TEXT_MODEL || 'gemini-fast',
        messages: [{ role: 'user', content: prompt }],
        temperature,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? text : null;
  } catch {
    return null;
  }
}

/**
 * Strip code fences, leading "json", and trailing commas from a JSON-ish blob.
 * Returns the parsed object/array or `null` if it cannot be recovered.
 *
 * Handles the common ways an LLM mangles JSON:
 *   • UTF-8 BOM, NBSP, smart quotes around keys/values
 *   • Markdown fences (```json … ```)
 *   • Trailing commas before } or ]
 *   • Narrative prefix/suffix ("Sure! Here's …")
 *   • Truncated tail (best-effort balance reconstruction)
 */
export function parseLooseJson<T>(raw: string): T | null {
  if (!raw) return null;

  // Normalise whitespace + smart quotes → straight quotes; strip BOM/NBSP.
  let cleaned = raw
    .replace(/^\uFEFF/, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .trim();

  const fence = /^```(?:json)?\s*([\s\S]*?)```\s*$/im.exec(cleaned);
  if (fence) cleaned = fence[1].trim();
  cleaned = cleaned.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  const attempts: string[] = [cleaned, cleaned.replace(/,\s*([}\]])/g, '$1')];
  const balanced = extractBalancedObject(cleaned);
  if (balanced) attempts.push(balanced, balanced.replace(/,\s*([}\]])/g, '$1'));

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Extract the longest balanced `{…}` or `[…]` substring. Tolerates JSON
 * appearing inside a sentence ("Here is the JSON: { … }").
 */
function extractBalancedObject(input: string): string | null {
  const startIdx = input.search(/[\[{]/);
  if (startIdx === -1) return null;
  const open = input[startIdx];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < input.length; i++) {
    const c = input[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return input.slice(startIdx, i + 1);
    }
  }
  return null;
}
