/**
 * Robust Scraper Pipeline for Nexus AI
 * ============================================================
 * Improvements over v1:
 * 1. GitHub + more hostile domains detected → routed to Tier 3
 * 2. Per-tier diagnostic logging → tells exactly WHY each tier failed
 * 3. Better anti-bot detection (SPA, lazy-loading, bot walls)
 * 4. Rotating headers + retry logic for last-resort fetch
 * 5. Better error messages (not generic "authentication")
 * 6. Optional browser fallback via kimi-webbridge
 * 7. Content validation with multiple heuristics
 * 8. Detailed failure report for every URL
 */

// ── Hostile Domains (aggressive anti-bot / JS-challenge / rate-limit) ──
const HOSTILE_DOMAINS = [
  'linkedin.com',
  'amazon.com',
  'google.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'cloudflare.com',
  'github.com',          // ← NEW: GitHub aggressively blocks scrapers
  'gitlab.com',
  'reddit.com',
  'netflix.com',
  'youtube.com',
  'tiktok.com',
  'discord.com',
  'airbnb.com',
  'booking.com',
  'zillow.com',
  'glassdoor.com',
  'indeed.com',
  'angel.co',
  'crunchbase.com',      // heavy bot detection
  'ycombinator.com',     // moderate bot detection (challenge pages)
  'news.ycombinator.com',
  'vercel.app',          // some Vercel apps have bot detection
  'vercel.com',
];

// User-Agent rotation for last-resort fetch
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
];

export function isHostileDomain(url) {
  const normalizedUrl = String(url).toLowerCase();
  return HOSTILE_DOMAINS.some(domain => normalizedUrl.includes(domain));
}

export function htmlToMarkdown(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<path[^>]*\/>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Content Validation ─────────────────────────────────────
export function isBlockedResponse(markdown) {
  const content = String(markdown || '').trim();
  if (!content || content.length < 80) return true;

  const normalized = content.toLowerCase();

  const explicitBlockPatterns = [
    'attention required! | cloudflare',
    'cloudflare ray id',
    'security check by cloudflare',
    'please complete the security check',
    'checking your browser before accessing',
    'verify you are human',
    'i am not a robot',
    'just a moment... security check',
    'ddos protection by',
    'checking if the site connection is secure',
    'enable javascript and cookies to continue',
    'javascript is required to access this site',
    'please enable js in your browser',
    'error 1020 access denied',
    'perimeterx',
    'datadome',
    'blocked by perimeterx',
    'verify you are a human'
  ];

  for (const pattern of explicitBlockPatterns) {
    if (normalized.includes(pattern)) return true;
  }

  if (content.length < 1500) {
    const genericBlockWords = [
      'access denied',
      '403 forbidden',
      'too many requests',
      'rate limit exceeded',
      'captcha',
      'robot check',
      'bot wall',
      'please turn javascript on',
      'javascript is required',
      'security challenge'
    ];
    for (const word of genericBlockWords) {
      if (normalized.includes(word)) return true;
    }
  }

  const htmlTagRatio = (content.match(/<[^>]+>/g) || []).length / (content.length || 1);
  if (htmlTagRatio > 0.3) return true;

  const wordCount = content.split(/\s+/).filter(w => w.length > 2).length;
  if (wordCount < 15) return true;

  return false;
}

export function isFirewallError(error) {
  const message = String(error.message || error).toLowerCase();
  return message.includes('403') ||
    message.includes('429') ||
    message.includes('cloudflare') ||
    message.includes('perimeterx') ||
    message.includes('akamai') ||
    message.includes('datadome') ||
    message.includes('blocked') ||
    message.includes('forbidden') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('challenge') ||
    message.includes('captcha') ||
    message.includes('unauthorized') ||
    message.includes('access denied') ||
    message.includes('denied');
}

// ── Tier 1: Firecrawl ──────────────────────────────────────
export async function tierOne(url, apiKey) {
  const firecrawlUrl = process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev/v1/scrape';
  const response = await fetch(firecrawlUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      // Try to get JS-rendered content
      onlyMainContent: false,
      waitFor: 2000,
      // Try mobile user agent sometimes
      mobile: false,
    }),
  });
  if (!response.ok) throw new Error(`Firecrawl HTTP ${response.status}`);
  const json = await response.json();
  const markdown = json.data?.markdown || '';
  if (!markdown) throw new Error('Firecrawl returned empty markdown');
  return markdown;
}

