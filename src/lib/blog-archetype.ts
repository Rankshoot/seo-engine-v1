import type { FunnelStage } from '@/lib/keyword-funnel';
import { effectiveKeywordFunnelStage } from '@/lib/keyword-funnel';

/**
 * Blog archetypes — the "shape" a piece should take.
 *
 * The old prompt forced every article into one fixed wireframe (hook → answer
 * box → N H2s each with a bold snippet → question-H2s → FAQ → Key Takeaways),
 * which made every blog feel identical. Instead we pick a shape from the
 * keyword's phrasing + intent + (optionally) the SERP, and hand the model a
 * distinct structural *direction* plus ranged targets it balances — not rigid
 * quotas. Selection is deterministic, so it adds zero API cost.
 */
export type BlogArchetypeId =
  | 'how_to'
  | 'comparison'
  | 'definitional'
  | 'listicle'
  | 'opinion'
  | 'case_study'
  | 'deep_dive';

/** Ranged structural targets. Every value is a soft "aim for", never a hard gate. */
export interface ArchetypeStructure {
  h2Min: number;
  h2Max: number;
  h3Min: number;
  faqMin: number;
  faqMax: number;
  faqSeedMin: number;
  extMin: number;
  extMax: number;
  intMin: number;
  intMax: number;
  /** How many H2s should be phrased as real user questions (AEO). 0 = don't force any. */
  questionH2Min: number;
  factsMin: number;
  summaryBulletsMin: number;
  summaryBulletsMax: number;
}

export interface BlogArchetype {
  id: BlogArchetypeId;
  label: string;
  funnelStage: FunnelStage;
  /** Prose guidance describing the specific shape/flow/opening for THIS piece. */
  directive: string;
  structure: ArchetypeStructure;
}

export interface ArchetypeSelectionInput {
  focusKeyword: string;
  articleType?: string;
  /** SERP intent label from keyword data ("informational" | "commercial" | ...). */
  keywordIntent?: string | null;
  /** Stored TOFU/MOFU/BOFU, if known. */
  funnelStage?: string | null;
  wordCount: number;
  /** Titles of the top-ranking competitor articles, used to nudge shape from the live SERP. */
  serpTitles?: string[];
}

/** Base structural budget by length. Archetype modifiers are applied on top. */
function baseStructure(words: number): ArchetypeStructure {
  if (words < 800) {
    return {
      h2Min: 2, h2Max: 4, h3Min: 0,
      faqMin: 2, faqMax: 3, faqSeedMin: 1,
      extMin: 1, extMax: 3, intMin: 1, intMax: 3,
      questionH2Min: 1, factsMin: 2,
      summaryBulletsMin: 3, summaryBulletsMax: 4,
    };
  }
  if (words < 1500) {
    return {
      h2Min: 3, h2Max: 6, h3Min: 1,
      faqMin: 3, faqMax: 5, faqSeedMin: 2,
      extMin: 2, extMax: 4, intMin: 2, intMax: 4,
      questionH2Min: 2, factsMin: 4,
      summaryBulletsMin: 4, summaryBulletsMax: 5,
    };
  }
  return {
    h2Min: 5, h2Max: 8, h3Min: 2,
    faqMin: 5, faqMax: 8, faqSeedMin: 3,
    extMin: 3, extMax: 7, intMin: 3, intMax: 6,
    questionH2Min: 3, factsMin: 6,
    summaryBulletsMin: 5, summaryBulletsMax: 7,
  };
}

const LISTICLE_NUM = /\b(\d{1,3})\s+(ways|tips|ideas|examples|types|kinds|strategies|tools|steps|reasons|mistakes|benefits|trends)\b/i;

/** Deterministically classify a keyword into a content shape. */
function classifyArchetype(input: ArchetypeSelectionInput): BlogArchetypeId {
  const k = input.focusKeyword.toLowerCase().trim();
  const intent = (input.keywordIntent || '').toLowerCase();
  const serp = (input.serpTitles || []).join(' • ').toLowerCase();

  // Explicit list intent in the keyword wins. A leading number ("10 employee
  // retention strategies", "7 best CRMs") is a strong listicle signal even when
  // the list-noun isn't adjacent to the number.
  if (
    LISTICLE_NUM.test(k) ||
    /^\d{1,3}\s+\w/.test(k) ||
    /\b(examples|ideas|types of|kinds of|list of|tools for|tips)\b/.test(k)
  ) {
    return 'listicle';
  }
  // Comparison / evaluation.
  if (
    intent === 'commercial' ||
    /\b(vs|versus|compared to|comparison|best|top \d+|alternatives?|which is better)\b/.test(k)
  ) {
    return 'comparison';
  }
  // Procedural.
  if (/^(how to|how do|how can|how should)\b/.test(k) || /\b(step by step|guide to|tutorial|checklist|process|setup|set up)\b/.test(k)) {
    return 'how_to';
  }
  // Definition / concept explainer.
  if (/^(what is|what are|what does|meaning of|definition of)\b/.test(k) || /\b(explained|meaning|definition)\b/.test(k)) {
    return 'definitional';
  }
  // Case / example driven.
  if (/\b(case study|success story|example of|how .+ (did|built|grew|scaled))\b/.test(k) || /case stud/.test(serp)) {
    return 'case_study';
  }
  // Opinion / thought-leadership / trend.
  if (/^(why|should|is it worth)\b/.test(k) || /\b(future of|trends|predictions|myths|mistakes|worth it)\b/.test(k)) {
    return 'opinion';
  }
  // SERP nudge: if the ranking pages are clearly listicles, follow suit.
  if (LISTICLE_NUM.test(serp)) return 'listicle';

  return 'deep_dive';
}

