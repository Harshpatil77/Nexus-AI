import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<title>Nexus AI</title>
<style>
body { font-family: monospace; max-width: 700px; margin: 40px auto; padding: 0 20px; }
h1 { margin-bottom: 4px; }
p.sub { color: #666; margin-top: 0; }
label { display: block; font-weight: bold; margin-top: 16px; }
textarea { width: 100%; box-sizing: border-box; font-family: monospace; font-size: 14px; padding: 8px; margin-top: 4px; }
button { margin-top: 16px; padding: 10px 24px; font-size: 16px; font-family: monospace; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
#status { margin-top: 12px; font-weight: bold; line-height: 1.5; }
#progressContainer { margin-top: 12px; background: #eee; border: 1px solid #ccc; height: 16px; width: 100%; display: none; }
#progressBar { background: #333; height: 100%; width: 0%; transition: width 0.1s linear; }
#output { margin-top: 12px; background: #f4f4f4; border: 1px solid #ccc; padding: 12px; white-space: pre-wrap; word-wrap: break-word; font-size: 13px; display: none; }
</style>
</head>
<body>
<h1>Nexus AI</h1>
<p class="sub">The execution layer for autonomous AI agents.</p>
<hr>
<form id="scrapeForm">
  <label for="urls">URLs (one per line):</label>
  <textarea id="urls" rows="5" placeholder="https://example.com&#10;https://example2.com"></textarea>

  <label for="prompt">What do you want to extract?</label>
  <textarea id="prompt" rows="4" placeholder="Extract the company name, email, and pricing from each page"></textarea>

  <button type="submit" id="submitBtn">Run Scrape</button>
</form>
<div id="status"></div>
<div id="progressContainer"><div id="progressBar"></div></div>
<pre id="output"></pre>

<hr>
<p><b>Endpoints:</b> POST /scrape &middot; GET /scrape/:state_id &middot; GET /health</p>

<script>
document.getElementById('scrapeForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const status = document.getElementById('status');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const output = document.getElementById('output');

  const urlsRaw = document.getElementById('urls').value.trim();
  const promptRaw = document.getElementById('prompt').value.trim();

  if (!urlsRaw) { status.textContent = 'Error: Enter at least one URL.'; return; }
  if (!promptRaw) { status.textContent = 'Error: Enter an extraction prompt.'; return; }

  const urls = urlsRaw.split('\\n').map(u => u.trim()).filter(u => u.length > 0);

  btn.disabled = true;
  output.style.display = 'none';

  // Estimate duration: assume ~10 seconds per URL if processed sequentially, but since limit is 5,
  // we scale the baseline estimation accordingly.
  const estimatedSeconds = Math.max(30, Math.ceil(urls.length / 5) * 12);
  let elapsedSeconds = 0;

  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  status.innerHTML = 'Processing ' + urls.length + ' URLs...<br>0.0s elapsed (Estimated: ~' + estimatedSeconds + 's).<br>Grab a coffee ☕';

  const timer = setInterval(() => {
    elapsedSeconds += 0.1;
    const pct = Math.min(95, (elapsedSeconds / estimatedSeconds) * 100);
    progressBar.style.width = pct + '%';
    status.innerHTML = 'Processing ' + urls.length + ' URLs...<br>' + elapsedSeconds.toFixed(1) + 's elapsed (Estimated: ~' + estimatedSeconds + 's).<br>Grab a coffee ☕';
  }, 100);

  try {
    const res = await fetch('/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, prompt: promptRaw })
    });
    const data = await res.json();
    clearInterval(timer);
    progressBar.style.width = '100%';
    output.textContent = JSON.stringify(data, null, 2);
    output.style.display = 'block';
    status.textContent = 'Done — ' + data.succeeded + '/' + data.total + ' succeeded. State ID: ' + data.state_id;
  } catch(err) {
    clearInterval(timer);
    progressBar.style.width = '0%';
    status.textContent = 'Request failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});
</script>
</body>
</html>`);
});

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

// Nemotron extraction helper
async function extractSchema(markdown, userPrompt, apiKey) {
  const prompt = `From this content, extract the following information and return ONLY a clean JSON object: ${userPrompt}\nContent: ${markdown}`;

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
  
  // Clean JSON formatting from Nemotron
  let cleaned = text;
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
  const { urls, prompt } = req.body;

  // Validation
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls must be an array' });
  }

  if (urls.length < 1 || urls.length > 100) {
    return res.status(400).json({ error: 'urls array must contain between 1 and 100 items' });
  }

  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    return res.status(400).json({ error: 'prompt must be a non-empty string' });
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
      // 1. Scraping with retry
      const markdown = await scrapeWithRetry(url, firecrawlKey);
      console.log('2. Firecrawl done:', Date.now());

      // 2. Extract schema using Nemotron
      const data = await extractSchema(markdown, prompt, nemotronKey);
      console.log('3. Claude done:', Date.now());

      return { url, data, success: true };
    } catch (error) {
      console.log('Task execution failed:', error.message);
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
    console.log('4. File saved:', Date.now());
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
