/**
 * Orchestrator V2 — agentic tool-calling loop.
 *
 * Single LLM call → returns a JSON plan describing:
 *   - mode      : "chat" | "inform" | "analyze" | "action" | "research"
 *   - reply     : natural-language draft answer
 *   - tools     : ordered list of {id, params} the assistant should run
 *   - confirm   : boolean — pause and ask the user before mutating tools fire
 *
 * The executor runs the tools in order, capturing results, then a second LLM
 * call composes the final natural response from those results.
 *
 * Why not a fully autonomous "react" loop? Predictability and latency. One
 * planner call + one summary call is enough for 95% of user requests, and the
 * orchestrator falls back to read-only behaviour if the LLM returns junk.
 */

import { geminiGenerate } from "@/lib/gemini";
import type { AIContext, AIPageExtended, ContextualAgentOutput, ContextualSuggestion } from "@/features/ai-assistant/types";
import { TOOLS, findTool, toolCatalogueFor } from "@/features/ai-assistant/tools/registry";
import type { ToolContext, ToolResult } from "@/features/ai-assistant/tools/types";
import { validateParams } from "@/features/ai-assistant/tools/types";
import { parseJsonObject } from "@/features/ai-assistant/agent/common";

export type AssistantMode = "chat" | "inform" | "analyze" | "action" | "research";

export interface PlannedToolCall {
  id: string;
  params: Record<string, unknown>;
}

export interface ExecutedToolCall extends PlannedToolCall {
  result: ToolResult;
  durationMs: number;
}

export interface AssistantPlan {
  mode: AssistantMode;
  /** Why the assistant chose this plan (used for debugging + transparency). */
  rationale: string;
  /** When true, mutating tools were not auto-run; UI shows confirmation chips. */
  awaitingConfirmation: boolean;
  toolCalls: ExecutedToolCall[];
}

export interface AssistantTurnOutput extends ContextualAgentOutput {
  plan: AssistantPlan;
}

/* ───────────────────────── Planner ────────────────────────────────────── */

interface RawPlan {
  mode?: string;
  rationale?: string;
  reply?: string;
  tools?: Array<{ id?: string; params?: unknown }>;
}

/** Today's date in the user's local context — used for "today / tomorrow / 5 May" parsing. */
function todayInfo() {
  const d = new Date();
  const iso = d.toISOString().split("T")[0];
  const tomorrow = new Date(d.getTime() + 86_400_000).toISOString().split("T")[0];
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  return { iso, tomorrow, weekday, year: d.getFullYear() };
}

/**
 * Render the most-recent N user/assistant message pairs as a transcript the
 * planner and responder can use for follow-up coherence ("tell me", "yes",
 * "do it then" etc.).
 */
function recentTranscript(context: AIContext, n: number = 6): string {
  const history = context.memory.chatHistory ?? [];
  if (!history.length) return "(no prior messages)";
  return history
    .slice(-n)
    .map(m => `${m.role.toUpperCase()}: ${m.text.replace(/\s+/g, " ").slice(0, 280)}`)
    .join("\n");
}

/** Inline calendar snapshot — counts by status + the next 12 upcoming dates. */
function calendarSnapshot(context: AIContext): string {
  if (!context.calendarData.length) return "(calendar is empty)";
  const counts: Record<string, number> = {};
  for (const e of context.calendarData) counts[e.status] = (counts[e.status] ?? 0) + 1;
  const today = new Date().toISOString().split("T")[0];
  const upcoming = context.calendarData
    .slice()
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    .filter(e => e.scheduled_date >= today)
    .slice(0, 12)
    .map(e => `${e.scheduled_date} · "${e.focus_keyword}" · ${e.status}`)
    .join("\n");
  const past = context.calendarData
    .slice()
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))
    .filter(e => e.scheduled_date < today)
    .slice(0, 5)
    .map(e => `${e.scheduled_date} · "${e.focus_keyword}" · ${e.status}`)
    .join("\n");
  return `Status counts: ${JSON.stringify(counts)}\nUpcoming entries:\n${upcoming || "(none)"}\nRecent past:\n${past || "(none)"}`;
}

