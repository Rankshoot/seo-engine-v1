import {
  Search, Target, Workflow, Wand2, Activity, Bot,
  Globe2, TrendingUp, Zap, DollarSign, Clock, BarChart3,
} from "lucide-react";

export const mockKeywords = [
  { keyword: "AI recruitment platform", volume: "8.1K", difficulty: 42, trend: "+24%", score: 92, intent: "Commercial" },
  { keyword: "automated hiring software", volume: "5.4K", difficulty: 38, trend: "+18%", score: 87, intent: "Commercial" },
  { keyword: "HR automation tools 2026", volume: "3.2K", difficulty: 55, trend: "+12%", score: 78, intent: "Informational" },
  { keyword: "AI candidate screening", volume: "2.9K", difficulty: 31, trend: "+32%", score: 85, intent: "Informational" },
  { keyword: "recruitment CRM comparison", volume: "1.8K", difficulty: 67, trend: "+8%", score: 64, intent: "Commercial" },
];

export const features = [
  { 
    icon: Search,
    sub: "Find what ranks",
    title: "Keyword Intelligence",
    desc: "Live Ahrefs + DataForSEO data. Intent classified. Funnel-mapped. Filtered against your brief so every keyword has a real reason to rank.",
  },
  {
    icon: Target,
    sub: "Own your competitors' traffic",
    title: "Gap Analysis",
    desc: "Crawl competitors, surface weak pages, surface opportunities you can ship before they catch up.",
  },
  {
    icon: Workflow,
    sub: "Ship without the chaos",
    title: "AI Editorial Calendar",
    desc: "30-day calendar fills itself. Drag to reschedule. AI suggests cadence based on your capacity.",
  },
  {
    icon: Wand2,
    sub: "Content Google rewards",
    title: "AI Content Studio",
    desc: "Blogs, ebooks, whitepapers, LinkedIn — with JSON-LD schema, internal links, and E-E-A-T citations baked in.",
  },
  {
    icon: Activity,
    sub: "Never lose a ranking silently",
    title: "Content Health Audit",
    desc: "Auto-audit live URLs. Fix priorities ranked by traffic impact. Built for AI Overviews coverage.",
  },
  {
    icon: Bot,
    sub: "Strategy on tap",
    title: "Contextual AI Copilot",
    desc: "Lives on every page. Knows your brief, keywords, competitors, and calendar — gives specific advice, not generic prompts.",
  },
];

export const workflowOutcomes = [
  {
    phase: "Day 1",
    icon: Globe2,
    title: "Brief your business in 15 min",
    desc: "Paste your domain. Add 2–3 competitors. Describe your product. Rankshoot scrapes, synthesizes, and briefs everything else automatically.",
    outcome: "Your competitive landscape, mapped.",
  },
  {
    phase: "Week 1",
    icon: Search,
    title: "AI discovers 200+ ranked keywords",
    desc: "Live data from Ahrefs + DataForSEO, filtered to keywords your business can realistically rank for — sorted by traffic opportunity.",
    outcome: "Your first keyword set, ready to approve.",
  },
  {
    phase: "Month 1",
    icon: TrendingUp,
    title: "Content published, traffic climbing",
    desc: "Every approved keyword becomes a GEO+SEO-optimised blog. Your 30-day calendar fills. Organic sessions start climbing week-over-week.",
    outcome: "Real traffic. Real rankings.",
  },
  {
    phase: "Month 3+",
    icon: Zap,
    title: "Compounding organic growth",
    desc: "Each piece builds authority for the next. Rankings compound. AI Overviews coverage grows. Your competitors can't catch up manually.",
    outcome: "The flywheel spins — you don't have to.",
  },
];

export const stats = [
  { value: "94%", label: "AI Overviews coverage" },
  { value: "10×", label: "Faster to published" },
  { value: "30+", label: "SEO checks per asset" },
  { value: "5", label: "Content formats" },
];

export const integrations = [
  { name: "Ahrefs", role: "Keyword + backlink intelligence" },
  { name: "DataForSEO", role: "SERP + search volume data" },
  { name: "Serper", role: "Live SERP + People Also Ask" },
  { name: "Jina Reader", role: "Competitor page crawling" },
  { name: "Google KP", role: "Keyword demand validation" },
  { name: "AI Engine", role: "Brief synthesis + long-form content" },
  { name: "JSON-LD", role: "Article + FAQ schema, auto-injected" },
];

export const navItems = [
  { label: "Features", href: "#features" },
  { label: "Workflow", href: "#workflow" },
  { label: "Demo", href: "#preview" },
  { label: "Blog", href: "/blog" },
  { label: "Pricing", href: "#pricing" },
];

