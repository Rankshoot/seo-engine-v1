import type { LinkedInPostStyle } from "@/lib/types";

export const EBOOK_TONES = [
  { id: "premium-educational", label: "Premium · educational" },
  { id: "founder-narrative", label: "Founder · narrative" },
  { id: "analyst-formal", label: "Analyst · formal" },
  { id: "friendly-expert", label: "Friendly · expert" },
] as const;

export const EBOOK_DEPTH_OPTIONS = [
  { id: "concise", label: "Concise", hint: "5–6 chapters · 5k words" },
  { id: "standard", label: "Standard", hint: "7–8 chapters · 8k words" },
  { id: "deep", label: "Deep dive", hint: "9–11 chapters · 14k+ words" },
] as const;

export const EBOOK_LANG_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "hi", label: "Hindi" },
  { code: "pt", label: "Portuguese" },
] as const;

export const WP_DEPTH_OPTIONS = [
  { id: "executive", label: "Executive", hint: "C-suite / VP — plain English" },
  { id: "analyst", label: "Analyst", hint: "Senior managers — methodology" },
  { id: "engineering", label: "Engineering", hint: "Practitioners — technical depth" },
] as const;

export const WP_LANG_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
] as const;

export const LINKEDIN_STYLE_OPTIONS: { id: LinkedInPostStyle; label: string; hint: string }[] = [
  { id: "educational", label: "Educational", hint: "Counter-intuitive insight + a frame the reader keeps" },
  { id: "founder", label: "Founder", hint: "Real, specific moment + the lesson" },
  { id: "industry_insight", label: "Industry insight", hint: "Fresh data + what most miss" },
  { id: "storytelling", label: "Storytelling", hint: "Three short scenes — implicit lesson" },
  { id: "list", label: "List", hint: "5–8 short items + meta lesson" },
  { id: "carousel", label: "Carousel-ready", hint: "6–9 chunks, slide-sized" },
];

export const LINKEDIN_VOICE_OPTIONS = [
  { id: "first_person" as const, label: "First person", hint: "Sounds like a founder writing" },
  { id: "company" as const, label: "Brand voice", hint: "Sounds like the company" },
];

export const LINKEDIN_TONE_OPTIONS = [
  "Confident · plain-spoken",
  "Curious · analytical",
  "Provocative · sharp",
  "Warm · human",
  "Numbers-first · precise",
];