async function plan(
  context: AIContext,
  prompt: string,
  blogId: string | undefined
): Promise<RawPlan> {
  const catalogue = toolCatalogueFor(context.page);
  const today = todayInfo();
  const transcript = recentTranscript(context, 6);

  const stats = {
    keywords: context.keywords.length,
    domainKeywords: context.domainKeywords?.length ?? 0,
    competitorGaps: context.contentGaps.length,
    calendarEntries: context.calendarData.length,
    audits: context.audits.length,
    blogOpen: Boolean(blogId),
  };

  const systemPrompt = `You are the planning brain of an SEO content assistant inside a tool called SerpCraft. Read the user's message AND the recent chat transcript, then return a JSON plan.

TODAY
- ISO date: ${today.iso}
- Weekday: ${today.weekday}
- Tomorrow: ${today.tomorrow}
- Current year: ${today.year}
ALL DATE EXPRESSIONS ("today", "tomorrow", "5th May", "next Friday") MUST be resolved against this date. Always use the current year unless the user is unmistakably referring to a past year.

PROJECT CONTEXT
- Page: ${context.page}
- Niche: ${context.businessContext.niche || "(unknown)"}
- Audience: ${context.businessContext.audience || "(unknown)"}
- Region: ${context.businessContext.region || "us"}
- Project domain: ${context.businessContext.projectDomain || "(unknown)"}
- Competitors: ${(context.businessContext.competitorDomains ?? []).join(", ") || "(none)"}
${context.businessContext.businessBrief ? `- Brief excerpt: ${context.businessContext.businessBrief.slice(0, 500)}` : ""}
- Blog open in editor: ${blogId ? `yes (id ${blogId})` : "no"}
- Loaded data counts: ${JSON.stringify(stats)}

CALENDAR SNAPSHOT (use this to ground your reply when asked about schedule):
${calendarSnapshot(context)}

RECENT CHAT TRANSCRIPT (you must maintain coherence with this — do not greet again, do not lose context):
${transcript}

AVAILABLE TOOLS (only these ids may appear in tools[]):
${JSON.stringify(catalogue, null, 2)}

USER MESSAGE:
"${prompt}"

DECISION RULES — pick exactly one mode:
1. "chat"     → ONLY for greetings ("hi", "thanks") or completely off-topic conversation. NEVER use chat mode if the user asks a real question about their data — call a read tool instead.
2. "inform"   → ANY factual question about calendar / keywords / blogs / audits — even short ones like "show me", "tell me", "what about today". Use read tools.
3. "analyze"  → keyword strategy, recommendations, "best keywords", "blog ideas", "top opportunities", competitor gap analysis. Use ONE analyze-category tool.
4. "action"   → user explicitly wants to change something (approve, reject, schedule, vacate, edit blog, fix SEO, generate). Use mutate tools.
5. "research" → user wants fresh external data (refresh brief, refresh domain keywords, run audit batch, run benchmark). Use research tools.

HARD RULES — VIOLATING ANY OF THESE IS A BUG
A. If the user mentions ANY date (today, tomorrow, "5 May", ISO), you MUST call calendar.listOnDate with the resolved YYYY-MM-DD — never guess from snapshot alone.
B. If the user asks "which blogs are ready" / "what's published" / "what's generated" / "what's approved" / "what's still scheduled but not generated", call calendar.listByStatus with the matching status.
C. If the user asks "what's coming up", "next week", "show me the schedule", call calendar.upcoming.
D. Continuation prompts like "tell me", "yes", "go ahead", "show them", "list them" REFER to the assistant's previous offer in the transcript. Re-issue the implied tool call. Do NOT respond with another generic offer.
E. Only choose tools whose id appears in AVAILABLE TOOLS. If no tool fits, use mode "chat" and answer in reply.
F. Mutating tools require an explicit user request — never auto-run on a vague "help".
G. For action mode, EVERY required param must be filled. If something is ambiguous, set mode "chat" and ask a clarifying question.
H. Keep reply short (1–3 sentences) — the responder will expand it.
I. NEVER fabricate keyword names, blog titles, dates, IDs, or feature names like "Create Post" or "Weekly Calendar" that aren't in your tool list.
J. PAGE-SPECIFIC ANALYSIS (critical):
   - If current page is "keywords" → ONLY use tool "keywords.findBest" for keyword recommendations / "top N keywords" / discovery. NEVER call "competitors.findBlogWorthy" there.
   - If current page is "competitors" → ONLY use "competitors.findBlogWorthy" for competitor gap / opportunity questions. NEVER call "keywords.findBest" there.
   - On calendar, blogs, or audit pages, prefer "keywords.findBest" for general keyword picks unless the user explicitly asks about competitors or gaps.

Return JSON ONLY, no markdown code fences:
{
  "mode": "chat" | "inform" | "analyze" | "action" | "research",
  "rationale": "short reason",
  "reply": "draft answer",
  "tools": [{ "id": "tool.id", "params": { ... } }]
}`;

  try {
    const raw = await geminiGenerate(systemPrompt, 1);
    const parsed = parseJsonObject(raw) as RawPlan | null;
    if (!parsed) return { mode: "chat", reply: raw.trim().slice(0, 500), tools: [] };
    return parsed;
  } catch (e) {
    console.warn("[orchestratorV2] planner failed:", e);
    return { mode: "chat", reply: "Sorry — I had trouble understanding that. Could you rephrase?", tools: [] };
  }
}

