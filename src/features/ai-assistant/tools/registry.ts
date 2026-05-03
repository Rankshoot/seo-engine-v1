/**
 * Tool Registry — every capability the AI assistant can perform.
 *
 * Each entry wraps an existing server action so the assistant has a single
 * declarative surface and the LLM never has to know server-action signatures.
 *
 * Read tools  → never mutate, free to call as part of analysis.
 * Analyze tools → run in-app reasoning (existing keyword/competitor agents).
 * Mutate tools → require explicit user request; return clear before/after.
 * Research tools → hit external APIs (Serper, etc.); guarded by mode.
 */

import {
  updateKeywordStatus,
  bulkUpdateKeywordStatus,
  deleteKeyword,
  getDomainKeywords,
} from "@/app/actions/keyword-actions";
import {
  addKeywordToCalendarOnDate,
  approveAISuggestionToCalendar,
  vacateCalendarSlot,
  scheduleRemainingApprovedKeywords,
  updateCalendarEntryStatus,
} from "@/app/actions/calendar-actions";
import {
  generateBlog,
  fixBlogSeoIssue,
  updateBlogStatus,
  editBlogParagraph,
  editBlogSection,
  addInternalLinksToBlog,
  addCitationsToBlog,
  applyBlogInstruction,
} from "@/app/actions/blog-actions";
import { repairBlogFromAudit } from "@/app/actions/repair-actions";
import { auditExistingBlogs, auditSelectedUrls, getAllSitemapPages } from "@/app/actions/audit-actions";
import { generateBlogFromOpportunity } from "@/app/actions/competitor-actions";
import { generateBusinessBrief } from "@/app/actions/brief-actions";

import { runKeywordsAgent } from "@/features/ai-assistant/agent/keywordsAgent";
import { runCompetitorAgent } from "@/features/ai-assistant/agent/competitorAgent";
import { runBlogAgent } from "@/features/ai-assistant/agent/blogAgent";
import { runContentAuditAgent } from "@/features/ai-assistant/agent/contentAuditAgent";

import type { Tool, ToolContext, ToolResult } from "./types";
import type { AIContext } from "@/features/ai-assistant/types";
import type { BlogSeoIssueKey, CalendarEntry, Keyword } from "@/lib/types";

// ─── KEYWORDS ──────────────────────────────────────────────────────────────

const findBestKeywords: Tool = {
  id: "keywords.findBest",
  description:
    "Analyse ONLY the Industry-tab + Domain-tab keyword pools (saved discovery + live site keywords). Use on Keywords / Calendar / Blogs / Audit pages for recommendations, 'top N keywords', or blog topic picks. Do NOT use on the Competitors page.",
  pages: ["keywords", "calendar", "blogs", "audit"],
  category: "analyze",
  params: [],
  render: "cards",
  async execute(_params, ctx): Promise<ToolResult> {
    const scoped: AIContext = {
      ...ctx.context,
      contentGaps: [],
      competitorKeywords: [],
    };
    const out = await runKeywordsAgent(scoped, ctx.userPrompt ?? "");
    return {
      success: true,
      message: out.summary,
      data: { suggestions: out.suggestions, actions: out.actions, filters: out.filters },
    };
  },
};

const approveKeyword: Tool<{ keyword: string }, unknown> = {
  id: "keywords.approve",
  description:
    "Approve a single keyword by name (sets its status to 'approved'). Use when the user says 'approve <keyword>' or similar.",
  pages: "all",
  category: "mutate",
  requiresConfirmation: false,
  render: "summary",
  params: [
    { name: "keyword", type: "string", required: true, description: "Exact keyword text to approve" },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const target = ctx.context.keywords.find(
      k => k.keyword.toLowerCase().trim() === params.keyword.toLowerCase().trim()
    );
    if (!target) return { success: false, message: `Keyword "${params.keyword}" not found in your saved list.`, error: "not_found" };
    const res = await updateKeywordStatus(target.id, "approved");
    return res.success
      ? { success: true, message: `Approved "${target.keyword}".`, data: { keywordId: target.id }, sideEffect: "keyword.status=approved" }
      : { success: false, message: `Could not approve: ${res.error}`, error: res.error };
  },
};