// ── Tier 2: Scrape.do (JS rendering) ───────────────────────
export async function tierTwo(url) {
  const scrapeDoKey = process.env.SCRAPEDO_API_KEY;
  if (!scrapeDoKey) throw new Error('Scrape.do API key not configured');
  const response = await fetch(
    `https://api.scrape.do?token=${encodeURIComponent(scrapeDoKey)}&url=${encodeURIComponent(url)}&render=true&super=true`,
    { method: 'GET' }
  );
  if (!response.ok) throw new Error(`Scrape.do HTTP ${response.status}`);
  const text = await response.text();
  if (!text || text.length < 200) throw new Error('Scrape.do returned empty/short response');
  return htmlToMarkdown(text);
}

// ── Tier 3: Scrapfly (ASP + JS) ────────────────────────────
export async function tierThree(url) {
  const scrapflyKey = process.env.SCRAPFLY_API_KEY;
  if (!scrapflyKey) throw new Error('Scrapfly API key not configured');
  const response = await fetch(
    `https://api.scrapfly.io/scrape?key=${encodeURIComponent(scrapflyKey)}&url=${encodeURIComponent(url)}&asp=true&render_js=true&format=markdown&country=us&retry=true`,
    { method: 'GET' }
  );
  if (!response.ok) throw new Error(`Scrapfly HTTP ${response.status}`);
  const json = await response.json();
  const content = json.result?.content || '';
  if (!content) throw new Error('Scrapfly returned empty content');
  return content;
}

// ── Tier 4: Last-Resort Fetch with headers + retries ──────
export async function lastResortFetch(url, attempt = 1) {
  const maxAttempts = 3;
  const userAgent = USER_AGENTS[(attempt - 1) % USER_AGENTS.length];
  try {
    const response = await withTimeout(
      fetch(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
          'Referer': 'https://www.google.com/',
        },
      }),
      15000,
      'Last-resort fetch'
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (!text || text.length < 200) throw new Error('Empty/short response');
    return htmlToMarkdown(text);
  } catch (error) {
    if (attempt < maxAttempts) {
      console.log(`Last-resort attempt ${attempt} failed (${error.message}), retrying...`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
      return lastResortFetch(url, attempt + 1);
    }
    throw new Error(`Last-resort fetch failed after ${maxAttempts} attempts: ${error.message}`);
  }
}

// ── Tier 5: Browser fallback via kimi-webbridge (if available) ──
export async function tierBrowserFallback(url) {
  try {
    const webbridgeUrl = 'http://127.0.0.1:10086/command';
    const sessionName = 'nexus-scrape-' + Date.now();

    // Navigate
    const navRes = await fetch(webbridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'navigate',
        args: { url, newTab: true },
        session: sessionName,
      }),
    });
    if (!navRes.ok) throw new Error('Browser navigation failed');

    // Wait for page to settle
    await new Promise(r => setTimeout(r, 3000));

    // Take snapshot to get content
    const snapRes = await fetch(webbridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'snapshot',
        args: {},
        session: sessionName,
      }),
    });
    if (!snapRes.ok) throw new Error('Browser snapshot failed');
    const snapData = await snapRes.json();

    // Extract text from accessibility tree
    const treeText = snapData?.tree || '';
    if (!treeText || treeText.length < 100) throw new Error('Browser snapshot too short');

    return treeText;
  } catch (error) {
    throw new Error(`Browser fallback unavailable: ${error.message}`);
  }
}

