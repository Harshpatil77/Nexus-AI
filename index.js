import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Analytics System Imports
import { analyticsMiddleware, trackEvent, analyticsRouter, ensureDataFiles, getPublicMetrics } from './analytics/analytics.js';
import feedbackRouter from './analytics/feedback.js';
import dashboardRouter, { adminAuth } from './analytics/dashboard.js';

dotenv.config();
await ensureDataFiles();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Keep the dashboard HTML behind its authenticated route; do not expose it via static files.
app.use('/admin.html', (req, res) => res.status(404).send('Not found'));

// Add static file serving BEFORE routes
app.use(express.static('public'));
app.use(analyticsMiddleware);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Public metrics are intentionally limited to counters displayed on the product homepage.
app.get('/metrics', async (req, res) => {
  res.json(await getPublicMetrics());
});

// Client event collection stays public; detailed analytics are protected below.
app.post('/track', async (req, res) => {
  const { eventType, metadata } = req.body;
  if (!eventType) return res.status(400).json({ error: 'eventType is required' });
  await trackEvent(eventType, req.userHash, req.sessionId, metadata || {});
  res.json({ success: true });
});

// Concurrency limit helper
async function runWithConcurrencyLimit(tasks, limit) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

const HOSTILE_DOMAINS = [
  'linkedin.com',
  'amazon.com',
  'google.com',
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'cloudflare.com'
];

function isHostileDomain(url) {
  const normalizedUrl = String(url).toLowerCase();
  return HOSTILE_DOMAINS.some(domain => normalizedUrl.includes(domain));
}

function htmlToMarkdown(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function tierOne(url, apiKey) {
  const firecrawlUrl = process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev/v1/scrape';
  const response = await fetch(firecrawlUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url, formats: ['markdown'] })
  });

  if (!response.ok) throw new Error(`Firecrawl ${response.status}`);
  const json = await response.json();
  return json.data?.markdown || '';
}

async function tierTwo(url) {
  const scrapeDoKey = process.env.SCRAPEDO_API_KEY;
  if (!scrapeDoKey) throw new Error('Scrape.do key not configured');

  const response = await fetch(
    `https://api.scrape.do?token=${encodeURIComponent(scrapeDoKey)}&url=${encodeURIComponent(url)}&render=true`,
    { method: 'GET' }
  );
  if (!response.ok) throw new Error(`Scrape.do ${response.status}`);
  return htmlToMarkdown(await response.text());
}

async function tierThree(url) {
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

function isBlockedResponse(markdown) {
  const content = String(markdown || '');
  const normalizedContent = content.toLowerCase();
  return !content || content.length < 100 ||
    normalizedContent.includes('loading...') ||
    normalizedContent.includes('enable javascript') ||
    normalizedContent.includes('please enable') ||
    normalizedContent.includes('403') ||
    normalizedContent.includes('cloudflare');
}

function isFirewallError(error) {
  const message = String(error.message || error).toLowerCase();
  return message.includes('403') || message.includes('429') ||
    message.includes('cloudflare') || message.includes('perimeterx') ||
    message.includes('akamai');
}

// Three-tier scraper router: Firecrawl, then Scrape.do, then Scrapfly ASP.
async function smartScrape(url, firecrawlKey) {
  if (isHostileDomain(url)) {
    console.log('Hostile domain detected, routing to Tier 3:', url);
    try {
      const markdown = await tierThree(url);
      if (!isBlockedResponse(markdown)) return { markdown, tierUsed: 3 };
    } catch (error) {
      console.log('Tier 3 failed:', error.message);
    }
    throw new Error('All tiers exhausted — site may require authentication');
  }

  try {
    const markdown = await tierOne(url, firecrawlKey);
    if (!isBlockedResponse(markdown)) {
      console.log('Tier 1 success:', url);
      return { markdown, tierUsed: 1 };
    }
    console.log('Tier 1 blocked, escalating to Tier 2:', url);
  } catch (error) {
    console.log('Tier 1 failed:', error.message);
  }

  try {
    const markdown = await tierTwo(url);
    if (!isBlockedResponse(markdown)) {
      console.log('Tier 2 success:', url);
      return { markdown, tierUsed: 2 };
    }
    console.log('Tier 2 blocked, escalating to Tier 3:', url);
  } catch (error) {
    console.log('Tier 2 failed:', error.message);
    if (!isFirewallError(error) && !String(error.message || '').includes('key not configured')) {
      throw error;
    }
  }

  try {
    const markdown = await tierThree(url);
    if (!isBlockedResponse(markdown)) {
      console.log('Tier 3 success:', url);
      return { markdown, tierUsed: 3 };
    }
  } catch (error) {
    console.log('Tier 3 failed:', error.message);
  }

  throw new Error('All tiers exhausted — site may require authentication');
}

// ═══════════════════════════════════
// Workflow discovery uses Firecrawl Search rather than LLM-generated URLs.
async function discoverSeedUrls(goal, firecrawlKey) {
  const searchUrl = process.env.FIRECRAWL_SEARCH_API_URL || 'https://api.firecrawl.dev/v1/search';
  const response = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: goal,
      limit: 3,
      scrapeOptions: { formats: ['markdown'] }
    })
  });

  if (!response.ok) {
    throw new Error(`Firecrawl search failed: ${response.status}`);
  }

  const json = await response.json();
  if (!json.success || !Array.isArray(json.data)) {
    throw new Error('Firecrawl search returned no results');
  }

  return json.data
    .filter(item => typeof item?.url === 'string' && item.url.startsWith('http'))
    .slice(0, 3)
    .map(item => ({ url: item.url, markdown: item.markdown || '' }));
}

