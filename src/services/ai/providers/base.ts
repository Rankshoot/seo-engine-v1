import { z } from "zod";

export interface TokenUsage {
  input: number;
  output: number;
  cachedRead?: number;
  cachedWrite?: number;
}

export interface ProviderResponse {
  text: string;
  usage: TokenUsage;
  latencyMs: number;
  model: string;
  provider: string;
}

export interface StructuredResponse<T> extends ProviderResponse {
  data: T;
}

export interface CallOptions {
  temperature?: number;
  maxOutputTokens?: number;
  useGoogleSearch?: boolean;
  jsonMode?: boolean;
  responseSchema?: Record<string, unknown>;
  zodSchema?: z.ZodType<any>;
  topP?: number;
  retries?: number;
  systemPrompt?: string;
  /** Custom flag for cache controls on Claude. */
  cachePrompt?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface AIProvider {
  id: "gemini" | "claude";
  
  generate(
    model: string,
    prompt: string,
    opts?: CallOptions
  ): Promise<ProviderResponse>;
  
  stream(
    model: string,
    prompt: string,
    opts?: CallOptions
  ): AsyncGenerator<string, ProviderResponse>;
  
  generateStructured<T>(
    model: string,
    prompt: string,
    schema: z.ZodType<T>,
    opts?: CallOptions
  ): Promise<StructuredResponse<T>>;
  
  estimateCost(model: string, usage: TokenUsage): number;
}

/** Error thrown when a user or project exceeds their allocated monthly budget. */
export class BudgetExceededError extends Error {
  constructor(entity: "user" | "project" | "global", id: string, limit: number, spent: number) {
    super(`AI budget exceeded for ${entity} (${id}). Limit: $${limit.toFixed(2)}, Spent: $${spent.toFixed(2)}`);
    this.name = "BudgetExceededError";
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

  // Fallback: Try to repair truncated JSON by backtracking from the end
  const maxBacktrack = Math.min(cleaned.length, 2000);
  const startLen = cleaned.length;
  
  for (let i = 0; i < maxBacktrack; i++) {
    const len = startLen - i;
    const candidate = cleaned.slice(0, len);
    
    let stack: string[] = [];
    let inString = false;
    let escape = false;
    
    for (let j = 0; j < candidate.length; j++) {
      const c = candidate[j];
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
      if (c === '{' || c === '[') {
        stack.push(c);
      } else if (c === '}') {
        if (stack[stack.length - 1] === '{') stack.pop();
      } else if (c === ']') {
        if (stack[stack.length - 1] === '[') stack.pop();
      }
    }
    
    let closed = candidate;
    if (inString) {
      if (closed.endsWith('\\')) {
        closed = closed.slice(0, -1);
      }
      closed += '"';
    }
    
    for (let j = stack.length - 1; j >= 0; j--) {
      closed += stack[j] === '{' ? '}' : ']';
    }
    
    try {
      return JSON.parse(closed) as T;
    } catch {
      // Continue backtracking
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

