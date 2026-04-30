import * as cheerio from 'cheerio';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { chromium, type Browser, type Page } from 'playwright';
import { analyzeWebsiteWithAI, type AIAnalysisResult } from './aiWebsiteAnalyzer';

const quietJsdomConsole = new VirtualConsole();
quietJsdomConsole.on('jsdomError', error => {
  const jsdomError = error as Error & { type?: string };
  if (jsdomError.type === 'css parsing' || /could not parse css stylesheet/i.test(jsdomError.message)) return;
  console.warn('[hybridScraper] jsdom warning:', error.message);
});

export interface ScrapedBlogPost {
  url: string;
  title: string;
  summary: string;
}

export interface HybridScraperResult extends AIAnalysisResult {
  url: string;
  title: string;
  metaDescription: string;
  headings: { h1: number; h2: number; h3: number };
  contentSummary: string;
  wordCount: number;
  internalLinks: string[];
  externalLinks: string[];
  blogPosts: ScrapedBlogPost[];
}

/**
 * Fetch HTML using native fetch with retries and timeout.
 */
async function fetchHtmlWithRetries(url: string, retries = 2, timeoutMs = 10000): Promise<string | null> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        throw new Error(`Bot protected or forbidden (${res.status})`);
      }
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const text = await res.text();
    // Very basic check if it's an empty SPA root. 
    // SPAs generally have < 500 bytes inside <body> or very few tags.
    const hasEnoughContent = text.length > 1000 && text.includes('</');
    if (!hasEnoughContent) {
      throw new Error('Possible SPA with empty root, fallback to Playwright');
    }
    return text;
  } catch (error) {
    if (retries > 0) {
      console.warn(`[hybridScraper] Fetch failed for ${url}, retrying... (${retries} left)`);
      return fetchHtmlWithRetries(url, retries - 1, timeoutMs);
    }
    console.warn(`[hybridScraper] Fetch exhausted retries for ${url}. Error: ${(error as Error).message}`);
    return null;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Fetch HTML using Playwright (fallback mechanism).
 */
let playwrightAvailable = true;
async function fetchHtmlWithPlaywright(url: string): Promise<string | null> {
  if (!playwrightAvailable) return null;
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page: Page = await browser.newPage();
    // Set typical viewport and user agent to avoid basic blocks
    await page.setViewportSize({ width: 1280, height: 800 });
    // Go to URL and wait until no more than 2 network connections for at least 500 ms.
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    const content = await page.content();
    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // If the browser executable is missing, disable further attempts for this process.
    if (message.includes('Executable doesn')) {
      playwrightAvailable = false;
      console.warn(
        '[hybridScraper] Playwright not installed (missing browser). Run `npx playwright install chromium` to enable fallback.'
      );
      return null;
    }
    console.error(`[hybridScraper] Playwright fallback failed for ${url}:`, error);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Normalize and categorize links.
 */
function isInternalLink(linkUrl: string, baseUrl: string): boolean {
  try {
    const target = new URL(linkUrl, baseUrl);
    const base = new URL(baseUrl);
    // Same host or subdomain
    return target.hostname === base.hostname || target.hostname.endsWith(`.${base.hostname}`);
  } catch {
    return false; // Invalid URL
  }
}

/**
 * Extract blog links from an array of internal links based on heuristics.
 */
function extractBlogUrls(internalLinks: string[], limit = 5): string[] {
  const blogPattern = /\/(blog|articles|insights|resources|news|post|guides)\/[^/?#]+/i;
  
  // Exclude index pages
  const isNotIndex = (u: string) => !/\/(blog|articles|insights|resources|news|guides)(\/)?$/i.test(new URL(u).pathname);

  const blogUrls = internalLinks.filter(u => {
    try {
      const urlObj = new URL(u);
      return blogPattern.test(urlObj.pathname) && isNotIndex(u);
    } catch {
      return false;
    }
  });

  // Deduplicate and limit
  return [...new Set(blogUrls)].slice(0, limit);
}

/**
 * Parses raw HTML, extracting metadata, content, and links.
 */
function parseWebsiteHtml(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  
  const title = $('title').text().trim() || $('meta[property="og:title"]').attr('content') || '';
  const metaDescription = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';

  const headings = {
    h1: $('h1').length,
    h2: $('h2').length,
    h3: $('h3').length,
  };

  const internalLinks = new Set<string>();
  const externalLinks = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
    if (href.startsWith('#')) return; // Skip anchor links on the same page

    try {
      const resolvedUrl = new URL(href, baseUrl);
      const urlStr = resolvedUrl.href.split('#')[0]; // Strip hash
      if (isInternalLink(urlStr, baseUrl)) {
        internalLinks.add(urlStr);
      } else {
        externalLinks.add(urlStr);
      }
    } catch {
      // Ignore unparseable URLs
    }
  });

  // Readability extraction
  const dom = new JSDOM(html, { url: baseUrl, virtualConsole: quietJsdomConsole });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const rawTextContent = article?.textContent || $('body').text();
  // Clean extra whitespaces
  const cleanContent = rawTextContent.replace(/\s+/g, ' ').trim();
  
  // Word count approx
  const wordCount = cleanContent.split(' ').filter(w => w.length > 0).length;

  return {
    title,
    metaDescription,
    headings,
    content: cleanContent,
    wordCount,
    internalLinks: [...internalLinks],
    externalLinks: [...externalLinks],
  };
}

/**
 * Fetch and parse a single blog post to extract its summary.
 */
async function fetchAndExtractBlog(url: string): Promise<ScrapedBlogPost | null> {
  const html = await fetchHtmlWithRetries(url, 1, 8000) || await fetchHtmlWithPlaywright(url);
  if (!html) return null;

  const parsed = parseWebsiteHtml(html, url);
  // Summary: first ~300 words
  const summary = parsed.content.split(' ').slice(0, 300).join(' ') + (parsed.wordCount > 300 ? '...' : '');

  return {
    url,
    title: parsed.title,
    summary,
  };
}

/**
 * Main Entry Point: Analyze a website end-to-end.
 */
export async function analyzeWebsite(url: string): Promise<HybridScraperResult> {
  let baseUrl = url;
  if (!/^https?:\/\//i.test(baseUrl)) {
    baseUrl = `https://${baseUrl}`;
  }

  // 1. Fetch raw HTML
  let html = await fetchHtmlWithRetries(baseUrl);
  
  // 2. Playwright Fallback if Fetch fails
  if (!html) {
    console.log(`[hybridScraper] Using Playwright fallback for ${baseUrl}`);
    html = await fetchHtmlWithPlaywright(baseUrl);
  }

  if (!html) {
    throw new Error(`Failed to fetch content from ${baseUrl}. Blocked or unreachable.`);
  }

  // 3. Parse Metadata, Links, Content
  const parsed = parseWebsiteHtml(html, baseUrl);

  // 4. Detect Blog URLs (limit 5)
  const blogUrls = extractBlogUrls(parsed.internalLinks, 5);

  // 5. Fetch Blog Pages Parallel
  const blogPostsResults = await Promise.all(
    blogUrls.map(u => fetchAndExtractBlog(u).catch(() => null))
  );
  const blogPosts = blogPostsResults.filter((b): b is ScrapedBlogPost => b !== null);

  // 6. AI Processing (Trimmed Content)
  // Let's pass around 1000 words max to AI to save tokens and focus on the intro
  const contentSummaryForAI = parsed.content.split(' ').slice(0, 1000).join(' ');
  const aiResult = await analyzeWebsiteWithAI(parsed.title, parsed.metaDescription, contentSummaryForAI);

  return {
    url: baseUrl,
    title: parsed.title,
    metaDescription: parsed.metaDescription,
    headings: parsed.headings,
    contentSummary: contentSummaryForAI,
    wordCount: parsed.wordCount,
    internalLinks: parsed.internalLinks,
    externalLinks: parsed.externalLinks,
    blogPosts,
    ...aiResult,
  };
}

/**
 * Drop-in replacement for `jinaReadUrl`.
 * Fetches HTML, extracts main article content using Readability, and converts to Markdown using Turndown.
 */
export interface ScrapedPageMarkdown {
  url: string;
  resolvedUrl?: string;
  markdown: string;
  length: number;
  ok: boolean;
  error?: string;
}

export async function hybridReadUrl(url: string, opts: { timeoutMs?: number } = {}): Promise<ScrapedPageMarkdown> {
  try {
    let html = await fetchHtmlWithRetries(url, 1, opts.timeoutMs || 15000);
    if (!html) {
      console.log(`[hybridScraper] Using Playwright fallback for ${url}`);
      html = await fetchHtmlWithPlaywright(url);
    }
    if (!html) {
      throw new Error(`Failed to fetch HTML for ${url}`);
    }

    const dom = new JSDOM(html, { url, virtualConsole: quietJsdomConsole });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    let markdown = '';
    if (article?.content) {
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced'
      });
      // Remove scripts, styles before turndown
      turndownService.remove(['script', 'style']);
      markdown = turndownService.turndown(article.content);
    } else {
      // Fallback: if readability fails, try just cheerio text
      const $ = cheerio.load(html);
      $('script, style, noscript').remove();
      markdown = $('body').text().replace(/\s+/g, ' ').trim();
    }

    return {
      url,
      markdown,
      length: markdown.length,
      ok: true
    };
  } catch (error) {
    return {
      url,
      markdown: '',
      length: 0,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function hybridReadBatch(urls: string[], opts: { timeoutMs?: number } = {}): Promise<ScrapedPageMarkdown[]> {
  const unique = [...new Set(urls)].slice(0, 12);
  return Promise.all(unique.map(u => hybridReadUrl(u, opts)));
}