// Nemotron extraction helper
async function extractSchema(markdown, userPrompt, apiKey, format = 'json') {
  const strictRule = `STRICT RULES:
- Extract ONLY what the user asked for. Do NOT add extra sections, categories, or information beyond the request.
- If the user asks for specific fields, return ONLY those fields.
- Do NOT add summaries, notes, eligibility info, submission requirements, or any other unrequested data.
- Answer the user's question precisely and concisely.`;

  let prompt;
  if (format === 'text') {
    prompt = `${strictRule}\n\nUser request: ${userPrompt}\n\nReturn ONLY clean, readable plain text answering the user's exact request. Nothing more.\n\nContent:\n${markdown}`;
  } else {
    prompt = `${strictRule}\n\nUser request: ${userPrompt}\n\nReturn ONLY a clean JSON object answering the user's exact request. Nothing more.\n\nContent:\n${markdown}`;
  }

  const nvidiaUrl = process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
  const response = await fetch(nvidiaUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      reasoning_budget: 0,
      chat_template_kwargs: {
        enable_thinking: false
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA API responded with status ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  if (!json.choices || json.choices.length === 0 || !json.choices[0].message || !json.choices[0].message.content) {
    throw new Error(`NVIDIA API returned unexpected response: ${JSON.stringify(json)}`);
  }

  const text = json.choices[0].message.content.trim();
  
  // Clean formatting tags from Nemotron
  let cleaned = text;
  if (cleaned.startsWith('</think>')) {
    cleaned = cleaned.replace(/^<\/think>\s*/, '').trim();
  }

  if (format === 'text') {
    return cleaned;
  }

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse Nemotron's response as JSON: ${err.message}. Content was: ${text}`);
  }
}

// POST /scrape endpoint
app.post('/scrape', async (req, res) => {
  const { urls, prompt, format } = req.body;
  const outFormat = format || 'json';

  // Validation
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls must be an array' });
  }

  if (urls.length < 1) {
    return res.status(400).json({ error: 'urls array must contain at least 1 item' });
  }

  if (urls.length > 5) {
    return res.status(400).json({
      error: 'Free tier is limited to 5 URLs per request. Need more? Contact patilharsh310708@gmail.com to unlock higher limits.',
      limit: 5,
      submitted: urls.length
    });
  }

  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    return res.status(400).json({ error: 'prompt must be a non-empty string' });
  }

  if (outFormat !== 'json' && outFormat !== 'text') {
    return res.status(400).json({ error: 'format must be either "json" or "text"' });
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const nemotronKey = process.env.NVIDIA_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (!firecrawlKey || !nemotronKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing API keys' });
  }

  const stateId = crypto.randomUUID();

  // Create tasks for each URL
  const tasks = urls.map((url) => async () => {
    try {
      console.log('1. Starting Firecrawl:', Date.now());
      const scrape = await smartScrape(url, firecrawlKey);
      const { markdown, tierUsed } = scrape;
      console.log('2. Firecrawl done:', Date.now());

      const data = await extractSchema(markdown, prompt, nemotronKey, outFormat);
      console.log('3. Claude done:', Date.now());

      return { url, data, tierUsed, success: true };
    } catch (error) {
      console.log('Task execution failed:', error.message);
      return { url, reason: error.message || String(error), success: false };
    }
  });

  const taskResults = await runWithConcurrencyLimit(tasks, 5);

  const results = [];
  const failed = [];

  for (const item of taskResults) {
    if (item.success) {
      results.push({
        url: item.url,
        tier_used: item.tierUsed,
        data: item.data
      });
    } else {
      failed.push({
        url: item.url,
        reason: item.reason
      });
    }
  }

  const output = {
    state_id: stateId,
    format: outFormat,
    results,
    failed,
    total: urls.length,
    succeeded: results.length,
    failed_count: failed.length
  };

  try {
    const filePath = path.join(process.cwd(), `${stateId}.json`);
    await fs.writeFile(filePath, JSON.stringify(output, null, 2), 'utf-8');
    console.log('4. File saved:', Date.now());
  } catch (err) {
    console.error(`Failed to save state file for ${stateId}:`, err);
  }

  // Track event
  await trackEvent(
    output.failed_count === output.total ? 'scrape_failed' : 'scrape_completed',
    req.userHash,
    req.sessionId,
    {
      stateId,
      format: outFormat,
      url_count: urls.length,
      succeeded: output.succeeded,
      failed_count: output.failed_count,
      error: output.failed_count === output.total ? (output.failed[0]?.reason || 'All scrapes failed') : undefined
    }
  );

  return res.status(200).json(output);
});

