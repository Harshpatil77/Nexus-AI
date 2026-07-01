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
#urlList { margin-top: 16px; border-left: 3px solid #ccc; padding-left: 12px; font-size: 14px; }
.url-item { margin: 6px 0; }
#output { margin-top: 16px; background: #f4f4f4; border: 1px solid #ccc; padding: 12px; white-space: pre-wrap; word-wrap: break-word; font-size: 13px; display: none; }
#outputText { margin-top: 16px; background: #ffffff; border: 1px solid #ccc; padding: 12px; white-space: pre-wrap; word-wrap: break-word; font-size: 14px; font-family: inherit; display: none; line-height: 1.5; }
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

  <label>Output Format:</label>
  <div style="margin-top: 6px; display: flex; gap: 20px; align-items: center;">
    <label style="display: inline; font-weight: normal; margin-top: 0; cursor: pointer;">
      <input type="radio" name="format" value="json" style="cursor: pointer;"> JSON
    </label>
    <label style="display: inline; font-weight: normal; margin-top: 0; cursor: pointer;">
      <input type="radio" name="format" value="text" checked style="cursor: pointer;"> Plain Text
    </label>
  </div>

  <button type="submit" id="submitBtn">Run Scrape</button>
</form>
<div id="status"></div>
<div id="progressContainer"><div id="progressBar"></div></div>
<div id="urlList"></div>
<pre id="output"></pre>
<pre id="outputText"></pre>

<hr>
<p><b>Endpoints:</b> POST /scrape &middot; POST /scrape-stream &middot; GET /scrape/:state_id &middot; GET /health</p>

<script>
document.getElementById('scrapeForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const status = document.getElementById('status');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const urlList = document.getElementById('urlList');
  const output = document.getElementById('output');
  const outputText = document.getElementById('outputText');

  const urlsRaw = document.getElementById('urls').value.trim();
  const promptRaw = document.getElementById('prompt').value.trim();
  const format = document.querySelector('input[name="format"]:checked').value;

  if (!urlsRaw) { status.textContent = 'Error: Enter at least one URL.'; return; }
  if (!promptRaw) { status.textContent = 'Error: Enter an extraction prompt.'; return; }

  const urls = urlsRaw.split('\\n').map(u => u.trim()).filter(u => u.length > 0);

  btn.disabled = true;
  output.style.display = 'none';
  outputText.style.display = 'none';
  urlList.innerHTML = '';
  urls.forEach((url, i) => {
    urlList.innerHTML += '<div class="url-item" id="url-' + i + '">' + url + ' ⏳</div>';
  });

  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  status.textContent = 'Connecting to stream...';

  try {
    const res = await fetch('/scrape-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, prompt: promptRaw, format })
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsedErr = {};
      try { parsedErr = JSON.parse(errText); } catch(e) {}
      throw new Error(parsedErr.error || 'Server returned status ' + res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    status.textContent = 'Scraping URL 0 of ' + urls.length + '...';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          try {
            const eventData = JSON.parse(jsonStr);
            if (eventData.type === 'progress') {
              const completed = eventData.completed;
              const total = eventData.total;
              const currentUrl = eventData.current_url;
              const success = eventData.result.success;

              const pct = (completed / total) * 100;
              progressBar.style.width = pct + '%';
              status.textContent = 'Scraping URL ' + completed + ' of ' + total + '...';

              // Update matching URL item emoji
              const idx = urls.indexOf(currentUrl);
              if (idx !== -1) {
                const el = document.getElementById('url-' + idx);
                if (el) {
                  el.textContent = currentUrl + ' ' + (success ? '✅' : '❌');
                }
              }
            } else if (eventData.type === 'done') {
              progressBar.style.width = '100%';
              status.textContent = 'Done — ' + eventData.succeeded + ' succeeded, ' + eventData.failed_count + ' failed. State ID: ' + eventData.state_id;

              // Retrieve final state data
              const resultsRes = await fetch('/scrape/' + eventData.state_id);
              const resultsData = await resultsRes.json();

              if (resultsData.format === 'text') {
                let formattedText = '';
                resultsData.results.forEach((r, idx) => {
                  formattedText += '=== URL: ' + r.url + ' ===\\n\\n' + r.data + '\\n\\n';
                });
                if (resultsData.failed.length > 0) {
                  formattedText += '=== Failed URLs ===\\n';
                  resultsData.failed.forEach(f => {
                    formattedText += '- ' + f.url + ' (Reason: ' + f.reason + ')\\n';
                  });
                }
                outputText.textContent = formattedText.trim();
                outputText.style.display = 'block';
              } else {
                output.textContent = JSON.stringify(resultsData, null, 2);
                output.style.display = 'block';
              }
            }
          } catch(e) {
            console.error('Failed to parse event line:', line, e);
          }
        }
      }
    }
  } catch(err) {
    status.textContent = 'Request failed: ' + err.message;
    progressBar.style.width = '0%';
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
async function extractSchema(markdown, userPrompt, apiKey, format = 'json') {
  let prompt = `From this content, extract the following information and return ONLY a clean JSON object: ${userPrompt}\nContent: ${markdown}`;
  if (format === 'text') {
    prompt = `From this content, extract the following information and return it as clean, readable plain text with clear labels:\n${userPrompt}\nContent: ${markdown}`;
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

  if (urls.length < 1 || urls.length > 100) {
    return res.status(400).json({ error: 'urls array must contain between 1 and 100 items' });
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
      // 1. Scraping with retry
      const markdown = await scrapeWithRetry(url, firecrawlKey);
      console.log('2. Firecrawl done:', Date.now());

      // 2. Extract schema using Nemotron
      const data = await extractSchema(markdown, prompt, nemotronKey, outFormat);
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
    format: outFormat,
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

// POST /scrape-stream endpoint
app.post('/scrape-stream', async (req, res) => {
  const { urls, prompt, format } = req.body;
  const outFormat = format || 'json';

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

  if (outFormat !== 'json' && outFormat !== 'text') {
    return res.status(400).json({ error: 'format must be either "json" or "text"' });
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const nemotronKey = process.env.NVIDIA_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (!firecrawlKey || !nemotronKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing API keys' });
  }

  const stateId = crypto.randomUUID();

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let completedCount = 0;
  const results = [];
  const failed = [];

  // Create tasks for each URL that also streams progress events
  const tasks = urls.map((url) => async () => {
    let urlResult;
    try {
      console.log('1. Starting Firecrawl:', Date.now());
      const markdown = await scrapeWithRetry(url, firecrawlKey);
      console.log('2. Firecrawl done:', Date.now());

      const data = await extractSchema(markdown, prompt, nemotronKey, outFormat);
      console.log('3. Claude done:', Date.now());

      urlResult = { url, data, success: true };
      results.push({ url, data });
    } catch (error) {
      console.log('Task execution failed:', error.message);
      urlResult = { url, reason: error.message || String(error), success: false };
      failed.push({ url, reason: urlResult.reason });
    }

    completedCount++;

    // Send progress event
    res.write(`data: ${JSON.stringify({
      type: "progress",
      completed: completedCount,
      total: urls.length,
      current_url: url,
      result: urlResult
    })}\n\n`);

    return urlResult;
  });

  // Execute tasks with a concurrency limit of 5
  await runWithConcurrencyLimit(tasks, 5);

  const output = {
    state_id: stateId,
    format: outFormat,
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

  // Send done event at the end
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
