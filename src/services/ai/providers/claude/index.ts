import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AIProvider, CallOptions, ProviderResponse, StructuredResponse, TokenUsage } from "../base";
import { recordAiCall } from "@/lib/admin/logging/record-provider-call";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

// Cost structures (USD per 1M tokens) for Sonnet, Opus, and Haiku (supporting Claude 3/3.5/4/4.5)
const CLAUDE_RATES: Record<string, { inMiss: number; inHit: number; inWrite: number; out: number }> = {
  "sonnet-4-6": {
    inMiss: 3.00,
    inWrite: 3.75,
    inHit: 0.30,
    out: 15.00
  },
  "opus-4-8": {
    inMiss: 5.00,
    inWrite: 6.25,
    inHit: 0.50,
    out: 25.00
  },
  "haiku-4-5": {
    inMiss: 1.00,
    inWrite: 1.25,
    inHit: 0.10,
    out: 5.00
  },
  "claude-3-5-sonnet": {
    inMiss: 3.00,
    inWrite: 3.75,
    inHit: 0.30,
    out: 15.00
  },
  "claude-3-opus": {
    inMiss: 15.00,
    inWrite: 18.75,
    inHit: 1.50,
    out: 75.00
  },
  "claude-3-5-haiku": {
    inMiss: 0.80,
    inWrite: 1.00,
    inHit: 0.08,
    out: 4.00
  }
};

export class ClaudeProvider implements AIProvider {
  readonly id = "claude";
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      if (!ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
      }
      this.client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  estimateCost(model: string, usage: TokenUsage): number {
    const rates = this.getRates(model);
    const read = usage.cachedRead ?? 0;
    const write = usage.cachedWrite ?? 0;
    const miss = usage.input - read - write;

    return (
      (miss * rates.inMiss + read * rates.inHit + write * rates.inWrite + usage.output * rates.out) /
      1_000_000
    );
  }

  estimateSavings(model: string, usage: TokenUsage): number {
    const rates = this.getRates(model);
    const read = usage.cachedRead ?? 0;
    // Savings = cost of cache read tokens if they were cache misses minus what they actually cost
    return (read * (rates.inMiss - rates.inHit)) / 1_000_000;
  }

  private getRates(model: string): { inMiss: number; inHit: number; inWrite: number; out: number } {
    const key = model.toLowerCase();
    for (const [mName, rates] of Object.entries(CLAUDE_RATES)) {
      if (key.includes(mName)) return rates;
    }
    // Default to Sonnet rates if model not specifically matched
    return CLAUDE_RATES["claude-3-5-sonnet"];
  }