// POST /scrape-stream endpoint
app.post('/scrape-stream', async (req, res) => {
  const { urls, prompt, format, compare } = req.body;
  const outFormat = format || 'json';
  const compareMode = compare === true;

  // Validation
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls must be an array' });
  }

  if (urls.length < 1) {
    return res.status(400).json({ error: 'urls array must contain at least 1 item' });
  }

  if (urls.length > 5) {
    return res.status(400).json({
      error: 'Free tier is limited to 5 URLs per request. Need more? Contact patilharsh310708@gmail.com to unlock higher limits.',
      limit: 5,
      submitted: urls.length
    });
  }

  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    return res.status(400).json({ error: 'prompt must be a non-empty string' });
  }

  if (outFormat !== 'json' && outFormat !== 'text') {
    return res.status(400).json({ error: 'format must be either "json" or "text"' });
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const nemotronKey = process.env.NVIDIA_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (!firecrawlKey || !nemotronKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing API keys' });
  }

  const stateId = crypto.randomUUID();

  // Track event
  await trackEvent('scrape_started', req.userHash, req.sessionId, {
    format: outFormat,
    compare: compareMode,
    url_count: urls.length,
    prompt
  });

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let completedCount = 0;
  const results = [];
  const failed = [];
  const scrapedMarkdowns = [];

  const scrapeTasks = urls.map((url) => async () => {
    try {
      console.log('1. Starting Firecrawl:', Date.now());
      const scrape = await smartScrape(url, firecrawlKey);
      const { markdown, tierUsed } = scrape;
      console.log('2. Firecrawl done:', Date.now());
      return { url, markdown, tierUsed, success: true };
    } catch (error) {
      console.log('Scrape failed:', error.message);
      return { url, reason: error.message || String(error), success: false };
    }
  });

  const scrapeResults = await runWithConcurrencyLimit(scrapeTasks, 5);

  const scrapedOk = [];
  for (const sr of scrapeResults) {
    if (sr.success) {
      scrapedOk.push(sr);
      scrapedMarkdowns.push({ url: sr.url, markdown: sr.markdown, tierUsed: sr.tierUsed });
    } else {
      failed.push({ url: sr.url, reason: sr.reason });
    }
    completedCount++;
    res.write(`data: ${JSON.stringify({
      type: "progress",
      completed: completedCount,
      total: urls.length,
      phase: "scraping",
      current_url: sr.url,
      result: { url: sr.url, tier_used: sr.tierUsed, success: sr.success }
    })}\n\n`);
  }

  if (compareMode && scrapedOk.length > 0) {
    res.write(`data: ${JSON.stringify({
      type: "progress",
      completed: completedCount,
      total: urls.length,
      phase: "analyzing",
      current_url: "Combining all content for comparison...",
      result: { url: "compare", success: true }
    })}\n\n`);

    const combinedMarkdown = scrapedMarkdowns.map((s, i) =>
      `--- SOURCE ${i + 1}: ${s.url} ---\n${s.markdown}`
    ).join('\n\n');

    try {
      const data = await extractSchema(combinedMarkdown, prompt, nemotronKey, outFormat);
      console.log('3. Compare extraction done:', Date.now());
      results.push({
        url: 'combined-comparison',
        sources: scrapedMarkdowns.map(s => s.url),
        tier_used: scrapedMarkdowns.map(s => s.tierUsed),
        data
      });
    } catch (error) {
      console.log('Compare extraction failed:', error.message);
      failed.push({ url: 'combined-comparison', reason: error.message || String(error) });
    }
  } else {
    for (const sr of scrapedOk) {
      try {
        const data = await extractSchema(sr.markdown, prompt, nemotronKey, outFormat);
        console.log('3. Extraction done:', Date.now());
        results.push({ url: sr.url, tier_used: sr.tierUsed, data });
      } catch (error) {
        console.log('Extraction failed:', error.message);
        failed.push({ url: sr.url, reason: error.message || String(error) });
      }
    }
  }

  const output = {
    state_id: stateId,
    format: outFormat,
    compare: compareMode,
    results,
    failed,
    total: urls.length,
    succeeded: results.length,
    failed_count: failed.length
  };

  try {
    const filePath = path.join(process.cwd(), `${stateId}.json`);
    await fs.writeFile(filePath, JSON.stringify(output, null, 2), 'utf-8');
    console.log('4. File saved:', Date.now());
  } catch (err) {
    console.error(`Failed to save state file for ${stateId}:`, err);
  }

  // Track event
  await trackEvent(
    output.failed_count === output.total ? 'scrape_failed' : 'scrape_completed',
    req.userHash,
    req.sessionId,
    {
      stateId,
      format: outFormat,
      compare: compareMode,
      url_count: urls.length,
      succeeded: output.succeeded,
      failed_count: output.failed_count,
      error: output.failed_count === output.total ? (output.failed[0]?.reason || 'All scrapes failed') : undefined,
      domains: results.map(r => r.url ? new URL(r.url).hostname : 'unknown')
    }
  );

  res.write(`data: ${JSON.stringify({
    type: "done",
    state_id: stateId,
    succeeded: results.length,
    failed_count: failed.length
  })}\n\n`);

  res.end();
});