// ── Main Smart Scrape ────────────────────────────────────────
export async function smartScrape(url, firecrawlKey) {
  const diagnostics = [];

  // Helper to record tier attempt
  const record = (tier, status, detail, contentLength = 0) => {
    diagnostics.push({ tier, status, detail, contentLength, timestamp: Date.now() });
    console.log(`[${tier}] ${status}: ${detail}${contentLength ? ` (content: ${contentLength} chars)` : ''}`);
  };

  // ── Hostile domains → skip directly to Tier 3 ──
  if (isHostileDomain(url)) {
    record('HOSTILE', 'detected', `Domain flagged as hostile; routing directly to Tier 3 + browser fallback`);

    // Tier 3 attempt
    try {
      const markdown = await withTimeout(tierThree(url), 45000, 'Tier 3 (hostile)');
      if (!isBlockedResponse(markdown)) {
        record('Tier 3', 'success', 'Hostile domain bypassed via Scrapfly', markdown.length);
        return { markdown, tierUsed: 3, diagnostics };
      }
      record('Tier 3', 'blocked', 'Scrapfly returned blocked/empty content', markdown.length);
    } catch (error) {
      record('Tier 3', 'failed', error.message);
    }

    // Tier 4 attempt
    try {
      const markdown = await withTimeout(lastResortFetch(url), 25000, 'Tier 4 (hostile)');
      if (!isBlockedResponse(markdown)) {
        record('Tier 4', 'success', 'Hostile domain bypassed via last-resort fetch', markdown.length);
        return { markdown, tierUsed: 4, diagnostics };
      }
      record('Tier 4', 'blocked', 'Last-resort fetch returned blocked/empty content', markdown.length);
    } catch (error) {
      record('Tier 4', 'failed', error.message);
    }

    // Tier 5 (browser) attempt
    try {
      const markdown = await withTimeout(tierBrowserFallback(url), 30000, 'Tier 5 (browser)');
      if (!isBlockedResponse(markdown)) {
        record('Tier 5', 'success', 'Hostile domain bypassed via real browser', markdown.length);
        return { markdown, tierUsed: 5, diagnostics };
      }
      record('Tier 5', 'blocked', 'Browser fallback returned blocked/empty content', markdown.length);
    } catch (error) {
      record('Tier 5', 'unavailable', error.message);
    }

    throw new DetailedError(
      `All tiers exhausted — site may require authentication`,
      { diagnostics, url, hostile: true, originalMessage: `All tiers exhausted — ${url} is aggressively protected against bots. The site uses JavaScript challenges, rate limiting, or requires a real browser session.` }
    );
  }

  // ── Normal tier escalation ──

  // Tier 1: Firecrawl
  try {
    const markdown = await withTimeout(tierOne(url, firecrawlKey), 30000, 'Tier 1');
    if (!isBlockedResponse(markdown)) {
      record('Tier 1', 'success', 'Firecrawl succeeded', markdown.length);
      return { markdown, tierUsed: 1, diagnostics };
    }
    record('Tier 1', 'blocked', 'Firecrawl returned bot-blocked/empty content; escalating to Tier 2', markdown.length);
  } catch (error) {
    record('Tier 1', 'failed', error.message);
  }

  // Tier 2: Scrape.do
  try {
    const markdown = await withTimeout(tierTwo(url), 30000, 'Tier 2');
    if (!isBlockedResponse(markdown)) {
      record('Tier 2', 'success', 'Scrape.do succeeded', markdown.length);
      return { markdown, tierUsed: 2, diagnostics };
    }
    record('Tier 2', 'blocked', 'Scrape.do returned bot-blocked/empty content; escalating to Tier 3', markdown.length);
  } catch (error) {
    record('Tier 2', 'failed', error.message);
    if (!isFirewallError(error) && !String(error.message || '').includes('key not configured')) {
      throw new DetailedError(
        `Tier 2 failed: ${error.message}. This is not a firewall issue, so higher tiers likely won't help.`,
        { diagnostics, url, tier: 2, error }
      );
    }
  }

  // Tier 3: Scrapfly
  try {
    const markdown = await withTimeout(tierThree(url), 30000, 'Tier 3');
    if (!isBlockedResponse(markdown)) {
      record('Tier 3', 'success', 'Scrapfly succeeded', markdown.length);
      return { markdown, tierUsed: 3, diagnostics };
    }
    record('Tier 3', 'blocked', 'Scrapfly returned bot-blocked/empty content; escalating to Tier 4', markdown.length);
  } catch (error) {
    record('Tier 3', 'failed', error.message);
  }

  // Tier 4: Last-resort fetch
  try {
    const markdown = await withTimeout(lastResortFetch(url), 25000, 'Tier 4');
    if (!isBlockedResponse(markdown)) {
      record('Tier 4', 'success', 'Last-resort fetch succeeded', markdown.length);
      return { markdown, tierUsed: 4, diagnostics };
    }
    record('Tier 4', 'blocked', 'Last-resort fetch returned bot-blocked/empty content; escalating to Tier 5', markdown.length);
  } catch (error) {
    record('Tier 4', 'failed', error.message);
  }

  // Tier 5: Browser fallback (if available)
  try {
    const markdown = await withTimeout(tierBrowserFallback(url), 30000, 'Tier 5');
    if (!isBlockedResponse(markdown)) {
      record('Tier 5', 'success', 'Browser fallback succeeded', markdown.length);
      return { markdown, tierUsed: 5, diagnostics };
    }
    record('Tier 5', 'blocked', 'Browser fallback returned blocked/empty content', markdown.length);
  } catch (error) {
    record('Tier 5', 'unavailable', error.message);
  }

  // All tiers exhausted → build a meaningful error message
  const tierSummary = diagnostics
    .filter(d => d.status === 'failed' || d.status === 'blocked')
    .map(d => `${d.tier}: ${d.status} — ${d.detail}`)
    .join('; ');

  const hasAuthWall = diagnostics.some(d =>
    d.detail.toLowerCase().includes('authentication') ||
    d.detail.toLowerCase().includes('login') ||
    d.detail.toLowerCase().includes('sign in')
  );

  const errorMessage = hasAuthWall
    ? `All tiers exhausted — ${url} requires authentication or login. The site is not publicly accessible. Try accessing it manually in a browser first.`
    : `All tiers exhausted — ${url} is aggressively protected against automated scraping. Firecrawl, Scrape.do, Scrapfly, and direct fetch all failed. Details: ${tierSummary}. This site likely uses JavaScript challenges, bot detection, or rate limiting. Try: (1) using the site's official API, (2) scraping from a different domain, or (3) requesting whitelist access.`;

  throw new DetailedError(`All tiers exhausted — site may require authentication`, { diagnostics, url, tierSummary, originalMessage: errorMessage });
}

