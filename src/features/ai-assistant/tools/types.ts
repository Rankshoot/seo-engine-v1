/**
 * Tool system for the AI assistant.
 *
 * A "tool" is a single capability the assistant can invoke — read data,
 * analyse it, or mutate state. Each tool is declarative:
 *   - `id`           uniquely identifies it (used by the orchestrator)
 *   - `description`  is what the LLM reads when picking tools
 *   - `pages`        scopes the tool to specific pages (or `"all"`)
 *   - `category`     "read" | "analyze" | "mutate" | "research"
 *   - `params`       a list of parameter schemas (LLM fills these)
 *   - `execute`      the actual implementation — usually wraps a server action
 *
 * The orchestrator uses the metadata to build a JSON tool catalogue for the
 * LLM, the LLM returns a plan, and the executor validates + runs the tools.
 */

import type { AIContext, AIPageExtended } from "@/features/ai-assistant/types";

export type ToolCategory = "read" | "analyze" | "mutate" | "research";

export type ParamType = "string" | "number" | "boolean" | "string[]" | "date";

export interface ToolParam {
  name: string;
  type: ParamType;
  required: boolean;
  description: string;
  /** Optional list of valid values for `string` params (acts as enum). */
  enum?: string[];
  /** Default applied when the LLM omits the field and `required: false`. */
  default?: unknown;
}

export interface ToolContext {
  projectId: string;
  page: AIPageExtended;
  /** Filled when the assistant is opened from a blog editor page. */
  blogId?: string;
  context: AIContext;
  /** Original user message for this turn — passed to analyze agents (counts, filters, wording). */
  userPrompt?: string;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  /** Short user-facing line explaining what happened. */
  message: string;
  /** Structured payload — the responder can pull facts from this. */
  data?: T;
  /** Optional error string when `success: false`. */
  error?: string;
  /** Side-effect description for audit logging. */
  sideEffect?: string;
}

export interface Tool<P = Record<string, unknown>, R = unknown> {
  id: string;
  description: string;
  pages: AIPageExtended[] | "all";
  category: ToolCategory;
  params: ToolParam[];
  /** When true, the orchestrator confirms with the user before running. */
  requiresConfirmation?: boolean;
  /** Hint to the chat UI for how to render the result. */
  render?: "cards" | "list" | "summary" | "diff" | "none";
  execute(params: P, ctx: ToolContext): Promise<ToolResult<R>>;
}

/** Minimal runtime validator — fills defaults, type-coerces, returns errors. */
export function validateParams(
  tool: Tool,
  raw: unknown
): { ok: true; params: Record<string, unknown> } | { ok: false; error: string } {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const p of tool.params) {
    let v = obj[p.name];
    if (v === undefined || v === null || v === "") {
      if (p.required) return { ok: false, error: `Missing required parameter "${p.name}"` };
      if (p.default !== undefined) v = p.default;
      else continue;
    }
    switch (p.type) {
      case "string":
        if (typeof v !== "string") return { ok: false, error: `Param "${p.name}" must be a string` };
        if (p.enum && !p.enum.includes(v)) {
          return { ok: false, error: `Param "${p.name}" must be one of ${p.enum.join(", ")}` };
        }
        out[p.name] = v;
        break;
      case "number": {
        const n = typeof v === "number" ? v : Number(v);
        if (Number.isNaN(n)) return { ok: false, error: `Param "${p.name}" must be a number` };
        out[p.name] = n;
        break;
      }
      case "boolean":
        out[p.name] = Boolean(v);
        break;
      case "string[]":
        if (!Array.isArray(v) || !v.every(x => typeof x === "string")) {
          return { ok: false, error: `Param "${p.name}" must be string[]` };
        }
        out[p.name] = v;
        break;
      case "date":
        if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          return { ok: false, error: `Param "${p.name}" must be ISO date YYYY-MM-DD` };
        }
        out[p.name] = v;
        break;
    }
  }
  return { ok: true, params: out };
}
