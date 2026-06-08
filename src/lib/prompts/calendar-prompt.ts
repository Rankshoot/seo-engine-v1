import type { Project } from "../types";

export function buildCalendarPrompt(
  project: Project,
  actualDays: number,
  assignments: Array<{ day: number; date: string; keyword: string; article_type: string }>
): string {
  return `You are an SEO content strategist. Complete this content calendar by adding a title and slug for each entry.

PROJECT: ${project.company} | ${project.niche} | Audience: ${project.target_audience}

ENTRIES TO COMPLETE (${actualDays} entries):
${assignments.map(a => `Day ${a.day} | ${a.date} | keyword: "${a.keyword}" | type: ${a.article_type}`).join('\n')}

RULES:
- Keep keyword and article_type EXACTLY as given
- Title must be compelling and specific for that keyword and type
- Slug: lowercase, hyphenated, URL-safe, max 6 words

Return ONLY a JSON array. No markdown. No explanation. No code fences:
[{"day":1,"date":"YYYY-MM-DD","keyword":"exact keyword","title":"Title Here","article_type":"How-to Guide","slug":"title-here"}]`;
}