// ── Detailed Error Class ───────────────────────────────────
class DetailedError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DetailedError';
    this.details = details;
  }
}

// ── Concurrency limiter ────────────────────────────────────
export async function runWithConcurrencyLimit(tasks, limit) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const promise = Promise.resolve().then(() => task());
    results.push(promise);
    executing.add(promise);
    const clean = () => executing.delete(promise);
    promise.then(clean, clean);
    if (executing.size >= limit) await Promise.race(executing);
  }
  return Promise.all(results);
}

// ── Content Quality Score ──────────────────────────────────
export function scoreContentQuality(markdown) {
  const content = String(markdown || '');
  if (!content) return { score: 0, reasons: ['Empty content'] };

  const words = content.split(/\s+/).filter(w => w.length > 2);
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 20);
  const links = (content.match(/\[.*?\]\(.*?\)/g) || []).length;
  const headings = (content.match(/^#{1,6}\s+/gm) || []).length;

  let score = 0;
  const reasons = [];

  if (words.length > 100) score += 25;
  else reasons.push('Too few words');

  if (sentences.length > 5) score += 25;
  else reasons.push('Too few sentences');

  if (paragraphs.length > 2) score += 20;
  else reasons.push('Too few paragraphs');

  if (headings > 0) score += 15;
  else reasons.push('No headings/structure');

  if (links > 0) score += 15;
  else reasons.push('No links detected');

  return { score: Math.min(score, 100), reasons, stats: { words: words.length, sentences: sentences.length, paragraphs: paragraphs.length, links, headings } };
}