// GET /scrape/:state_id endpoint
app.get('/scrape/:state_id', async (req, res) => {
  const { state_id } = req.params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(state_id)) {
    return res.status(400).json({ error: 'Invalid state_id format' });
  }

  const filePath = path.join(process.cwd(), `${state_id}.json`);

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return res.status(200).json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Scrape results not found for this state_id' });
    }
    return res.status(500).json({ error: 'Failed to read results' });
  }
});

// GET /workflow/:workflow_id endpoint
app.get('/workflow/:workflow_id', async (req, res) => {
  const { workflow_id } = req.params;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(workflow_id)) {
    return res.status(400).json({ error: 'Invalid workflow_id format' });
  }

  const filePath = path.join(process.cwd(), `workflow_${workflow_id}.json`);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return res.status(200).json(JSON.parse(data));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'Workflow not found' });
      }
      if (error instanceof SyntaxError && attempt === 0) {
        await delay(100);
        continue;
      }
      return res.status(500).json({ error: 'Failed to read workflow state' });
    }
  }
});

// Helper to save workflow state
async function saveWorkflowState(workflow) {
  try {
    const filePath = path.join(process.cwd(), `workflow_${workflow.workflow_id}.json`);
    await fs.writeFile(filePath, JSON.stringify(workflow, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Failed to save workflow state for ${workflow.workflow_id}:`, err);
  }
}

// POST /workflow endpoint
app.post('/workflow', async (req, res) => {
  let { goal, depth, format } = req.body;

  if (!goal || typeof goal !== 'string' || goal.trim() === '') {
    return res.status(400).json({ error: 'goal must be a non-empty string' });
  }

  let targetDepth = parseInt(depth, 10);
  if (isNaN(targetDepth) || targetDepth < 1 || targetDepth > 2) {
    targetDepth = 2;
  }

  const targetFormat = (format === 'text') ? 'text' : 'json';

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const nemotronKey = process.env.NVIDIA_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (!firecrawlKey || !nemotronKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing API keys' });
  }

  const workflowId = crypto.randomUUID();
  const workflow = {
    workflow_id: workflowId,
    status: 'processing',
    goal: goal,
    format: targetFormat,
    current_step: 1,
    steps_completed: [],
    urls_discovered: 0,
    urls_scraped: 0,
    results: [],
    failed: [],
    created_at: Date.now(),
    completed_at: null
  };

  await saveWorkflowState(workflow);

  // Track event
  await trackEvent('workflow_started', req.userHash, req.sessionId, {
    workflow_id: workflowId,
    goal,
    format: targetFormat
  });

  runWorkflowAsync(workflow, targetDepth, firecrawlKey, nemotronKey, req.userHash, req.sessionId);

  return res.status(201).json({
    workflow_id: workflowId,
    status: 'processing',
    goal: goal
  });
});

// Asynchronous workflow executor
async function runWorkflowAsync(workflow, depth, firecrawlKey, nemotronKey, userHash, sessionId) {
  try {
    // --- STEP 1: Discovery via Firecrawl Search ---
    workflow.current_step = 1;
    await saveWorkflowState(workflow);

    let seedResults = [];
    try {
      seedResults = await discoverSeedUrls(workflow.goal, firecrawlKey);
    } catch (err) {
      workflow.status = 'failed';
      workflow.failed.push({ step: 1, reason: err.message || String(err) });
      workflow.completed_at = Date.now();
      await saveWorkflowState(workflow);
      return;
    }

    if (seedResults.length === 0) {
      workflow.status = 'failed';
      workflow.failed.push({ step: 1, reason: 'No URLs found for this goal. Try being more specific.' });
      workflow.completed_at = Date.now();
      await saveWorkflowState(workflow);
      return;
    }

    const seedUrls = seedResults.map(result => result.url);
    workflow.urls_discovered = seedUrls.length;
    workflow.steps_completed.push(1);
    await saveWorkflowState(workflow);

    // --- STEP 2: Extract links from seed-page Markdown returned by Search ---
    workflow.current_step = 2;
    await saveWorkflowState(workflow);

    const seedScrapeResults = [];
    let allDeepLinks = [];
    for (const seedResult of seedResults) {
      try {
        const markdown = seedResult.markdown;
        const seedScrapeResult = { url: seedResult.url, markdown, tierUsed: null, success: true, deepLinks: [] };
        if (markdown && markdown.length > 50 && depth === 2) {
          const extractLinksPrompt = `Extract all relevant URLs from this page that relate to: "${workflow.goal}". Return ONLY a JSON array of URL strings. No markdown. No explanation. Just the raw JSON array.`;
          try {
            const links = await extractSchema(markdown, extractLinksPrompt, nemotronKey, 'json');
            if (Array.isArray(links)) {
              links.forEach(link => {
                if (typeof link === 'string' && link.startsWith('http') && !allDeepLinks.includes(link) && !seedUrls.includes(link)) {
                  allDeepLinks.push(link);
                  seedScrapeResult.deepLinks.push(link);
                }
              });
            }
          } catch (error) {
            console.log('Link extraction failed:', error.message);
          }
        }

        // Extract goal data directly from the seed page so single-page sources
        // such as YC RFS produce results without relying on deep links.
        if (markdown && markdown.length > 50) {
          try {
            let extractionPrompt, formatType;
            if (workflow.format === 'text') {
              extractionPrompt = `Extract information matching this goal: "${workflow.goal}". Return clean readable plain text. Be specific and detailed.`;
              formatType = 'text';
            } else {
              extractionPrompt = `Extract information matching this goal: "${workflow.goal}". Return ONLY a valid JSON object or array. No explanation.`;
              formatType = 'json';
            }

            const seedData = await extractSchema(markdown, extractionPrompt, nemotronKey, formatType);
            if (seedData) {
              if (workflow.format === 'text') {
                workflow.results.push({ url: seedResult.url, text: seedData, source: 'seed' });
              } else if (Array.isArray(seedData)) {
                seedData.forEach(item => workflow.results.push(item));
              } else if (typeof seedData === 'object') {
                workflow.results.push(seedData);
              }
              await saveWorkflowState(workflow);
            }
          } catch (error) {
            console.log('Seed extraction failed:', error.message);
          }
        }
        seedScrapeResults.push(seedScrapeResult);
        workflow.urls_scraped++;
      } catch (err) {
        workflow.failed.push({ url: seedResult.url, step: 2, reason: err.message || String(err) });
      }
    }

    workflow.steps_completed.push(2);
    await saveWorkflowState(workflow);

    // Filter fragments and seed-page anchors before deep scraping.
    allDeepLinks = allDeepLinks.filter(link => {
      try {
        const parsed = new URL(link);
        if (parsed.hash) return false;
        const cleanLink = parsed.origin + parsed.pathname;
        return !seedUrls.some(seed => {
          const parsedSeed = new URL(seed);
          return parsedSeed.origin + parsedSeed.pathname === cleanLink;
        });
      } catch {
        return false;
      }
    });

    // --- STEP 3: Extract seed pages at depth 1, or scrape discovered links at depth 2 ---
    workflow.current_step = 3;
    await saveWorkflowState(workflow);

    const remainingUrlQuota = Math.max(0, 8 - workflow.urls_scraped);
    const deepLinksToScrape = depth === 2 ? allDeepLinks.slice(0, remainingUrlQuota) : [];

    workflow.urls_discovered = depth === 2 ? seedUrls.length + allDeepLinks.length : seedUrls.length;
    await saveWorkflowState(workflow);

    const pagesToExtract = depth === 1
      ? seedScrapeResults.filter(result => result.success).map(result => ({ url: result.url, markdown: result.markdown, tierUsed: result.tierUsed, alreadyScraped: true }))
      : deepLinksToScrape.map(url => ({ url, alreadyScraped: false }));

    const deepScrapeTasks = pagesToExtract.map((page) => async () => {
      try {
        const scrape = page.alreadyScraped
          ? { markdown: page.markdown, tierUsed: page.tierUsed }
          : await smartScrape(page.url, firecrawlKey);
        const { markdown, tierUsed } = scrape;
        let extractionPrompt, formatType;
        if (workflow.format === 'text') {
          extractionPrompt = `Extract information matching this goal: "${workflow.goal}".\nReturn the answer as clean, readable plain text. No additional explanations.`;
          formatType = 'text';
        } else {
          extractionPrompt = `Extract information matching this goal: "${workflow.goal}".\nReturn ONLY a valid JSON object or JSON array containing the extracted structured data. No additional explanations.`;
          formatType = 'json';
        }
        const data = await extractSchema(markdown, extractionPrompt, nemotronKey, formatType);
        return { url: page.url, success: true, data, tierUsed, alreadyScraped: page.alreadyScraped };
      } catch (err) {
        return { url: page.url, success: false, reason: err.message || String(err) };
      }
    });

    const deepScrapeResults = await runWithConcurrencyLimit(deepScrapeTasks, 5);

    let rawResults = [];
    for (const r of deepScrapeResults) {
      if (r.success) {
        if (!r.alreadyScraped) workflow.urls_scraped++;
        if (workflow.format === 'text') {
          rawResults.push({ url: r.url, text: r.data });
        } else {
          if (Array.isArray(r.data)) {
            r.data.forEach(item => rawResults.push(item));
          } else if (r.data && typeof r.data === 'object') {
            rawResults.push(r.data);
          }
        }
      } else {
        workflow.failed.push({ url: r.url, step: 3, reason: r.reason });
      }
    }

    workflow.steps_completed.push(3);
    await saveWorkflowState(workflow);

    // --- STEP 4: Merge & Deduplicate ---
    workflow.current_step = 4;
    await saveWorkflowState(workflow);

    const allRawResults = [...workflow.results, ...rawResults];
    if (workflow.format === 'text') {
      workflow.results = allRawResults;
    } else {
      const uniqueMap = new Map();
      allRawResults.forEach(item => {
        const key = item.name || item.title || item.url || JSON.stringify(item);
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        }
      });
      workflow.results = Array.from(uniqueMap.values());
    }

    workflow.steps_completed.push(4);
    workflow.status = 'completed';
    workflow.completed_at = Date.now();
    await saveWorkflowState(workflow);

    // Track event
    await trackEvent('workflow_completed', userHash, sessionId, {
      workflow_id: workflow.workflow_id,
      duration: workflow.completed_at - workflow.created_at,
      urls_discovered: workflow.urls_discovered,
      urls_scraped: workflow.urls_scraped,
      results_count: workflow.results.length
    });

  } catch (globalErr) {
    console.error("Workflow failed globally:", globalErr);
    workflow.status = 'failed';
    workflow.completed_at = Date.now();
    await saveWorkflowState(workflow);

    // Track event
    await trackEvent('workflow_failed', userHash, sessionId, {
      workflow_id: workflow.workflow_id,
      duration: workflow.completed_at - workflow.created_at,
      error: globalErr.message || String(globalErr)
    });
  }
}

// Mount routers
app.use('/analytics', adminAuth, analyticsRouter);
app.use(feedbackRouter);
app.use(dashboardRouter);

app.listen(PORT, () => {
  console.log(`Nexus AI API server running on port ${PORT}`);
});
