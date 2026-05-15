/**
 * AI provider barrel.
 *
 * Centralized so feature code never imports an LLM URL directly. Today both
 * tiers go through Gemini (2.5 Pro for long-form, 2.5 Flash for lightweight);
 * adding Anthropic / OpenAI / OpenRouter only requires registering them here.
 */

export { geminiPro, geminiFlash, parseLooseJson } from './gemini';
export type { GeminiCallOptions } from './gemini';