export const testimonials = [
  {
    quote: "Rankshoot cut our content production time by 70%. We went from one blog a week to five — and our organic traffic doubled in 90 days.",
    name: "Sarah Chen",
    title: "Head of Content",
    company: "Acme SaaS",
    avatar: "SC",
    stars: 5,
  },
  {
    quote: "The AI Overview coverage is real. 8 of 10 articles we generated show up in Google's AI answers within 30 days of publishing.",
    name: "Marcus Rodriguez",
    title: "SEO Lead",
    company: "GrowthLabs",
    avatar: "MR",
    stars: 5,
  },
  {
    quote: "We replaced 4 separate SEO tools with Rankshoot. The contextual copilot alone saves our team 20+ hours per week of back-and-forth.",
    name: "Priya Sharma",
    title: "Marketing Director",
    company: "TechFlow Inc.",
    avatar: "PS",
    stars: 5,
  },
];

export const painPoints = [
  {
    icon: DollarSign,
    cost: "$500+/mo",
    costLabel: "in fragmented tools",
    title: "Paying for 5 tools that don't talk to each other",
    details: [
      { tool: "Ahrefs", price: "$149/mo", note: "just for keyword data" },
      { tool: "Clearscope", price: "$189/mo", note: "just to optimize content" },
      { tool: "ChatGPT Pro", price: "$20/mo", note: "+ hours of prompt writing" },
    ],
    fix: "Rankshoot replaces all three — keyword discovery, AI writing, and optimization — starting at a fraction of the cost.",
  },
  {
    icon: Clock,
    cost: "15+ hrs",
    costLabel: "lost every week",
    title: "Manual research that should take 15 minutes",
    details: [
      { tool: "Keyword research", price: "4–6 hrs", note: "spreadsheet wrangling" },
      { tool: "Competitor analysis", price: "3–4 hrs", note: "manual crawling" },
      { tool: "Brief writing", price: "2–3 hrs", note: "before a word is written" },
    ],
    fix: "Rankshoot automates every step from domain input to publish-ready brief — in under 15 minutes.",
  },
  {
    icon: BarChart3,
    cost: "73%",
    costLabel: "of content earns zero clicks",
    title: "Publishing into the void with no demand signal",
    details: [
      { tool: "No keyword validation", price: "zero traffic", note: "pure guesswork" },
      { tool: "No SEO structure", price: "no ranking", note: "missing schema & links" },
      { tool: "No AI Overview focus", price: "invisible", note: "in 2026 search results" },
    ],
    fix: "Every Rankshoot blog targets verified demand, ships with JSON-LD schema, and is optimised for AI Overviews by default.",
  },
];

export const faqs = [
  {
    q: "How is Rankshoot different from Surfer SEO or Clearscope?",
    a: "Surfer and Clearscope are content optimization tools — you still find keywords, write, and manage publishing separately. Rankshoot is end-to-end: keyword discovery → competitor analysis → calendar → AI content generation → audit → publish. One pipeline, all informed by your business brief.",
  },
  {
    q: "How long does setup take?",
    a: "Under 15 minutes. Paste your domain, add 2–3 competitors, describe your audience — Rankshoot builds your brief automatically, crawls your competitive landscape, and surfaces your first high-ROI keyword opportunities. No API configuration required.",
  },
  {
    q: "Can I publish directly from Rankshoot to my CMS?",
    a: "Rankshoot exports in 5 formats: Markdown, HTML, DOCX, plain text, and structured JSON with metadata. One-click CMS integrations are on the roadmap. The structured output makes copy-pasting into any CMS a 2-minute job.",
  },
  {
    q: "Is my content data secure?",
    a: "Yes. All data is stored with enterprise-grade security, isolated per project with row-level access control. Your business brief and generated content are never used to train AI models.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Absolutely. Month-to-month billing, no contracts, cancel from your dashboard in 30 seconds. Cancel within your 14-day trial and you're never charged. We want you to stay because Rankshoot works — not because you forgot to unsubscribe.",
  },
];

export const integrationLogos = [
  { name: "Ahrefs", logoUrl: "https://logo.clearbit.com/ahrefs.com", abbr: "Ah", color: "#F97316", bg: "rgba(249,115,22,0.10)" },
  { name: "DataForSEO", logoUrl: "https://logo.clearbit.com/dataforseo.com", abbr: "DS", color: "#3B82F6", bg: "rgba(59,130,246,0.10)" },
  { name: "Serper", logoUrl: "https://logo.clearbit.com/serper.dev", abbr: "Se", color: "#10B981", bg: "rgba(16,185,129,0.10)" },
  { name: "Jina Reader", logoUrl: "https://logo.clearbit.com/jina.ai", abbr: "Ji", color: "#8B5CF6", bg: "rgba(139,92,246,0.10)" },
  { name: "Google KP", logoUrl: "https://www.google.com/s2/favicons?domain=google.com&sz=64", abbr: "G", color: "#EA4335", bg: "rgba(234,67,53,0.10)" },
];

export const marqueItems = [
  ...integrationLogos, ...integrationLogos,
  ...integrationLogos, ...integrationLogos,
];
