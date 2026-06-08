import type { Project } from "../types";

export function buildGapAnalysisPrompt(
  project: Project,
  ind: string,
  gapLines: string
): string {
  return `You are a senior SEO and content strategist.

OUR SITE
- Domain: ${project.domain}
- Company: ${project.company}
- Niche: ${project.niche}
- Audience: ${project.target_audience}
- Region / language: ${project.target_region} / ${project.target_language}

INDUSTRY KEYWORDS (from our research — statuses may be pending, approved, or rejected):
${ind || '(none)'}

COMPETITOR GAP SIGNALS (pages and queries competitors lean on that we may not cover):
${gapLines || '(none)'}

Write:
1) ## Where competitors look stronger
Short bullets: themes or intents suggested by their content vs our keyword set.

2) ## Gaps on our side
Short bullets: content angles or clusters we should add or deepen.

3) ## What to publish first
Numbered list: 8–15 concrete priorities tied to demand.

Then output ONE JSON object on its own line after this exact marker (no code fences):
---CLUSTER---
{"prioritized_keywords":["phrase", "..."]}

JSON rules:
- 12–28 strings in prioritized_keywords.
- Each string must match (verbatim or trivial spacing case) a keyword from the INDUSTRY or COMPETITOR lists above.
- Order = recommended publishing order for one cohesive monthly cluster.`;
}