const rejectKeyword: Tool<{ keyword: string }> = {
  id: "keywords.reject",
  description: "Mark a keyword as rejected so it stops appearing in pending lists.",
  pages: "all",
  category: "mutate",
  render: "summary",
  params: [{ name: "keyword", type: "string", required: true, description: "Exact keyword text to reject" }],
  async execute(params, ctx): Promise<ToolResult> {
    const target = ctx.context.keywords.find(
      k => k.keyword.toLowerCase().trim() === params.keyword.toLowerCase().trim()
    );
    if (!target) return { success: false, message: `Keyword "${params.keyword}" not found.`, error: "not_found" };
    const res = await updateKeywordStatus(target.id, "rejected");
    return res.success
      ? { success: true, message: `Rejected "${target.keyword}".`, sideEffect: "keyword.status=rejected" }
      : { success: false, message: `Could not reject: ${res.error}`, error: res.error };
  },
};

const bulkApproveKeywords: Tool<{ keywords: string[] }> = {
  id: "keywords.bulkApprove",
  description: "Approve several keywords at once by name list. Use when the user says 'approve all of these' / 'approve N1, N2, N3'.",
  pages: "all",
  category: "mutate",
  requiresConfirmation: true,
  render: "summary",
  params: [
    { name: "keywords", type: "string[]", required: true, description: "Array of exact keyword strings to approve" },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const ids: string[] = [];
    const missing: string[] = [];
    for (const kw of params.keywords) {
      const t = ctx.context.keywords.find(k => k.keyword.toLowerCase().trim() === kw.toLowerCase().trim());
      if (t) ids.push(t.id);
      else missing.push(kw);
    }
    if (!ids.length) return { success: false, message: `None of those keywords were found.`, error: "not_found" };
    const res = await bulkUpdateKeywordStatus(ids, "approved");
    return res.success
      ? {
          success: true,
          message: `Approved ${ids.length} keyword(s)${missing.length ? `; ${missing.length} were not found` : ""}.`,
          data: { approved: ids.length, missing },
          sideEffect: "keyword.bulk.status=approved",
        }
      : { success: false, message: `Bulk approve failed: ${res.error}`, error: res.error };
  },
};

const deleteKeywordTool: Tool<{ keyword: string }> = {
  id: "keywords.delete",
  description: "Remove a keyword from the project list permanently.",
  pages: "all",
  category: "mutate",
  requiresConfirmation: true,
  render: "summary",
  params: [{ name: "keyword", type: "string", required: true, description: "Exact keyword text to delete" }],
  async execute(params, ctx): Promise<ToolResult> {
    const target = ctx.context.keywords.find(
      k => k.keyword.toLowerCase().trim() === params.keyword.toLowerCase().trim()
    );
    if (!target) return { success: false, message: `Keyword "${params.keyword}" not found.`, error: "not_found" };
    const res = await deleteKeyword(target.id);
    return res.success
      ? { success: true, message: `Deleted "${target.keyword}".`, sideEffect: "keyword.deleted" }
      : { success: false, message: `Delete failed: ${res.error}`, error: res.error };
  },
};

const refreshDomainKeywords: Tool = {
  id: "keywords.refreshDomain",
  description: "Re-fetch live domain-tab keywords from Google Ads (DataForSEO) for this project's domain.",
  pages: ["keywords"],
  category: "research",
  render: "summary",
  params: [],
  async execute(_p, ctx): Promise<ToolResult> {
    const res = await getDomainKeywords(ctx.projectId);
    if (!res.success) return { success: false, message: `Could not refresh domain keywords: ${res.error}`, error: res.error };
    return { success: true, message: `Loaded ${res.data.length} live domain keywords.`, data: { count: res.data.length } };
  },
};

const approveAndSchedule: Tool<{ keyword: string; date?: string; volume?: number; kd?: number; intent?: string }> = {
  id: "keywords.approveAndSchedule",
  description:
    "Approve a keyword AND add it to the content calendar in one step. Use when the user says 'add <keyword> to calendar' or 'schedule <keyword>'. The agent will pick the next free slot if no date is provided.",
  pages: "all",
  category: "mutate",
  render: "summary",
  params: [
    { name: "keyword", type: "string", required: true, description: "Keyword text" },
    { name: "date", type: "date", required: false, description: "Optional ISO date YYYY-MM-DD" },
    { name: "volume", type: "number", required: false, default: 0, description: "Search volume if known" },
    { name: "kd", type: "number", required: false, default: 0, description: "Keyword difficulty if known" },
    { name: "intent", type: "string", required: false, default: "", description: "Search intent if known" },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const existing = ctx.context.keywords.find(
      k => k.keyword.toLowerCase().trim() === params.keyword.toLowerCase().trim()
    );
    if (params.date && existing) {
      const res = await addKeywordToCalendarOnDate(existing.id, ctx.projectId, params.date);
      return res.success
        ? { success: true, message: `Scheduled "${existing.keyword}" for ${params.date}.`, sideEffect: "calendar.scheduled" }
        : { success: false, message: `Could not schedule: ${res.error}`, error: res.error };
    }
    const res = await approveAISuggestionToCalendar({
      projectId: ctx.projectId,
      keyword: params.keyword,
      keywordId: existing?.id,
      source: ctx.page,
      page: ctx.page,
      volume: params.volume ?? existing?.volume ?? 0,
      kd: params.kd ?? existing?.kd ?? 0,
      intent: params.intent ?? existing?.intent ?? "",
    });
    if (!res.success) return { success: false, message: res.error ?? "Failed to add", error: res.error };
    return {
      success: true,
      message: `Added "${params.keyword}" to the calendar${res.scheduledDate ? ` on ${res.scheduledDate}` : ""}.`,
      data: { scheduledDate: res.scheduledDate },
      sideEffect: "calendar.created",
    };
  },
};

