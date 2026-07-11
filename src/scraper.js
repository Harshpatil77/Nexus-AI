const HOSTILE_DOMAINS = [
  'linkedin.com',
  'amazon.com',
  'google.com',
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'cloudflare.com'
];

export function isHostileDomain(url) {
  const normalizedUrl = String(url).toLowerCase();
  return HOSTILE_DOMAINS.some(domain => normalizedUrl.includes(domain));
}

export function htmlToMarkdown(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
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

export async function tierOne(url, apiKey) {
  const firecrawlUrl = process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev/v1/scrape';
  const response = await fetch(firecrawlUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, formats: ['markdown'] })
  });
  if (!response.ok) throw new Error(`Firecrawl ${response.status}`);
  const json = await response.json();
  return json.data?.markdown || '';
}

export async function tierTwo(url) {
  const scrapeDoKey = process.env.SCRAPEDO_API_KEY;
  if (!scrapeDoKey) throw new Error('Scrape.do key not configured');
  const response = await fetch(
    `https://api.scrape.do?token=${encodeURIComponent(scrapeDoKey)}&url=${encodeURIComponent(url)}&render=true`,
    { method: 'GET' }
  );
  if (!response.ok) throw new Error(`Scrape.do ${response.status}`);
  return htmlToMarkdown(await response.text());
}

export async function tierThree(url) {
  const scrapflyKey = process.env.SCRAPFLY_API_KEY;
  if (!scrapflyKey) throw new Error('Scrapfly key not configured');
  const response = await fetch(
    `https://api.scrapfly.io/scrape?key=${encodeURIComponent(scrapflyKey)}&url=${encodeURIComponent(url)}&asp=true&render_js=true&format=markdown`,
    { method: 'GET' }
  );
  if (!response.ok) throw new Error(`Scrapfly ${response.status}`);
  const json = await response.json();
  return json.result?.content || '';
}

export function isBlockedResponse(markdown) {
  const content = String(markdown || '');
  const normalizedContent = content.toLowerCase();
  return !content || content.length < 100 ||
    normalizedContent.includes('loading...') ||
    normalizedContent.includes('enable javascript') ||
    normalizedContent.includes('please enable') ||
    normalizedContent.includes('403') ||
    normalizedContent.includes('cloudflare');
}

export function isFirewallError(error) {
  const message = String(error.message || error).toLowerCase();
  return message.includes('403') || message.includes('429') ||
    message.includes('cloudflare') || message.includes('perimeterx') ||
    message.includes('akamai');
}

export async function lastResortFetch(url) {
  try {
    const response = await withTimeout(fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }), 15000, 'Last resort');
    if (!response.ok) throw new Error(String(response.status));
    return htmlToMarkdown(await response.text());
  } catch (error) {
    throw new Error(`All tiers exhausted — ${error.message}`);
  }
}

export async function smartScrape(url, firecrawlKey) {
  if (isHostileDomain(url)) {
    console.log('Hostile domain detected, routing to Tier 3:', url);
    try {
      const markdown = await withTimeout(tierThree(url), 30000, 'Tier 3');
      if (!isBlockedResponse(markdown)) return { markdown, tierUsed: 3 };
    } catch (error) {
      console.log('Tier 3 failed:', error.message);
    }
    try {
      const markdown = await lastResortFetch(url);
      if (!isBlockedResponse(markdown)) return { markdown, tierUsed: 4 };
    } catch (error) {
      console.log('Tier 4 failed:', error.message);
    }
    throw new Error('All tiers exhausted — site may require authentication');
  }

  try {
    const markdown = await withTimeout(tierOne(url, firecrawlKey), 30000, 'Tier 1');
    if (!isBlockedResponse(markdown)) {
      console.log('Tier 1 success:', url);
      return { markdown, tierUsed: 1 };
    }
    console.log('Tier 1 blocked, escalating to Tier 2:', url);
  } catch (error) {
    console.log('Tier 1 failed:', error.message);
  }

  try {
    const markdown = await withTimeout(tierTwo(url), 30000, 'Tier 2');
    if (!isBlockedResponse(markdown)) {
      console.log('Tier 2 success:', url);
      return { markdown, tierUsed: 2 };
    }
    console.log('Tier 2 blocked, escalating to Tier 3:', url);
  } catch (error) {
    console.log('Tier 2 failed:', error.message);
    if (!isFirewallError(error) && !String(error.message || '').includes('key not configured')) throw error;
  }

  try {
    const markdown = await withTimeout(tierThree(url), 30000, 'Tier 3');
    if (!isBlockedResponse(markdown)) {
      console.log('Tier 3 success:', url);
      return { markdown, tierUsed: 3 };
    }
  } catch (error) {
    console.log('Tier 3 failed:', error.message);
  }
  try {
    const markdown = await lastResortFetch(url);
    if (!isBlockedResponse(markdown)) {
      console.log('Tier 4 success:', url);
      return { markdown, tierUsed: 4 };
    }
  } catch (error) {
    console.log('Tier 4 failed:', error.message);
  }
  throw new Error('All tiers exhausted — site may require authentication');
}

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
