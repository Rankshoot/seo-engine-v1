import { z } from "zod";
import { AIProvider, CallOptions, ProviderResponse, StructuredResponse, TokenUsage, parseLooseJson, PlatformAIError } from "../base";
import { recordAiCall } from "@/lib/admin/logging/record-provider-call";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const IN_RATES: Record<string, number> = {
  "gemini-2.5-flash": 0.075 / 1_000_000,
  "gemini-2.5-pro": 1.25 / 1_000_000,
  "gemini-flash-latest": 0.075 / 1_000_000,
};

const OUT_RATES: Record<string, number> = {
  "gemini-2.5-flash": 0.30 / 1_000_000,
  "gemini-2.5-pro": 10.00 / 1_000_000,
  "gemini-flash-latest": 0.30 / 1_000_000,
};

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";

  estimateCost(model: string, usage: TokenUsage): number {
    const key = model.toLowerCase();
    const inRate = IN_RATES[key] ?? Object.entries(IN_RATES).find(([k]) => key.includes(k))?.[1] ?? (0.075 / 1_000_000);
    const outRate = OUT_RATES[key] ?? Object.entries(OUT_RATES).find(([k]) => key.includes(k))?.[1] ?? (0.30 / 1_000_000);
    return usage.input * inRate + usage.output * outRate;
  }

  async generate(
    model: string,
    prompt: string,
    opts: CallOptions = {}
  ): Promise<ProviderResponse> {
    const { assertProviderEnabled } = await import("@/lib/admin/platform-settings-runtime");
    await assertProviderEnabled("gemini");

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const retries = Math.max(1, opts.retries ?? 3);
    const url = `${GEMINI_BASE}/${model}:generateContent`;

    const tryOnce = async (withSchema: boolean): Promise<ProviderResponse> => {
      const started = Date.now();
      const generationConfig: Record<string, unknown> = {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxOutputTokens,
      };

      if (opts.topP !== undefined) generationConfig.topP = opts.topP;
      if (opts.jsonMode) generationConfig.responseMimeType = "application/json";
      if (withSchema && opts.responseSchema) {
        generationConfig.responseSchema = opts.responseSchema;
      }

      const body: Record<string, unknown> = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      };

      if (opts.systemPrompt) {
        body.systemInstruction = {
          parts: [{ text: opts.systemPrompt }],
        };
      }

      if (opts.useGoogleSearch) {
        body.tools = [{ googleSearch: {} }];
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      });

      if (res.status === 400 && withSchema && opts.responseSchema) {
        console.warn(`[gemini] ${model} rejected responseSchema; retrying without it.`);
        return tryOnce(false);
      }

      if (!res.ok) {
        const err = await res.text();
        const latency = Date.now() - started;
        recordAiCall({
          provider: "gemini",
          model,
          prompt,
          ok: false,
          latencyMs: latency,
          errorMessage: `${res.status}: ${err.slice(0, 200)}`,
        });
        throw new Error(`Gemini ${res.status}: ${err.slice(0, 400)}`);
      }

      const json = await res.json();
      const cand = json.candidates?.[0];
      const text = cand?.content?.parts?.[0]?.text;

      if (!text) {
        const blockReason = json.promptFeedback?.blockReason;
        const reason = cand?.finishReason ?? blockReason ?? "EMPTY";
        const latency = Date.now() - started;
        recordAiCall({
          provider: "gemini",
          model,
          prompt,
          ok: false,
          latencyMs: latency,
          errorMessage: String(reason),
        });
        if (typeof reason === "string" && reason.includes("SAFETY")) {
          throw new Error("Gemini blocked the response due to safety filters.");
        }
        throw new Error(`Gemini returned empty output: ${reason}`);
      }

      // Extract usage metadata
      const usageMetadata = json.usageMetadata || {};
      const usage: TokenUsage = {
        input: usageMetadata.promptTokenCount ?? usageMetadata.prompt_token_count ?? 0,
        output: usageMetadata.candidatesTokenCount ?? usageMetadata.candidates_token_count ?? 0,
      };

      const latencyMs = Date.now() - started;
      const cost = this.estimateCost(model, usage);

      recordAiCall({
        provider: "gemini",
        model,
        prompt,
        response: text,
        tokensInput: usage.input,
        tokensOutput: usage.output,
        estimatedCostUsd: cost,
        ok: true,
        latencyMs,
      });

      return {
        text,
        usage,
        latencyMs,
        model,
        provider: "gemini",
      };
    };

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await tryOnce(Boolean(opts.responseSchema));
      } catch (e) {
        if (attempt === retries - 1) {
          console.error(`[gemini] API call failed on final attempt for model ${model}:`, e);
          throw new PlatformAIError("Content engine is busy, please try again.");
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
    throw new PlatformAIError("Content engine is busy, please try again.");
  }

  async *stream(
    model: string,
    prompt: string,
    opts: CallOptions = {}
  ): AsyncGenerator<string, ProviderResponse> {
    const { assertProviderEnabled } = await import("@/lib/admin/platform-settings-runtime");
    await assertProviderEnabled("gemini");

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const url = `${GEMINI_BASE}/${model}:streamGenerateContent`;
    const started = Date.now();

    try {
      const generationConfig: Record<string, unknown> = {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxOutputTokens,
      };
      if (opts.topP !== undefined) generationConfig.topP = opts.topP;
      if (opts.jsonMode) generationConfig.responseMimeType = "application/json";

      const body: Record<string, unknown> = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      };
      if (opts.systemPrompt) {
        body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
      }
      if (opts.useGoogleSearch) {
        body.tools = [{ googleSearch: {} }];
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini stream ${res.status}: ${err.slice(0, 400)}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Could not acquire reader for stream body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let tokenUsage: TokenUsage = { input: 0, output: 0 };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Parse chunks. Gemini SSE returns a JSON array of stream events or segments
        // depending on standard/non-standard headers.
        let jsonArrayMatch = buffer.match(/\[([\s\S]*?)\]/);
        if (jsonArrayMatch) {
          try {
            const parsed = JSON.parse(jsonArrayMatch[0]);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                const textChunk = item.candidates?.[0]?.content?.parts?.[0]?.text;
                if (textChunk) {
                  fullText += textChunk;
                  yield textChunk;
                }
                if (item.usageMetadata) {
                  const u = item.usageMetadata;
                  tokenUsage.input = u.promptTokenCount ?? u.prompt_token_count ?? tokenUsage.input;
                  tokenUsage.output = u.candidatesTokenCount ?? u.candidates_token_count ?? tokenUsage.output;
                }
              }
              buffer = buffer.slice(jsonArrayMatch.index! + jsonArrayMatch[0].length);
            }
          } catch {
            // Keep reading more chunks
          }
        } else {
          // Fallback: parse lines looking for individual JSON blocks
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed);
              const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (chunk) {
                fullText += chunk;
                yield chunk;
              }
              if (parsed.usageMetadata) {
                const u = parsed.usageMetadata;
                tokenUsage.input = u.promptTokenCount ?? u.prompt_token_count ?? tokenUsage.input;
                tokenUsage.output = u.candidatesTokenCount ?? u.candidates_token_count ?? tokenUsage.output;
              }
            } catch {
              // Partial JSON segment, continue
            }
          }
        }
      }

      const latencyMs = Date.now() - started;
      const cost = this.estimateCost(model, tokenUsage);

      recordAiCall({
        provider: "gemini",
        model,
        prompt,
        response: fullText,
        tokensInput: tokenUsage.input,
        tokensOutput: tokenUsage.output,
        estimatedCostUsd: cost,
        ok: true,
        latencyMs,
      });

      return {
        text: fullText,
        usage: tokenUsage,
        latencyMs,
        model,
        provider: "gemini",
      };
    } catch (e) {
      const latencyMs = Date.now() - started;
      recordAiCall({
        provider: "gemini",
        model,
        prompt,
        ok: false,
        latencyMs,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      console.error(`[gemini] Streaming API call failed for model ${model}:`, e);
      throw new PlatformAIError("Content engine is busy, please try again.");
    }
  }

  async generateStructured<T>(
    model: string,
    prompt: string,
    schema: z.ZodType<T>,
    opts: CallOptions = {}
  ): Promise<StructuredResponse<T>> {
    try {
      const res = await this.generate(model, prompt, {
        ...opts,
        jsonMode: true,
      });

      const parsed = parseLooseJson<T>(res.text);
      if (!parsed) {
        throw new Error(`Failed to parse response as loose JSON. Raw output: ${res.text}`);
      }

      const validation = schema.safeParse(parsed);
      if (!validation.success) {
        throw new Error(
          `Zod schema validation failed: ${validation.error.message}\nRaw JSON: ${JSON.stringify(
            parsed,
            null,
            2
          )}`
        );
      }

      return {
        ...res,
        data: validation.data,
      };
    } catch (e) {
      if (e instanceof PlatformAIError) throw e;
      console.error(`[gemini] Structured API call failed for model ${model}:`, e);
      throw new PlatformAIError("Content engine is busy, please try again.");
    }
  }
}