  async generate(
    model: string,
    prompt: string,
    opts: CallOptions = {}
  ): Promise<ProviderResponse> {
    const { assertProviderEnabled } = await import("@/lib/admin/platform-settings-runtime");
    await assertProviderEnabled("claude");

    const client = this.getClient();
    const started = Date.now();
    const retries = Math.max(1, opts.retries ?? 3);

    const callOnce = async (): Promise<ProviderResponse> => {
      const systemBlock: any[] = [];
      if (opts.systemPrompt) {
        systemBlock.push({
          type: "text",
          text: opts.systemPrompt,
          ...(opts.cachePrompt ? { cache_control: { type: "ephemeral" } } : {})
        });
      }

      const userContent: any[] = [{ type: "text", text: prompt }];

      const messageParams: Anthropic.MessageCreateParams = {
        model,
        max_tokens: opts.maxOutputTokens ?? 4096,
        temperature: opts.temperature,
        system: systemBlock.length ? systemBlock : undefined,
        messages: [{ role: "user", content: userContent }],
      };

      if (opts.topP !== undefined) {
        messageParams.top_p = opts.topP;
      }

      const response = await client.messages.create(messageParams, { signal: opts.signal });
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      // Extract usage metadata including caching tokens
      const usage = response.usage;
      const tokenUsage: TokenUsage = {
        input: usage.input_tokens,
        output: usage.output_tokens,
        cachedRead: (usage as any).cache_read_input_tokens ?? 0,
        cachedWrite: (usage as any).cache_creation_input_tokens ?? 0,
      };

      const latencyMs = Date.now() - started;
      const cost = this.estimateCost(model, tokenUsage);
      const savings = this.estimateSavings(model, tokenUsage);

      recordAiCall({
        provider: "claude",
        model,
        prompt,
        response: text,
        tokensInput: tokenUsage.input,
        tokensOutput: tokenUsage.output,
        tokensCachedRead: tokenUsage.cachedRead,
        tokensCachedWrite: tokenUsage.cachedWrite,
        costSavingsUsd: savings,
        estimatedCostUsd: cost,
        ok: true,
        latencyMs,
      });

      return {
        text,
        usage: tokenUsage,
        latencyMs,
        model,
        provider: "claude",
      };
    };

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await callOnce();
      } catch (e) {
        if (attempt === retries - 1) {
          const latencyMs = Date.now() - started;
          recordAiCall({
            provider: "claude",
            model,
            prompt,
            ok: false,
            latencyMs,
            errorMessage: e instanceof Error ? e.message : String(e),
          });
          throw e;
        }
        await new Promise((r) => setTimeout(r, 4000 * Math.pow(2, attempt)));
      }
    }
    throw new Error(`Claude ${model} failed after ${retries} retries`);
  }

  async *stream(
    model: string,
    prompt: string,
    opts: CallOptions = {}
  ): AsyncGenerator<string, ProviderResponse> {
    const { assertProviderEnabled } = await import("@/lib/admin/platform-settings-runtime");
    await assertProviderEnabled("claude");

    const client = this.getClient();
    const started = Date.now();

    const systemBlock: any[] = [];
    if (opts.systemPrompt) {
      systemBlock.push({
        type: "text",
        text: opts.systemPrompt,
        ...(opts.cachePrompt ? { cache_control: { type: "ephemeral" } } : {})
      });
    }

    const stream = await client.messages.create({
      model,
      max_tokens: opts.maxOutputTokens ?? 4096,
      temperature: opts.temperature,
      system: systemBlock.length ? systemBlock : undefined,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }, { signal: opts.signal });

    let fullText = "";
    let tokenUsage: TokenUsage = { input: 0, output: 0 };

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        fullText += chunk.delta.text;
        yield chunk.delta.text;
      } else if (chunk.type === "message_start") {
        const usage = chunk.message.usage;
        tokenUsage.input = usage.input_tokens;
        tokenUsage.output = usage.output_tokens;
        tokenUsage.cachedRead = (usage as any).cache_read_input_tokens ?? 0;
        tokenUsage.cachedWrite = (usage as any).cache_creation_input_tokens ?? 0;
      } else if (chunk.type === "message_delta") {
        const usage = chunk.usage;
        tokenUsage.output = usage.output_tokens;
      }
    }

    const latencyMs = Date.now() - started;
    const cost = this.estimateCost(model, tokenUsage);
    const savings = this.estimateSavings(model, tokenUsage);

    recordAiCall({
      provider: "claude",
      model,
      prompt,
      response: fullText,
      tokensInput: tokenUsage.input,
      tokensOutput: tokenUsage.output,
      tokensCachedRead: tokenUsage.cachedRead,
      tokensCachedWrite: tokenUsage.cachedWrite,
      costSavingsUsd: savings,
      estimatedCostUsd: cost,
      ok: true,
      latencyMs,
    });

    return {
      text: fullText,
      usage: tokenUsage,
      latencyMs,
      model,
      provider: "claude",
    };
  }

  async generateStructured<T>(
    model: string,
    prompt: string,
    schema: z.ZodType<T>,
    opts: CallOptions = {}
  ): Promise<StructuredResponse<T>> {
    const { assertProviderEnabled } = await import("@/lib/admin/platform-settings-runtime");
    await assertProviderEnabled("claude");

    const client = this.getClient();
    const started = Date.now();

    const systemBlock: any[] = [];
    if (opts.systemPrompt) {
      systemBlock.push({
        type: "text",
        text: opts.systemPrompt,
        ...(opts.cachePrompt ? { cache_control: { type: "ephemeral" } } : {})
      });
    }

    // Force structured output by defining a tool and setting tool_choice to force call it
    const jsonSchema = zodToJsonSchema(schema);
    const response = await client.messages.create({
      model,
      max_tokens: opts.maxOutputTokens ?? 4096,
      temperature: opts.temperature,
      system: systemBlock.length ? systemBlock : undefined,
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: "structured_output_schema",
          description: "Structured JSON schema output form.",
          input_schema: jsonSchema,
        },
      ],
      tool_choice: { type: "tool", name: "structured_output_schema" },
    }, { signal: opts.signal });

    // Find the tool use content block
    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUseBlock) {
      throw new Error("Claude did not use the structured output tool as requested.");
    }

    const data = toolUseBlock.input as T;

    // Run schema validation
    const validation = schema.safeParse(data);
    if (!validation.success) {
      throw new Error(
        `Zod validation failed: ${validation.error.message}\nRaw JSON: ${JSON.stringify(
          data,
          null,
          2
        )}`
      );
    }

    const usage = response.usage;
    const tokenUsage: TokenUsage = {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cachedRead: (usage as any).cache_read_input_tokens ?? 0,
      cachedWrite: (usage as any).cache_creation_input_tokens ?? 0,
    };

    const latencyMs = Date.now() - started;
    const cost = this.estimateCost(model, tokenUsage);
    const savings = this.estimateSavings(model, tokenUsage);

    recordAiCall({
      provider: "claude",
      model,
      prompt,
      response: JSON.stringify(data),
      tokensInput: tokenUsage.input,
      tokensOutput: tokenUsage.output,
      tokensCachedRead: tokenUsage.cachedRead,
      tokensCachedWrite: tokenUsage.cachedWrite,
      costSavingsUsd: savings,
      estimatedCostUsd: cost,
      ok: true,
      latencyMs,
    });

    return {
      text: JSON.stringify(data),
      data: validation.data,
      usage: tokenUsage,
      latencyMs,
      model,
      provider: "claude",
    };
  }
}