/* ───────────────────────── Executor ───────────────────────────────────── */

async function executeTools(
  rawCalls: Array<{ id?: string; params?: unknown }>,
  ctx: ToolContext,
  awaitConfirmation: boolean
): Promise<{ executed: ExecutedToolCall[]; awaiting: ExecutedToolCall[] }> {
  const executed: ExecutedToolCall[] = [];
  const awaiting: ExecutedToolCall[] = [];

  for (const call of rawCalls) {
    if (!call?.id) continue;
    const tool = findTool(call.id);
    if (!tool) {
      executed.push({
        id: call.id,
        params: {},
        durationMs: 0,
        result: { success: false, message: `Unknown tool "${call.id}".`, error: "unknown_tool" },
      });
      continue;
    }
    const valid = validateParams(tool, call.params ?? {});
    if (!valid.ok) {
      executed.push({
        id: tool.id,
        params: (call.params as Record<string, unknown>) ?? {},
        durationMs: 0,
        result: { success: false, message: valid.error, error: "bad_params" },
      });
      continue;
    }
    // Confirmation gate for mutating tools.
    if (tool.requiresConfirmation && awaitConfirmation) {
      awaiting.push({
        id: tool.id,
        params: valid.params,
        durationMs: 0,
        result: { success: true, message: `Pending confirmation: ${tool.description}` },
      });
      continue;
    }
    const t0 = Date.now();
    try {
      const r = await tool.execute(valid.params, ctx);
      executed.push({ id: tool.id, params: valid.params, durationMs: Date.now() - t0, result: r });
    } catch (e) {
      executed.push({
        id: tool.id,
        params: valid.params,
        durationMs: Date.now() - t0,
        result: { success: false, message: e instanceof Error ? e.message : "Tool threw", error: "exception" },
      });
    }
  }

  return { executed, awaiting };
}

/* ───────────────────────── Responder ──────────────────────────────────── */

