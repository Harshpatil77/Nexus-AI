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
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nexus AI</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono&family=Space+Grotesk:wght@500;700&display=swap');

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: #0A0A0F;
  color: #F8F8FF;
  font-family: 'Inter', sans-serif;
  max-width: 720px;
  margin: 40px auto;
  padding: 0 24px;
  line-height: 1.6;
}

h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 32px;
  color: #F8F8FF;
  letter-spacing: -0.5px;
}

p.sub {
  font-family: 'Inter', sans-serif;
  color: #6B7280;
  font-size: 14px;
  margin-top: 6px;
  margin-bottom: 24px;
}

.divider {
  height: 1px;
  background-color: #6366F1;
  opacity: 0.3;
  margin-bottom: 32px;
}

.card {
  background: #13131A;
  border: 1px solid #1E1E2E;
  padding: 20px;
  margin-bottom: 20px;
}

label {
  display: block;
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 500;
  font-size: 12px;
  color: #F8F8FF;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

textarea {
  width: 100%;
  background: #0A0A0F;
  border: 1px solid #1E1E2E;
  color: #F8F8FF;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  padding: 12px;
  resize: vertical;
  outline: none;
}

textarea:focus {
  border-color: #6366F1;
}

.url-hint {
  color: #6B7280;
  font-size: 12px;
  margin-top: 8px;
}

.url-hint a {
  color: #6366F1;
  text-decoration: none;
}

.url-hint a:hover {
  text-decoration: underline;
}

#limitError {
  color: #EF4444;
  font-weight: 600;
  margin-top: 12px;
  font-size: 13px;
  display: none;
}

#limitError a {
  color: #EF4444;
  text-decoration: underline;
}

.options-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
}

.pill-group {
  display: flex;
  border: 1px solid #1E1E2E;
  background: #13131A;
  padding: 2px;
}

.pill-group input[type="radio"] {
  display: none;
}

.pill-group label {
  padding: 8px 16px;
  cursor: pointer;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: #6B7280;
  margin-bottom: 0;
  transition: all 0.15s ease;
  text-transform: none;
  letter-spacing: 0;
}

.pill-group input[type="radio"]:checked + label {
  background: #6366F1;
  color: #F8F8FF;
}

/* Custom Checkbox */
.checkbox-container {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: #F8F8FF;
  font-family: 'Inter', sans-serif;
}

.checkbox-container input {
  display: none;
}

.checkbox-custom {
  width: 16px;
  height: 16px;
  border: 1px solid #1E1E2E;
  background: #0A0A0F;
  position: relative;
  display: inline-block;
}

.checkbox-container input:checked + .checkbox-custom::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 8px;
  height: 8px;
  background: #6366F1;
}

/* Run Scrape Button & Pulse */
.btn-wrapper {
  position: relative;
  width: 100%;
}

button[type="submit"] {
  width: 100%;
  background: #6366F1;
  color: #F8F8FF;
  border: none;
  padding: 14px;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 16px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s ease;
}

button[type="submit"]:hover:not(:disabled) {
  background: #4F46E5;
}

button[type="submit"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(99, 102, 241, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
  }
}

.pulse-active {
  animation: pulse-ring 1.5s cubic-bezier(0.24, 0, 0.38, 1) infinite;
}

/* Progress card */
#progressCard {
  background: #13131A;
  border: 1px solid #1E1E2E;
  padding: 20px;
  margin-top: 24px;
  display: none;
}

#status {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 12px;
  color: #F8F8FF;
}

#progressContainer {
  background: #0A0A0F;
  border: 1px solid #1E1E2E;
  height: 8px;
  width: 100%;
  margin-bottom: 16px;
}

#progressBar {
  background: #6366F1;
  height: 100%;
  width: 0%;
  transition: width 0.1s linear;
}

#urlList {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: #F8F8FF;
}

.url-item {
  display: flex;
  align-items: center;
  margin: 8px 0;
  padding: 10px;
  background: #0A0A0F;
  border: 1px solid #1E1E2E;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinning {
  display: inline-block;
  animation: spin 1.2s linear infinite;
}

/* Output Card */
.output-card {
  background: #13131A;
  border: 1px solid #1E1E2E;
  padding: 20px;
  margin-top: 24px;
  display: none;
}

.output-card label {
  margin-bottom: 16px;
}

pre {
  background: #0A0A0F;
  border: 1px solid #1E1E2E;
  padding: 16px;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: #F8F8FF;
  line-height: 1.5;
}

