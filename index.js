import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
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

// Claude extraction helper
async function extractSchema(markdown, schema, apiKey) {
  const prompt = `Extract the following fields from this content and return ONLY a JSON object with these exact keys: ${JSON.stringify(schema)}. Content: ${markdown}`;

  const anthropicUrl = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';
  const response = await fetch(anthropicUrl, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API responded with status ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  if (!json.content || json.content.length === 0 || !json.content[0].text) {
    throw new Error(`Anthropic API returned unexpected response: ${JSON.stringify(json)}`);
  }

  const text = json.content[0].text.trim();
  
  // Clean JSON formatting from Claude
  let cleaned = text;
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse Claude's response as JSON: ${err.message}. Content was: ${text}`);
  }
}

// POST /scrape endpoint
app.post('/scrape', async (req, res) => {
  const { urls, schema } = req.body;

  // Validation
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls must be an array' });
  }

  if (urls.length < 1 || urls.length > 100) {
    return res.status(400).json({ error: 'urls array must contain between 1 and 100 items' });
  }

  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return res.status(400).json({ error: 'schema must be a valid non-array object' });
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!firecrawlKey || !anthropicKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing API keys' });
  }

  const stateId = crypto.randomUUID();

  // Create tasks for each URL
  const tasks = urls.map((url) => async () => {
    try {
      // 1. Scraping with retry
      const markdown = await scrapeWithRetry(url, firecrawlKey);
      // 2. Extract schema using Claude
      const data = await extractSchema(markdown, schema, anthropicKey);
      return { url, data, success: true };
    } catch (error) {
      return { url, reason: error.message || String(error), success: false };
    }
  });

  // Execute tasks with a concurrency limit of 5
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
    results,
    failed,
    total: urls.length,
    succeeded: results.length,
    failed_count: failed.length
  };

  // Save the full output to local file
  try {
    const filePath = path.join(process.cwd(), `${stateId}.json`);
    await fs.writeFile(filePath, JSON.stringify(output, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Failed to save state file for ${stateId}:`, err);
  }

  return res.status(200).json(output);
});

// GET /scrape/:state_id endpoint
app.get('/scrape/:state_id', async (req, res) => {
  const { state_id } = req.params;

  // Simple validation to prevent directory traversal
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

app.listen(PORT, () => {
  console.log(`Nexus AI API server running on port ${PORT}`);
});