// ─── COMPETITORS ───────────────────────────────────────────────────────────

const findCompetitorOpportunities: Tool = {
  id: "competitors.findBlogWorthy",
  description:
    "Analyse ONLY competitor gap rows + competitor-site keyword frequency (benchmark data). Use on the Competitors page for gaps, opportunities, or 'what should we steal from competitors'. Never substitute for Industry/Domain discovery on the Keywords page.",
  pages: ["competitors"],
  category: "analyze",
  render: "cards",
  params: [],
  async execute(_p, ctx): Promise<ToolResult> {
    const scoped: AIContext = {
      ...ctx.context,
      keywords: [],
      domainKeywords: [],
    };
    const out = await runCompetitorAgent(scoped, ctx.userPrompt ?? "");
    return { success: true, message: out.summary, data: { suggestions: out.suggestions, actions: out.actions } };
  },
};

const scheduleCompetitorGap: Tool<{ keyword: string }> = {
  id: "competitors.scheduleGap",
  description: "Take a competitor gap keyword and schedule a blog for it (creates calendar entry + approved keyword).",
  pages: ["competitors", "keywords", "calendar", "blogs"],
  category: "mutate",
  render: "summary",
  params: [{ name: "keyword", type: "string", required: true, description: "The competitor gap keyword" }],
  async execute(params, ctx): Promise<ToolResult> {
    const res = await generateBlogFromOpportunity(ctx.projectId, params.keyword);
    if (!res || !("success" in res) || !res.success)
      return { success: false, message: (res as { error?: string })?.error ?? "Failed to schedule", error: (res as { error?: string })?.error };
    return { success: true, message: `Scheduled "${params.keyword}" as a blog topic.`, sideEffect: "calendar.created" };
  },
};

// ─── CALENDAR ──────────────────────────────────────────────────────────────

/** PostgREST may return `keywords` as an object or a single-element array. */
function pickKeywordJoin(e: CalendarEntry): Keyword | undefined {
  const raw = e.keywords as unknown;
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw[0] as Keyword | undefined;
  return raw as Keyword;
}

function preferNum(
  a: number | null | undefined,
  b: number | null | undefined
): number | null {
  if (typeof a === "number" && !Number.isNaN(a)) return a;
  if (typeof b === "number" && !Number.isNaN(b)) return b;
  return null;
}

function preferStr(a: string | null | undefined, b: string | null | undefined): string {
  const x = (a ?? "").trim();
  if (x) return x;
  return (b ?? "").trim();
}

/**
 * Build the rich entry record returned by all calendar list tools.
 * Merges `keywords(*)` join with `context.keywords` so volume/KD/CPC survive
 * stale embeds, API stripping, or orphan recovery races.
 */
function richCalendarEntry(e: CalendarEntry, keywordPool: Keyword[]) {
  const joined = pickKeywordJoin(e);
  const fromPool = e.keyword_id ? keywordPool.find(k => k.id === e.keyword_id) : undefined;
  return {
    id: e.id,
    date: e.scheduled_date,
    keyword: e.focus_keyword,
    keyword_id: e.keyword_id,
    title: e.title || "",
    status: e.status,
    article_type: e.article_type || "Blog Post",
    secondary_keywords: e.secondary_keywords ?? [],
    volume: preferNum(joined?.volume, fromPool?.volume),
    kd: preferNum(joined?.kd, fromPool?.kd),
    cpc: preferNum(joined?.cpc, fromPool?.cpc),
    intent: preferStr(joined?.intent ?? "", fromPool?.intent ?? ""),
    trend: preferStr(joined?.trend ?? "", fromPool?.trend ?? ""),
  };
}