/* Syntax Highlighting */
.json-key { color: #818CF8; font-weight: 600; }
.json-string { color: #34D399; }
.json-number { color: #F59E0B; }
.json-boolean { color: #F472B6; }
.json-null { color: #F87171; }

/* Markdown rendering tags */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  border: 1px solid #1E1E2E;
}

th, td {
  border: 1px solid #1E1E2E;
  padding: 10px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
}

th {
  background: #0A0A0F;
  font-family: 'Space Grotesk', sans-serif;
  color: #F8F8FF;
  text-align: left;
}

td {
  color: #D1D5DB;
}

footer {
  text-align: center;
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #1E1E2E;
  font-size: 12px;
  color: #6B7280;
  font-family: 'Inter', sans-serif;
}

footer a {
  color: #6366F1;
  text-decoration: none;
}
</style>
</head>
<body>
  <h1>Nexus AI</h1>
  <p class="sub">The execution layer for autonomous AI agents.</p>
  <div class="divider"></div>

  <form id="scrapeForm">
    <!-- Card 1: Target URLs -->
    <div class="card">
      <label for="urls">Target URLs</label>
      <textarea id="urls" rows="5" placeholder="https://example.com&#10;https://example2.com"></textarea>
      <div class="url-hint">Free tier: 5 URLs per request. Need more? <a href="mailto:patilharsh310708@gmail.com">Contact us</a>.</div>
      <div id="limitError"></div>
    </div>

    <!-- Card 2: Extraction Instructions -->
    <div class="card">
      <label for="prompt">Extraction Instructions</label>
      <textarea id="prompt" rows="4" placeholder="Extract the company name, email, and pricing from each page"></textarea>
    </div>

    <!-- Option row -->
    <div class="options-row">
      <!-- Pill Toggles for Format -->
      <div>
        <label>Output Format</label>
        <div class="pill-group">
          <input type="radio" id="format-json" name="format" value="json">
          <label for="format-json">JSON</label>
          
          <input type="radio" id="format-text" name="format" value="text" checked>
          <label for="format-text">Plain Text</label>
        </div>
      </div>

      <!-- Compare Mode -->
      <label class="checkbox-container" style="margin-top: 24px;">
        <input type="checkbox" id="compareMode">
        <span class="checkbox-custom"></span>
        <span>Compare Mode</span>
        <span style="color: #6B7280; font-size: 11px;">(combine content)</span>
      </label>
    </div>

    <!-- Run Scrape Wrapper -->
    <div class="btn-wrapper">
      <button type="submit" id="submitBtn">Run Scrape</button>
    </div>
  </form>

  <!-- Progress Card -->
  <div id="progressCard">
    <div id="status">Connecting to stream...</div>
    <div id="progressContainer">
      <div id="progressBar"></div>
    </div>
    <div id="urlList"></div>
  </div>

  <!-- Output Cards -->
  <div id="jsonOutputCard" class="output-card">
    <label>Extracted JSON Output</label>
    <pre id="output"></pre>
  </div>

  <div id="textOutputCard" class="output-card">
    <label>Extracted Plain Text Output</label>
    <pre id="outputText" style="font-family: 'Inter', sans-serif; line-height: 1.6;"></pre>
  </div>

  <footer>
    Free tier: 5 URLs max &middot; Need more? <a href="mailto:patilharsh310708@gmail.com">patilharsh310708@gmail.com</a>
  </footer>

<script>
// JSON syntax highlighter
function syntaxHighlightJson(jsonObj) {
  let json = JSON.stringify(jsonObj, null, 2);
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, function (match) {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return '<span class="' + cls + '">' + match + '</span>';
  });
}

// Simple Markdown table and basic tags parser
function markdownToHtml(text) {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = html.split('\\n');
  let result = [];
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (line.startsWith('|') && line.endsWith('|')) {
      if (line.match(/^\\|[\\s\\-:|]+\\|$/)) {
        continue;
      }
      inTable = true;
      const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      tableRows.push(cells);
      continue;
    } else {
      if (inTable) {
        let tableHtml = '<table>';
        tableRows.forEach((row, rIdx) => {
          tableHtml += '<tr>';
          row.forEach(cell => {
            let cellContent = cell
              .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
              .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
              .replace(/&lt;br&gt;/g, '<br>')
              .replace(/&lt;br\\s*\\/&gt;/g, '<br>');
            if (rIdx === 0) {
              tableHtml += '<th>' + cellContent + '</th>';
            } else {
              tableHtml += '<td>' + cellContent + '</td>';
            }
          });
          tableHtml += '</tr>';
        });
        tableHtml += '</table>';
        result.push(tableHtml);
        tableRows = [];
        inTable = false;
      }
    }

    line = line.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
    line = line.replace(/\\*(.*?)\\*/g, '<em>$1</em>');

    if (line.startsWith('### ')) {
      result.push('<h3 style="margin-top:16px; margin-bottom:8px; font-family:\\'Space Grotesk\\', sans-serif;">' + line.substring(4) + '</h3>');
    } else if (line.startsWith('## ')) {
      result.push('<h2 style="margin-top:20px; margin-bottom:10px; font-family:\\'Space Grotesk\\', sans-serif;">' + line.substring(3) + '</h2>');
    } else if (line.startsWith('# ')) {
      result.push('<h1 style="margin-top:24px; margin-bottom:12px; font-family:\\'Space Grotesk\\', sans-serif;">' + line.substring(2) + '</h1>');
    } else if (line.startsWith('- ')) {
      result.push('<li style="margin-left:20px; margin-bottom:4px;">' + line.substring(2) + '</li>');
    } else if (line === '---') {
      result.push('<hr style="border:0; height:1px; background:#1E1E2E; margin:16px 0;">');
    } else if (line.length > 0) {
      result.push('<p style="margin-bottom:8px;">' + line + '</p>');
    } else {
      result.push('<br>');
    }
  }

  if (inTable) {
    let tableHtml = '<table>';
    tableRows.forEach((row, rIdx) => {
      tableHtml += '<tr>';
      row.forEach(cell => {
        let cellContent = cell
          .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
          .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
          .replace(/&lt;br&gt;/g, '<br>')
          .replace(/&lt;br\\s*\\/&gt;/g, '<br>');
        if (rIdx === 0) {
          tableHtml += '<th>' + cellContent + '</th>';
        } else {
          tableHtml += '<td>' + cellContent + '</td>';
        }
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</table>';
    result.push(tableHtml);
  }

  return result.join('\\n');
}

document.getElementById('scrapeForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const status = document.getElementById('status');
  const progressCard = document.getElementById('progressCard');
  const progressBar = document.getElementById('progressBar');
  const urlList = document.getElementById('urlList');
  const jsonOutputCard = document.getElementById('jsonOutputCard');
  const textOutputCard = document.getElementById('textOutputCard');
  const output = document.getElementById('output');
  const outputText = document.getElementById('outputText');
  const limitError = document.getElementById('limitError');

  const urlsRaw = document.getElementById('urls').value.trim();
  const promptRaw = document.getElementById('prompt').value.trim();
  const format = document.querySelector('input[name="format"]:checked').value;
  const compare = document.getElementById('compareMode').checked;

  limitError.style.display = 'none';
  if (!urlsRaw) { status.textContent = 'Error: Enter at least one URL.'; progressCard.style.display = 'block'; return; }
  if (!promptRaw) { status.textContent = 'Error: Enter an extraction prompt.'; progressCard.style.display = 'block'; return; }

  const urls = urlsRaw.split('\\n').map(u => u.trim()).filter(u => u.length > 0);

  if (urls.length > 5) {
    limitError.innerHTML = 'Free tier is limited to 5 URLs. You submitted ' + urls.length + ' URLs.<br>Need more? Email <a href="mailto:patilharsh310708@gmail.com">patilharsh310708@gmail.com</a> to unlock.';
    limitError.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.classList.add('pulse-active');
  jsonOutputCard.style.display = 'none';
  textOutputCard.style.display = 'none';
  urlList.innerHTML = '';
  urls.forEach((url, i) => {
    urlList.innerHTML += '<div class="url-item" id="url-' + i + '"><span class="status-icon spinning" id="icon-' + i + '" style="color:#6366F1; margin-right:8px; font-weight:bold;">⟳</span><span class="url-text">' + url + '</span></div>';
  });

  progressCard.style.display = 'block';
  progressBar.style.width = '0%';
  status.textContent = 'Connecting to stream...';

  try {
    const res = await fetch('/scrape-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, prompt: promptRaw, format, compare })
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

              const idx = urls.indexOf(currentUrl);
              if (idx !== -1) {
                const icon = document.getElementById('icon-' + idx);
                if (icon) {
                  icon.className = 'status-icon';
                  if (success) {
                    icon.style.color = '#22C55E';
                    icon.innerHTML = '✓';
                  } else {
                    icon.style.color = '#EF4444';
                    icon.innerHTML = '✗';
                  }
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
                  if (resultsData.compare) {
                    formattedText += '=== Combined Comparison ===\\n\\n' + r.data + '\\n\\n';
                  } else {
                    formattedText += '=== URL: ' + r.url + ' ===\\n\\n' + r.data + '\\n\\n';
                  }
                });
                if (resultsData.failed.length > 0) {
                  formattedText += '=== Failed URLs ===\\n';
                  resultsData.failed.forEach(f => {
                    formattedText += '- ' + f.url + ' (Reason: ' + f.reason + ')\\n';
                  });
                }
                outputText.innerHTML = markdownToHtml(formattedText.trim());
                textOutputCard.style.display = 'block';
              } else {
                output.innerHTML = syntaxHighlightJson(resultsData);
                jsonOutputCard.style.display = 'block';
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
    btn.classList.remove('pulse-active');
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

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let completedCount = 0;
  const results = [];
  const failed = [];
  const scrapedMarkdowns = []; // For compare mode

  // Phase 1: Scrape all URLs
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

  // Separate successes and failures from scraping
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

  // Phase 2: Extract with AI
  if (compareMode && scrapedOk.length > 0) {
    // COMPARE MODE: Combine all scraped content into one prompt
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
    // NORMAL MODE: Extract each URL independently
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