function zodToJsonSchema(schema: any): any {
  if (!schema) return { type: "string" };

  const typeName = schema._def?.typeName || schema.constructor?.name;

  if (typeName === "ZodObject" || schema instanceof z.ZodObject) {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    const shape = schema.shape || schema._def?.shape?.();

    if (shape) {
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        const valTypeName = (value as any)?._def?.typeName;
        if (valTypeName !== "ZodOptional" && valTypeName !== "ZodNullable" &&
            !((value as any) instanceof z.ZodOptional) && !((value as any) instanceof z.ZodNullable)) {
          required.push(key);
        }
      }
    }
    return {
      type: "object",
      properties,
      required: required.length ? required : undefined,
    };
  } else if (typeName === "ZodArray" || schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema.element || schema._def?.type),
    };
  } else if (typeName === "ZodString" || schema instanceof z.ZodString) {
    return { type: "string" };
  } else if (typeName === "ZodNumber" || schema instanceof z.ZodNumber) {
    return { type: "number" };
  } else if (typeName === "ZodBoolean" || schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  } else if (typeName === "ZodEnum" || schema instanceof z.ZodEnum) {
    return { type: "string", enum: schema._def?.values || schema.check || [] };
  } else if (typeName === "ZodOptional" || schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema._def?.innerType || schema.unwrap?.());
  } else if (typeName === "ZodNullable" || schema instanceof z.ZodNullable) {
    return zodToJsonSchema(schema._def?.innerType || schema.unwrap?.());
  } else if (typeName === "ZodEffects" || schema._def?.schema) {
    return zodToJsonSchema(schema._def.schema);
  }
  return { type: "string" }; // Catch-all default fallback
}
