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

// Helper for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Scrape helper with 3 retries, 2s wait
async function scrapeWithRetry(url, apiKey, retries = 3, delayMs = 2000) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const firecrawlUrl = process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev/v1/scrape';
      const response = await fetch(firecrawlUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: url,
          formats: ['markdown']
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firecrawl API responded with status ${response.status}: ${errorText}`);
      }

      const json = await response.json();
      if (!json.success || !json.data || !json.data.markdown) {
        throw new Error(`Firecrawl scraping failed or returned empty markdown`);
      }

      return json.data.markdown;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await delay(delayMs);
      }
    }
  }
  throw lastError || new Error(`Failed to scrape after ${retries} retries`);
}

// ═══════════════════════════════════
// URL Discovery helper (for workflow Step 1)
// Uses a GENERATION prompt, not an extraction prompt
// ═══════════════════════════════════
async function discoverUrls(goal, apiKey) {
  const nvidiaUrl = process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';

  const prompt = `You are a web research URL generator. Convert the user's high-level research goal into a JSON list of starting seed URLs (maximum 3 URLs) that are best suited to gather the initial information or links.

Goal: "${goal}"

RULES:
- Return ONLY a valid JSON array of URL strings
- Maximum 3 URLs
- URLs must be real, publicly accessible web pages
- NO markdown, NO backticks, NO explanation
- Just the raw JSON array

Example output format:
["https://www.reddit.com/r/example/", "https://news.ycombinator.com/", "https://www.producthunt.com/"]`;

  const response = await fetch(nvidiaUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      reasoning_budget: 0,
      chat_template_kwargs: { enable_thinking: false }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA API responded with status ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  let text = json.choices?.[0]?.message?.content || '';

  // Strip thinking tags if present
  if (text.includes('<think>')) {
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
  if (text.startsWith('</think>')) {
    text = text.replace(/^<\/think>\s*/, '').trim();
  }

  // Strip markdown code blocks if present
  if (text.startsWith('```')) {
    text = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
  }

  console.log('Discovery LLM raw response:', text);

  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error('Discovery response was not an array');
  }
  return parsed.filter(u => typeof u === 'string' && u.startsWith('http')).slice(0, 3);
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
      const markdown = await scrapeWithRetry(url, firecrawlKey);
      console.log('2. Firecrawl done:', Date.now());

      const data = await extractSchema(markdown, prompt, nemotronKey, outFormat);
      console.log('3. Claude done:', Date.now());

      return { url, data, success: true };
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
      const markdown = await scrapeWithRetry(url, firecrawlKey);
      console.log('2. Firecrawl done:', Date.now());
      return { url, markdown, success: true };
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
      scrapedMarkdowns.push({ url: sr.url, markdown: sr.markdown });
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
      result: { url: sr.url, success: sr.success }
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
      results.push({ url: 'combined-comparison', sources: scrapedMarkdowns.map(s => s.url), data });
    } catch (error) {
      console.log('Compare extraction failed:', error.message);
      failed.push({ url: 'combined-comparison', reason: error.message || String(error) });
    }
  } else {
    for (const sr of scrapedOk) {
      try {
        const data = await extractSchema(sr.markdown, prompt, nemotronKey, outFormat);
        console.log('3. Extraction done:', Date.now());
        results.push({ url: sr.url, data });
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
    // --- STEP 1: Discovery ---
    workflow.current_step = 1;
    await saveWorkflowState(workflow);

    let seedUrls = [];
    try {
      seedUrls = await discoverUrls(workflow.goal, nemotronKey);
    } catch (err) {
      console.error("Step 1 failed during LLM call:", err);
    }

    if (seedUrls.length === 0) {
      workflow.status = 'failed';
      workflow.failed.push({ step: 1, reason: "Could not discover URLs for this goal. Try being more specific." });
      workflow.completed_at = Date.now();
      await saveWorkflowState(workflow);
      return;
    }

    workflow.urls_discovered = seedUrls.length;
    workflow.steps_completed.push(1);
    await saveWorkflowState(workflow);

    // --- STEP 2: Scrape Seed URLs ---
    workflow.current_step = 2;
    await saveWorkflowState(workflow);

    const seedScrapeTasks = seedUrls.map((url) => async () => {
      try {
        const markdown = await scrapeWithRetry(url, firecrawlKey);
        if (depth === 1) {
          return { url, markdown, success: true, deepLinks: [] };
        }
        const extractLinksPrompt = `Read this page markdown and extract all relevant hyperlinks matching or pointing to pages related to: "${workflow.goal}".
Return ONLY a JSON array of string URLs. Do NOT include markdown blocks, code blocks, or text. Just the raw valid JSON array.`;
        const deepLinks = await extractSchema(markdown, extractLinksPrompt, nemotronKey, 'json');
        return { url, markdown, success: true, deepLinks: Array.isArray(deepLinks) ? deepLinks : [] };
      } catch (err) {
        return { url, success: false, reason: err.message || String(err) };
      }
    });

    const seedScrapeResults = await runWithConcurrencyLimit(seedScrapeTasks, 5);
    
    let allDeepLinks = [];
    let successfulSeedCount = 0;

    for (const r of seedScrapeResults) {
      if (r.success) {
        successfulSeedCount++;
        workflow.urls_scraped++;
        r.deepLinks.forEach(dl => {
          if (typeof dl === 'string' && dl.startsWith('http') && !allDeepLinks.includes(dl) && !seedUrls.includes(dl)) {
            allDeepLinks.push(dl);
          }
        });
      } else {
        workflow.failed.push({ url: r.url, step: 2, reason: r.reason });
      }
    }

    if (successfulSeedCount === 0) {
      workflow.status = 'failed';
      workflow.completed_at = Date.now();
      await saveWorkflowState(workflow);
      return;
    }

    workflow.steps_completed.push(2);
    await saveWorkflowState(workflow);

    // --- STEP 3: Extract seed pages at depth 1, or scrape discovered links at depth 2 ---
    workflow.current_step = 3;
    await saveWorkflowState(workflow);

    const remainingUrlQuota = Math.max(0, 8 - workflow.urls_scraped);
    const deepLinksToScrape = depth === 2 ? allDeepLinks.slice(0, remainingUrlQuota) : [];

    workflow.urls_discovered = depth === 2 ? seedUrls.length + allDeepLinks.length : seedUrls.length;
    await saveWorkflowState(workflow);

    const pagesToExtract = depth === 1
      ? seedScrapeResults.filter(result => result.success).map(result => ({ url: result.url, markdown: result.markdown, alreadyScraped: true }))
      : deepLinksToScrape.map(url => ({ url, alreadyScraped: false }));

    const deepScrapeTasks = pagesToExtract.map((page) => async () => {
      try {
        const markdown = page.alreadyScraped ? page.markdown : await scrapeWithRetry(page.url, firecrawlKey);
        let extractionPrompt, formatType;
        if (workflow.format === 'text') {
          extractionPrompt = `Extract information matching this goal: "${workflow.goal}".\nReturn the answer as clean, readable plain text. No additional explanations.`;
          formatType = 'text';
        } else {
          extractionPrompt = `Extract information matching this goal: "${workflow.goal}".\nReturn ONLY a valid JSON object or JSON array containing the extracted structured data. No additional explanations.`;
          formatType = 'json';
        }
        const data = await extractSchema(markdown, extractionPrompt, nemotronKey, formatType);
        return { url: page.url, success: true, data, alreadyScraped: page.alreadyScraped };
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

    if (workflow.format === 'text') {
      workflow.results = rawResults;
    } else {
      const uniqueMap = new Map();
      rawResults.forEach(item => {
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