/** Apply per-archetype tweaks to the base structural budget. */
function tuneStructure(id: BlogArchetypeId, base: ArchetypeStructure): ArchetypeStructure {
  const s = { ...base };
  switch (id) {
    case 'listicle':
      s.h2Min = Math.max(s.h2Min, base.h2Max - 1); // lists have more sections
      s.questionH2Min = Math.max(0, s.questionH2Min - 1);
      break;
    case 'comparison':
      s.questionH2Min = Math.max(1, s.questionH2Min - 1);
      break;
    case 'definitional':
      s.questionH2Min = s.questionH2Min + 1; // definitions thrive on question H2s
      break;
    case 'how_to':
      s.questionH2Min = Math.max(1, s.questionH2Min);
      break;
    case 'opinion':
      s.questionH2Min = Math.max(0, s.questionH2Min - 1);
      s.factsMin = s.factsMin + 1; // opinions still need to be grounded in data
      break;
    case 'case_study':
      s.questionH2Min = Math.max(0, s.questionH2Min - 1);
      break;
    case 'deep_dive':
    default:
      break;
  }
  return s;
}

function directiveFor(id: BlogArchetypeId, kw: string): { label: string; directive: string } {
  switch (id) {
    case 'how_to':
      return {
        label: 'How-to / process guide',
        directive: `Shape: a practical, do-this-then-that guide to "${kw}". Open by naming the exact outcome the reader will achieve and the one thing most people get wrong. Structure the core around the real sequence of steps (use a numbered list or clearly ordered H2s), each with the concrete "how", common pitfalls, and what success looks like. Prefer a short checklist or worked example over abstract theory.`,
      };
    case 'comparison':
      return {
        label: 'Comparison / decision guide',
        directive: `Shape: help the reader decide about "${kw}". Lead with a one-line verdict on who each option is best for. Include at least one clean comparison table on the dimensions that actually drive the choice (cost, fit, effort, outcome). Give an honest take on trade-offs — do not hedge — and close with a clear "pick X if…, pick Y if…" recommendation.`,
      };
    case 'definitional':
      return {
        label: 'Definitional explainer',
        directive: `Shape: explain "${kw}" clearly for someone encountering it fresh. Open with a crisp, standalone definition in the first two sentences. Then build understanding progressively: why it matters, how it works, where it's used, and common misconceptions. Use question-phrased H2s that mirror how people actually ask, and a concrete example to make the concept tangible.`,
      };
    case 'listicle':
      return {
        label: 'Curated list',
        directive: `Shape: a genuinely useful list about "${kw}" — not filler entries. Each item gets its own H2 or H3 with a specific reason it earns a place, a real detail or example, and (where relevant) who it's for. Vary the entry rhythm so it doesn't read like a template. Add a short intro framing how you chose the items and a brief closing on how to act on the list.`,
      };
    case 'opinion':
      return {
        label: 'Point-of-view / analysis',
        directive: `Shape: take a clear, defensible position on "${kw}". Open with the contrarian or non-obvious claim, then back it with evidence, data, and reasoning. Acknowledge the strongest counter-argument and answer it. This piece should read like an expert with a spine, not a neutral summary — but every strong claim must be grounded in a cited fact.`,
      };
    case 'case_study':
      return {
        label: 'Case-led narrative',
        directive: `Shape: teach through a concrete example around "${kw}". Set up the situation and the problem, walk through what was actually done and why, and quantify the outcome with real numbers where possible. Pull out transferable lessons the reader can apply. Keep it a story with a spine, not a bulleted feature list.`,
      };
    case 'deep_dive':
    default:
      return {
        label: 'Comprehensive deep dive',
        directive: `Shape: the definitive, well-rounded resource on "${kw}". Cover the topic from the angles a knowledgeable reader expects, in an order that builds logically. Bring at least one original synthesis, framework, or angle competitors miss. Balance depth with scannability — mix prose, the occasional table or list, and clear section boundaries.`,
      };
  }
}

/**
 * Picks the blog archetype for a piece. Deterministic and cost-free — safe to
 * call inside prompt assembly. Callers that know the keyword's intent/funnel
 * (from the joined `keywords` row) should pass them; otherwise we derive the
 * funnel stage from the keyword text.
 */
export function selectBlogArchetype(input: ArchetypeSelectionInput): BlogArchetype {
  const id = classifyArchetype(input);
  const funnelStage = effectiveKeywordFunnelStage(
    input.funnelStage,
    input.keywordIntent || '',
    input.focusKeyword
  );
  const structure = tuneStructure(id, baseStructure(input.wordCount));
  const { label, directive } = directiveFor(id, input.focusKeyword.trim());
  return { id, label, funnelStage, directive, structure };
}