async function compose(
  context: AIContext,
  prompt: string,
  draftReply: string,
  mode: AssistantMode,
  toolCalls: ExecutedToolCall[]
): Promise<string> {
  // No tools → still rephrase using chat history so follow-ups stay coherent.
  const transcript = recentTranscript(context, 6);

  if (!toolCalls.length) {
    if (!draftReply.trim()) return "I'm here — what would you like to do next?";
    // Quick coherence pass: ensure the planner's draft doesn't restart the
    // conversation when the user is mid-thread.
    if (context.memory.chatHistory && context.memory.chatHistory.length > 0) {
      const coherencePrompt = `Rewrite this assistant reply so it flows naturally with the recent transcript. Do NOT greet the user again. Do NOT restart the conversation. If the user said "tell me" / "yes" / "go ahead", continue exactly what was previously offered without asking what they meant.

RECENT TRANSCRIPT:
${transcript}

USER MESSAGE: "${prompt}"
DRAFT REPLY: "${draftReply}"

Return the polished reply only — plain text, 1–3 sentences.`;
      try {
        const polished = (await geminiGenerate(coherencePrompt, 1)).trim();
        return polished || draftReply.trim();
      } catch {
        return draftReply.trim();
      }
    }
    return draftReply.trim();
  }

  // Build a compact tool-result digest for the responder LLM.
  const digest = toolCalls.map(tc => ({
    tool: tc.id,
    ok: tc.result.success,
    msg: tc.result.message,
    data: tc.result.data ?? null,
  }));

  const responderPrompt = `You are an SEO assistant talking to a user. The system just ran some tools on their behalf. Compose ONE conversational reply (no JSON, no markdown headers, no code fences) that:

1. Directly answers the user's CURRENT question while staying coherent with the prior transcript — never greet again, never ask "what would you like" if the prior turn was already specific.
2. Confirms what the tools did (only mention tools that succeeded; mention failures honestly).
3. If a tool returned a list (entries, suggestions), surface the actual items by name and date — DO NOT give a generic summary.
4. Reads naturally — like a teammate, not a system log. 2–5 sentences. Bullet list only when listing >2 distinct items.
5. If suggestion cards will be rendered below, reference them by name in the same order they appear.
6. If a mutation succeeded (mode=${mode}), confirm it confidently and offer the next sensible step in one phrase.

RECENT TRANSCRIPT (you must stay coherent with this):
${transcript}

USER QUESTION: "${prompt}"
PLANNER DRAFT: "${draftReply}"
NICHE: ${context.businessContext.niche || "(unknown)"}
AUDIENCE: ${context.businessContext.audience || "(unknown)"}

TOOL RESULTS:
${JSON.stringify(digest, null, 2)}

Write the reply now — plain text only.`;

  try {
    const reply = await geminiGenerate(responderPrompt, 1);
    return reply.trim() || draftReply.trim();
  } catch {
    // Fallback: stitch tool messages together.
    return [draftReply.trim(), ...toolCalls.map(tc => tc.result.message)].filter(Boolean).join(" ");
  }
}

/* ───────────────────────── Entry point ────────────────────────────────── */

const EMPTY_FILTERS = {
  suggestedKeywordIds: [] as string[],
  suggestedGapKeywords: [] as string[],
  lowCompetitionKeywordIds: [] as string[],
  longTailKeywordIds: [] as string[],
};

/**
 * Run a full agentic turn: plan → execute → compose.
 *
 * `awaitConfirmation` defaults to true so destructive tools never auto-run on
 * the first turn. The chatbot UI will show pending mutating tools as buttons
 * the user clicks to confirm — at that point the same orchestrator is invoked
 * again with `awaitConfirmation: false`.
 */