const listCalendarOnDate: Tool<{ date: string }> = {
  id: "calendar.listOnDate",
  description:
    "List calendar entries scheduled on a specific date. Use whenever the user mentions a date (today, tomorrow, '5th May', '2026-05-05'). Resolve relative dates against TODAY's date provided in the planner context.",
  pages: "all",
  category: "read",
  render: "list",
  params: [{ name: "date", type: "date", required: true, description: "ISO date YYYY-MM-DD" }],
  async execute(params, ctx): Promise<ToolResult> {
    const entries = ctx.context.calendarData.filter(e => e.scheduled_date === params.date);
    return {
      success: true,
      message: entries.length
        ? `${entries.length} entry(ies) on ${params.date}.`
        : `Nothing scheduled on ${params.date}.`,
      data: { entries: entries.map(entry => richCalendarEntry(entry, ctx.context.keywords)) },
    };
  },
};

const listCalendarUpcoming: Tool<{ days?: number; limit?: number }> = {
  id: "calendar.upcoming",
  description:
    "List the next N upcoming calendar entries (default 14 days, max 30 results). Use for 'what's coming up', 'next two weeks', 'show schedule'.",
  pages: "all",
  category: "read",
  render: "list",
  params: [
    { name: "days", type: "number", required: false, default: 14, description: "How many days into the future" },
    { name: "limit", type: "number", required: false, default: 20, description: "Max entries to return" },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const today = new Date().toISOString().split("T")[0];
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + (params.days ?? 14));
    const horizonIso = horizon.toISOString().split("T")[0];
    const entries = ctx.context.calendarData
      .filter(e => e.scheduled_date >= today && e.scheduled_date <= horizonIso)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
      .slice(0, params.limit ?? 20);
    return {
      success: true,
      message: entries.length
        ? `${entries.length} entry(ies) coming up in the next ${params.days ?? 14} days.`
        : `Nothing scheduled in the next ${params.days ?? 14} days.`,
      data: { entries: entries.map(entry => richCalendarEntry(entry, ctx.context.keywords)) },
    };
  },
};