export async function runAssistantTurn(
  context: AIContext,
  prompt: string,
  options: { blogId?: string; awaitConfirmation?: boolean } = {}
): Promise<AssistantTurnOutput> {
  const { blogId, awaitConfirmation = true } = options;
  const toolCtx: ToolContext = {
    projectId: context.projectId,
    page: context.page,
    blogId,
    context,
    userPrompt: prompt,
  };

  const raw = await plan(context, prompt, blogId);
  const mode: AssistantMode =
    raw.mode === "chat" ||
    raw.mode === "inform" ||
    raw.mode === "analyze" ||
    raw.mode === "action" ||
    raw.mode === "research"
      ? raw.mode
      : "chat";

  const { executed, awaiting } = await executeTools(raw.tools ?? [], toolCtx, awaitConfirmation);

  const draftReply = typeof raw.reply === "string" ? raw.reply : "";
  const summary = await compose(context, prompt, draftReply, mode, executed);

  // Pull suggestion cards out of any analyze-category result.
  let suggestions: ContextualSuggestion[] = [];
  let agentActions: ContextualAgentOutput["actions"] = [];
  let filters = EMPTY_FILTERS;
  for (const tc of executed) {
    const tool = findTool(tc.id);
    if (tool?.category === "analyze" && tc.result.success && tc.result.data) {
      const data = tc.result.data as { suggestions?: ContextualSuggestion[]; actions?: ContextualAgentOutput["actions"]; filters?: typeof EMPTY_FILTERS };
      if (Array.isArray(data.suggestions) && data.suggestions.length) suggestions = data.suggestions;
      if (Array.isArray(data.actions)) agentActions = data.actions;
      if (data.filters) filters = data.filters;
      break;
    }
  }

  return {
    page: context.page,
    summary,
    suggestions,
    actions: agentActions,
    filters,
    plan: {
      mode,
      rationale: typeof raw.rationale === "string" ? raw.rationale : "",
      awaitingConfirmation: awaiting.length > 0,
      toolCalls: [...executed, ...awaiting],
    },
  };
}

/** Page-scoped quick-prompt suggestions, generated from the tool registry. */
export function quickPromptsForPage(page: AIPageExtended): Array<{ id: string; label: string; prompt: string }> {
  switch (page) {
    case "keywords":
      return [
        { id: "best", label: "Best keywords for me", prompt: "Find the best keyword opportunities for my business" },
        { id: "lowcomp", label: "Easy to rank", prompt: "Show low-competition keywords I can rank for fast" },
        { id: "longtail", label: "Long-tail picks", prompt: "Suggest 5 long-tail keywords with commercial intent" },
        { id: "schedule", label: "Schedule remaining", prompt: "Schedule all my approved keywords on the calendar" },
      ];
    case "competitors":
      return [
        { id: "gaps", label: "Best competitor gaps", prompt: "Show me the best blog-worthy keywords my competitors rank for" },
        { id: "compare", label: "Compare coverage", prompt: "Where am I losing to competitors that I could realistically win?" },
      ];
    case "calendar":
      return [
        { id: "fill", label: "Auto-fill calendar", prompt: "Schedule the rest of my approved keywords across the next 30 days" },
        { id: "today", label: "What's today?", prompt: "What's scheduled for today?" },
        { id: "vacate", label: "Free up a date", prompt: "Free up the next empty Friday" },
      ];
    case "blogs":
      return [
        { id: "next", label: "What to write next", prompt: "What blog should I write next based on my approved keywords?" },
        { id: "improve", label: "Improve a blog", prompt: "Which blogs would benefit most from a refresh?" },
      ];
    case "audit":
      return [
        { id: "discover", label: "Discover pages", prompt: "Discover all content pages from my sitemap" },
        { id: "worst", label: "Worst issues", prompt: "Show the highest-severity content audit issues" },
        { id: "audit5", label: "Audit 5 pages", prompt: "Run audits on the next 5 unaudited blog pages" },
        { id: "what-fix", label: "What to fix first", prompt: "What content issues should I fix first to improve my SEO?" },
      ];
    default:
      return [
        { id: "help", label: "What can you do?", prompt: "What can you do on this page?" },
        { id: "best", label: "Best keywords", prompt: "Suggest the best keywords for my business" },
      ];
  }
}

export { TOOLS };