const listCalendarByStatus: Tool<{ status: string }> = {
  id: "calendar.listByStatus",
  description:
    "List calendar entries filtered by status. Use this when the user asks 'which blogs are ready to post', 'what's been generated', 'what's still scheduled but not generated', etc.",
  pages: "all",
  category: "read",
  render: "list",
  params: [
    {
      name: "status",
      type: "string",
      required: true,
      description: "Status to filter by",
      enum: ["scheduled", "generating", "generated", "downloaded", "approved", "published"],
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const entries = ctx.context.calendarData
      .filter(e => e.status === params.status)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
    return {
      success: true,
      message: entries.length
        ? `${entries.length} entry(ies) with status "${params.status}".`
        : `No entries with status "${params.status}".`,
      data: { entries: entries.map(entry => richCalendarEntry(entry, ctx.context.keywords)) },
    };
  },
};

const rescheduleEntry: Tool<{ keyword: string; newDate: string }> = {
  id: "calendar.reschedule",
  description: "Move an existing calendar entry to a different date. Identify the entry by its keyword.",
  pages: "all",
  category: "mutate",
  render: "summary",
  params: [
    { name: "keyword", type: "string", required: true, description: "Keyword of the entry to move" },
    { name: "newDate", type: "date", required: true, description: "Target date YYYY-MM-DD" },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const entry = ctx.context.calendarData.find(
      e => e.focus_keyword.toLowerCase().trim() === params.keyword.toLowerCase().trim()
    );
    if (!entry) return { success: false, message: `No calendar entry found for "${params.keyword}".`, error: "not_found" };
    if (!entry.keyword_id) return { success: false, message: "Entry is orphaned and cannot be moved.", error: "no_keyword_id" };
    const res = await addKeywordToCalendarOnDate(entry.keyword_id, ctx.projectId, params.newDate);
    return res.success
      ? { success: true, message: `Moved "${entry.focus_keyword}" to ${params.newDate}.`, sideEffect: "calendar.rescheduled" }
      : { success: false, message: `Reschedule failed: ${res.error}`, error: res.error };
  },
};

const vacateDate: Tool<{ date?: string; keyword?: string }> = {
  id: "calendar.vacate",
  description: "Free up a calendar slot — either by date or by keyword. Removes the calendar entry.",
  pages: "all",
  category: "mutate",
  requiresConfirmation: true,
  render: "summary",
  params: [
    { name: "date", type: "date", required: false, description: "ISO date to clear" },
    { name: "keyword", type: "string", required: false, description: "Keyword text to clear" },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    if (!params.date && !params.keyword)
      return { success: false, message: "Provide a date or a keyword to vacate.", error: "missing_arg" };
    const res = await vacateCalendarSlot({ projectId: ctx.projectId, date: params.date, keyword: params.keyword });
    return res.success
      ? { success: true, message: `Vacated ${res.removed} calendar slot(s).`, data: { removed: res.removed }, sideEffect: "calendar.deleted" }
      : { success: false, message: res.error ?? "Failed", error: res.error };
  },
};

const scheduleRemaining: Tool<{ startDate?: string; cadenceDays?: number; limit?: number }> = {
  id: "calendar.scheduleRemaining",
  description:
    "Bulk-schedule every approved keyword that isn't on the calendar yet. The agent fills upcoming slots one keyword at a time.",
  pages: "all",
  category: "mutate",
  requiresConfirmation: true,
  render: "list",
  params: [
    { name: "startDate", type: "date", required: false, description: "First slot to use; defaults to tomorrow" },
    { name: "cadenceDays", type: "number", required: false, default: 3, description: "Gap between entries (days)" },
    { name: "limit", type: "number", required: false, default: 30, description: "Max entries to create" },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const res = await scheduleRemainingApprovedKeywords({
      projectId: ctx.projectId,
      startDate: params.startDate,
      cadenceDays: params.cadenceDays ?? 3,
      limit: params.limit ?? 30,
    });
    return res.success
      ? {
          success: true,
          message: res.scheduled
            ? `Scheduled ${res.scheduled} approved keyword(s).`
            : "No approved keywords were waiting to be scheduled.",
          data: { entries: res.entries },
          sideEffect: "calendar.bulk.created",
        }
      : { success: false, message: res.error ?? "Failed", error: res.error };
  },
};

const setEntryStatus: Tool<{ keyword: string; status: string }> = {
  id: "calendar.setStatus",
  description: "Change the status of a calendar entry (e.g. mark a blog as 'approved' or 'published').",
  pages: "all",
  category: "mutate",
  render: "summary",
  params: [
    { name: "keyword", type: "string", required: true, description: "Keyword of the entry" },
    {
      name: "status",
      type: "string",
      required: true,
      description: "New status",
      enum: ["scheduled", "generating", "generated", "downloaded", "approved", "published"],
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const entry = ctx.context.calendarData.find(
      e => e.focus_keyword.toLowerCase().trim() === params.keyword.toLowerCase().trim()
    );
    if (!entry) return { success: false, message: `No entry found for "${params.keyword}".`, error: "not_found" };
    const res = await updateCalendarEntryStatus(entry.id, params.status as Parameters<typeof updateCalendarEntryStatus>[1]);
    return res.success
      ? { success: true, message: `Set "${entry.focus_keyword}" status to ${params.status}.`, sideEffect: "calendar.status" }
      : { success: false, message: res.error ?? "Failed", error: res.error };
  },
};

const startBlogGeneration: Tool<{ keyword: string; wordCount?: number; writerNotes?: string }> = {
  id: "calendar.generateBlog",
  description: "Kick off blog generation for a calendar entry by keyword. Returns once the blog is generated.",
  pages: "all",
  category: "mutate",
  requiresConfirmation: true,
  render: "summary",
  params: [
    { name: "keyword", type: "string", required: true, description: "Keyword on the calendar" },
    { name: "wordCount", type: "number", required: false, default: 2500, description: "Target word count" },
    {
      name: "writerNotes",
      type: "string",
      required: false,
      description: "Optional personalization / angle instructions from the user (tone, audience, must-cover points).",
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const entry = ctx.context.calendarData.find(
      e => e.focus_keyword.toLowerCase().trim() === params.keyword.toLowerCase().trim()
    );
    if (!entry) return { success: false, message: `No entry found for "${params.keyword}".`, error: "not_found" };
    const res = await generateBlog(entry.id, params.wordCount ?? 2500, params.writerNotes);
    return res?.success
      ? { success: true, message: `Generated blog for "${entry.focus_keyword}".`, data: { blogId: res.data?.id }, sideEffect: "blog.generated" }
      : { success: false, message: res?.error ?? "Generation failed", error: res?.error };
  },
};

// ─── BLOGS ─────────────────────────────────────────────────────────────────

const fixSeoIssue: Tool<{ issueKey: string }> = {
  id: "blog.fixSeoIssue",
  description:
    "Surgically fix a single failing SEO check on the currently open blog. Issue keys: title_keyword, intro_keyword, meta_keyword, meta_length, word_count, h2_structure, h3_structure, faq, external_links, internal_links, keyword_density.",
  pages: ["blogs"],
  category: "mutate",
  render: "summary",
  params: [
    {
      name: "issueKey",
      type: "string",
      required: true,
      description: "Which SEO check to fix",
      enum: [
        "title_keyword",
        "intro_keyword",
        "meta_keyword",
        "meta_length",
        "word_count",
        "h2_structure",
        "h3_structure",
        "faq",
        "external_links",
        "internal_links",
        "keyword_density",
      ],
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    if (!ctx.blogId) return { success: false, message: "No blog is open in the editor.", error: "no_blog" };
    const res = await fixBlogSeoIssue(ctx.blogId, params.issueKey as BlogSeoIssueKey);
    return res.success
      ? { success: true, message: `Applied AI fix for "${params.issueKey}".`, sideEffect: "blog.seoFix" }
      : { success: false, message: res.error ?? "Fix failed", error: res.error };
  },
};

const editParagraph: Tool<{ paragraphIndex: number; instruction: string }> = {
  id: "blog.editParagraph",
  description:
    "Rewrite ONE specific paragraph (1-indexed) following the user's instruction. Use when the user says 'change paragraph N' or 'rewrite the Nth paragraph'.",
  pages: ["blogs"],
  category: "mutate",
  render: "diff",
  params: [
    { name: "paragraphIndex", type: "number", required: true, description: "1-based paragraph index" },
    { name: "instruction", type: "string", required: true, description: "What to change about that paragraph" },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    if (!ctx.blogId) return { success: false, message: "No blog is open.", error: "no_blog" };
    const res = await editBlogParagraph(ctx.blogId, params.paragraphIndex, params.instruction);
    return res.success
      ? {
          success: true,
          message: `Rewrote paragraph ${params.paragraphIndex}.`,
          data: { before: res.before, after: res.after },
          sideEffect: "blog.editParagraph",
        }
      : { success: false, message: res.error ?? "Edit failed", error: res.error };
  },
};

const editSection: Tool<{ heading: string; instruction: string }> = {
  id: "blog.editSection",
  description:
    "Rewrite or expand a whole H2 section identified by its heading text. Use when the user says 'expand the section about X' or 'change the H2 about Y'.",
  pages: ["blogs"],
  category: "mutate",
  render: "summary",
  params: [
    { name: "heading", type: "string", required: true, description: "Heading text or partial match" },
    { name: "instruction", type: "string", required: true, description: "What to change" },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    if (!ctx.blogId) return { success: false, message: "No blog is open.", error: "no_blog" };
    const res = await editBlogSection(ctx.blogId, params.heading, params.instruction);
    return res.success
      ? { success: true, message: `Updated section "${res.section ?? params.heading}".`, sideEffect: "blog.editSection" }
      : { success: false, message: res.error ?? "Edit failed", error: res.error };
  },
};

const addInternalLinks: Tool<{ count?: number }> = {
  id: "blog.addInternalLinks",
  description: "Add internal links from the project's brief link pool to the open blog (default 2).",
  pages: ["blogs"],
  category: "mutate",
  render: "summary",
  params: [{ name: "count", type: "number", required: false, default: 2, description: "Number of links to add" }],
  async execute(params, ctx): Promise<ToolResult> {
    if (!ctx.blogId) return { success: false, message: "No blog is open.", error: "no_blog" };
    const res = await addInternalLinksToBlog(ctx.blogId, params.count ?? 2);
    return res.success
      ? { success: true, message: `Added ${res.added} internal link(s).`, data: { added: res.added }, sideEffect: "blog.internalLinks" }
      : { success: false, message: res.error ?? "Failed", error: res.error };
  },
};

const addCitations: Tool<{ sources?: string[] }> = {
  id: "blog.addCitations",
  description:
    "Add credible external citations to factual claims in the open blog. Default sources: McKinsey, Gartner, Deloitte, SHRM, etc.",
  pages: ["blogs"],
  category: "mutate",
  render: "summary",
  params: [{ name: "sources", type: "string[]", required: false, description: "Preferred source publications" }],
  async execute(params, ctx): Promise<ToolResult> {
    if (!ctx.blogId) return { success: false, message: "No blog is open.", error: "no_blog" };
    const res = await addCitationsToBlog(ctx.blogId, params.sources);
    return res.success
      ? { success: true, message: `Added ${res.added} citation(s).`, data: { added: res.added }, sideEffect: "blog.citations" }
      : { success: false, message: res.error ?? "Failed", error: res.error };
  },
};

const applyInstructionToBlog: Tool<{ instruction: string }> = {
  id: "blog.applyInstruction",
  description:
    "Apply a free-form, narrow editing instruction to the open blog when no other blog tool fits (e.g. 'make the tone more conversational', 'tighten the intro').",
  pages: ["blogs"],
  category: "mutate",
  requiresConfirmation: false,
  render: "summary",
  params: [{ name: "instruction", type: "string", required: true, description: "What to change" }],
  async execute(params, ctx): Promise<ToolResult> {
    if (!ctx.blogId) return { success: false, message: "No blog is open.", error: "no_blog" };
    const res = await applyBlogInstruction(ctx.blogId, params.instruction);
    return res.success
      ? { success: true, message: `Applied: ${params.instruction}`, sideEffect: "blog.applyInstruction" }
      : { success: false, message: res.error ?? "Failed", error: res.error };
  },
};

const setBlogStatus: Tool<{ status: string }> = {
  id: "blog.setStatus",
  description: "Change the status of the currently open blog (generated/approved/published).",
  pages: ["blogs"],
  category: "mutate",
  render: "summary",
  params: [
    {
      name: "status",
      type: "string",
      required: true,
      description: "Blog status",
      enum: ["generated", "approved", "published"],
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    if (!ctx.blogId) return { success: false, message: "No blog is open.", error: "no_blog" };
    const res = await updateBlogStatus(ctx.blogId, params.status as "generated" | "approved" | "published");
    return res.success
      ? { success: true, message: `Set blog status to ${params.status}.`, sideEffect: "blog.status" }
      : { success: false, message: res.error ?? "Failed", error: res.error };
  },
};

const blogSuggest: Tool = {
  id: "blogs.recommend",
  description: "Recommend which blog to write or improve next using the existing blog-strategy agent.",
  pages: "all",
  category: "analyze",
  render: "cards",
  params: [],
  async execute(_p, ctx): Promise<ToolResult> {
    const out = await runBlogAgent(ctx.context, ctx.userPrompt ?? "");
    return { success: true, message: out.summary, data: { suggestions: out.suggestions, actions: out.actions } };
  },
};

// ─── AUDIT ─────────────────────────────────────────────────────────────────

const auditDiscoverPages: Tool<{ basePath?: string }> = {
  id: "audit.discoverPages",
  description:
    "Discover all content pages from the project's sitemap. Returns pages grouped by base path (/blog, /blogs, /hr-glossary, etc.). Optionally filter by base path.",
  pages: "all",
  category: "read",
  render: "list",
  params: [
    { name: "basePath", type: "string", required: false, description: "Optional base path filter, e.g. '/blog'" },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const res = await getAllSitemapPages(ctx.projectId, params.basePath);
    if (!res.success) return { success: false, message: res.error ?? "Failed", error: res.error };
    const audited = res.pages.filter(p => p.audited).length;
    const pending = res.pages.length - audited;
    return {
      success: true,
      message: `Found ${res.total} content pages total (${res.pages.length} in current filter). ${audited} already audited, ${pending} pending.`,
      data: {
        total: res.total,
        basePaths: res.basePaths,
        pages: res.pages.slice(0, 20).map(p => ({
          url: p.url,
          basePath: p.basePath,
          audited: p.audited,
          healthScore: p.healthScore,
          severity: p.severity,
          primaryKeyword: p.primaryKeyword,
        })),
      },
    };
  },
};

const auditSelectedPages: Tool<{ urls: string[] }> = {
  id: "audit.scrapeSelected",
  description:
    "Audit 1–5 specific URLs. Use when the user says 'audit this page', 'check this URL', or asks to audit specific pages they've selected.",
  pages: ["audit"],
  category: "research",
  requiresConfirmation: true,
  render: "summary",
  params: [
    { name: "urls", type: "string[]", required: true, description: "Array of 1-5 URLs to audit" },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    if (params.urls.length > 5) return { success: false, message: "Maximum 5 URLs per audit batch.", error: "limit" };
    const res = await auditSelectedUrls(ctx.projectId, params.urls);
    return res.success
      ? {
          success: true,
          message: `Audited ${res.audited} page(s)${res.failed ? `, ${res.failed} failed` : ""}.`,
          data: { audited: res.audited, failed: res.failed, results: res.results.map(r => ({ url: r.url, score: r.health_score, severity: r.severity, keyword: r.primary_keyword })) },
          sideEffect: "audit.batch",
        }
      : { success: false, message: res.error ?? "Failed", error: res.error };
  },
};

const auditAnalyze: Tool = {
  id: "audit.analyze",
  description: "Analyse content health audits and surface highest-severity issues.",
  pages: "all",
  category: "analyze",
  render: "cards",
  params: [],
  async execute(_p, ctx): Promise<ToolResult> {
    const out = await runContentAuditAgent(ctx.context, ctx.userPrompt ?? "");
    return { success: true, message: out.summary, data: { suggestions: out.suggestions, actions: out.actions } };
  },
};

const auditRunBatch: Tool<{ limit?: number; force?: boolean }> = {
  id: "audit.run",
  description: "Run content health audits on the next batch of blog URLs (default 10).",
  pages: ["audit"],
  category: "research",
  requiresConfirmation: true,
  render: "summary",
  params: [
    { name: "limit", type: "number", required: false, default: 10, description: "How many URLs to audit" },
    { name: "force", type: "boolean", required: false, default: false, description: "Re-audit existing rows too" },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const res = await auditExistingBlogs(ctx.projectId, { limit: params.limit ?? 10, force: params.force });
    return res.success
      ? { success: true, message: `Audited ${res.audited} blog(s) (skipped ${res.skipped}, failed ${res.failed}).`, sideEffect: "audit.batch" }
      : { success: false, message: res.error ?? "Audit failed", error: res.error };
  },
};

const repairAudit: Tool<{ url: string }> = {
  id: "audit.repair",
  description: "Run AI repair on a specific audited blog URL (creates a Repair calendar entry + new blog).",
  pages: ["audit"],
  category: "mutate",
  requiresConfirmation: true,
  render: "summary",
  params: [{ name: "url", type: "string", required: true, description: "URL of the audited blog to repair" }],
  async execute(params, ctx): Promise<ToolResult> {
    const res = await repairBlogFromAudit(ctx.projectId, params.url);
    return res?.success
      ? { success: true, message: `Repair generated for ${params.url}.`, data: { blogId: (res as { blogId?: string }).blogId }, sideEffect: "blog.repair" }
      : { success: false, message: (res as { error?: string })?.error ?? "Repair failed", error: (res as { error?: string })?.error };
  },
};

// ─── PROJECT / BRIEF ───────────────────────────────────────────────────────

const refreshBrief: Tool = {
  id: "project.refreshBrief",
  description: "Re-scrape the user's domain and rebuild the business brief.",
  pages: "all",
  category: "research",
  requiresConfirmation: true,
  render: "summary",
  params: [],
  async execute(_p, ctx): Promise<ToolResult> {
    const res = await generateBusinessBrief(ctx.projectId, { force: true });
    return res?.success
      ? { success: true, message: "Business brief refreshed.", sideEffect: "brief.refresh" }
      : { success: false, message: (res as { error?: string })?.error ?? "Failed", error: (res as { error?: string })?.error };
  },
};

// ─── REGISTRY EXPORT ───────────────────────────────────────────────────────

export const TOOLS: Tool[] = [
  // keywords
  findBestKeywords,
  approveKeyword,
  rejectKeyword,
  bulkApproveKeywords,
  deleteKeywordTool,
  refreshDomainKeywords,
  approveAndSchedule,
  // competitors
  findCompetitorOpportunities,
  scheduleCompetitorGap,
  // calendar
  listCalendarOnDate,
  listCalendarUpcoming,
  listCalendarByStatus,
  rescheduleEntry,
  vacateDate,
  scheduleRemaining,
  setEntryStatus,
  startBlogGeneration,
  // blogs
  blogSuggest,
  fixSeoIssue,
  editParagraph,
  editSection,
  addInternalLinks,
  addCitations,
  applyInstructionToBlog,
  setBlogStatus,
  // audit
  auditDiscoverPages,
  auditSelectedPages,
  auditAnalyze,
  auditRunBatch,
  repairAudit,
  // project
  refreshBrief,
];

export function toolsForPage(page: string): Tool[] {
  return TOOLS.filter(t => t.pages === "all" || (Array.isArray(t.pages) && t.pages.includes(page as never)));
}

export function findTool(id: string): Tool | undefined {
  return TOOLS.find(t => t.id === id);
}

/** LLM-facing catalogue: minimal JSON the model can read in its prompt. */
export function toolCatalogueFor(page: string): Array<{
  id: string;
  description: string;
  category: string;
  params: Array<{ name: string; type: string; required: boolean; description: string; enum?: string[] }>;
  requiresConfirmation: boolean;
}> {
  return toolsForPage(page).map(t => ({
    id: t.id,
    description: t.description,
    category: t.category,
    params: t.params.map(p => ({ name: p.name, type: p.type, required: p.required, description: p.description, enum: p.enum })),
    requiresConfirmation: Boolean(t.requiresConfirmation),
  }));
}

export type { Tool, ToolContext, ToolResult };
