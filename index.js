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
  color: #F8F8FF;
  letter-spacing: -0.5px;
  font-size: 48px;
  line-height: 1.1;
  margin-bottom: 16px;
}

.hero {
  text-align: center;
  padding: 48px 0 40px;
}

.badge {
  display: inline-block;
  border: 1px solid #6366F1;
  color: #818CF8;
  font-size: 12px;
  font-family: 'Space Grotesk', sans-serif;
  padding: 6px 14px;
  margin-bottom: 24px;
  letter-spacing: 0.5px;
}

.gradient-text {
  background: linear-gradient(
    135deg, #6366F1, #818CF8
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-sub {
  color: #9CA3AF;
  font-size: 16px;
  max-width: 480px;
  margin: 0 auto 28px;
  line-height: 1.6;
}

.stats-row {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 40px;
}

.stat {
  background: #13131A;
  border: 1px solid #1E1E2E;
  color: #9CA3AF;
  font-size: 13px;
  padding: 8px 16px;
  font-family: 'Inter', sans-serif;
}

.how-it-works {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 40px;
  flex-wrap: wrap;
}

.step {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #13131A;
  border: 1px solid #1E1E2E;
  padding: 16px 20px;
}

.step-num {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: #6366F1;
}

.step-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-text strong {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 14px;
  color: #F8F8FF;
}

.step-text span {
  font-size: 12px;
  color: #6B7280;
}

.step-arrow {
  color: #6366F1;
  font-size: 20px;
  font-weight: bold;
}

.card-hint {
  font-size: 12px;
  color: #6B7280;
  margin-bottom: 12px;
  font-family: 'Inter', sans-serif;
}

.examples {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.example-label {
  font-size: 12px;
  color: #6B7280;
  font-family: 'Inter', sans-serif;
}

.example-btn {
  background: #0A0A0F;
  border: 1px solid #1E1E2E;
  color: #9CA3AF;
  font-size: 12px;
  padding: 6px 12px;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  transition: all 0.15s;
}

.example-btn:hover {
  border-color: #6366F1;
  color: #F8F8FF;
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
  margin-top: 60px;
  padding: 24px 0;
  border-top: 1px solid #1E1E2E;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.footer-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #6B7280;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #6B7280;
}

.footer-right a {
  color: #6366F1;
  text-decoration: none;
}

.footer-right a:hover {
  text-decoration: underline;
}

@media (max-width: 600px) {
  h1 { font-size: 32px; }
  
  .how-it-works { 
    flex-direction: column;
  }
  
  .step-arrow { 
    transform: rotate(90deg);
  }
  
  .stats-row {
    flex-direction: column;
    align-items: center;
  }
  
  .footer-content {
    flex-direction: column;
    text-align: center;
  }
  
  .options-row {
    flex-direction: column;
  }
}

/* Tab Navigation */
.tab-nav {
  display: flex;
  gap: 4px;
  margin-bottom: 28px;
  border-bottom: 1px solid #1E1E2E;
}

.tab-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #6B7280;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 14px;
  font-weight: 600;
  padding: 12px 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  letter-spacing: 0.3px;
}

.tab-btn:hover {
  color: #F8F8FF;
}

.tab-btn.active {
  color: #F8F8FF;
  border-bottom-color: #6366F1;
}

.tab-content {
  display: none;
}

.tab-content.active {
  display: block;
}

/* Workflow Styles */
.workflow-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 16px 0;
}

.wf-step {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #0A0A0F;
  border: 1px solid #1E1E2E;
  transition: all 0.3s ease;
  opacity: 0.4;
}

.wf-step.active {
  opacity: 1;
  border-color: #6366F1;
  background: #13131A;
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.15);
}

.wf-step.active .wf-step-icon {
  animation: pulse-ring 1.5s cubic-bezier(0.24, 0, 0.38, 1) infinite;
}

.wf-step.completed {
  opacity: 1;
  border-color: rgba(34, 197, 94, 0.3);
}

.wf-step.failed {
  opacity: 1;
  border-color: #EF4444;
}

.wf-step-icon {
  font-size: 24px;
  min-width: 36px;
  text-align: center;
}

.wf-step-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.wf-step-info strong {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 14px;
  color: #F8F8FF;
}

.wf-step-desc {
  font-size: 12px;
  color: #6B7280;
}

.wf-step-status {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #22C55E;
  margin-left: auto;
}

.wf-stats {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  background: #0A0A0F;
  border: 1px solid #1E1E2E;
  margin-top: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: #9CA3AF;
}

.wf-result-summary {
  padding: 12px 16px;
  background: #0A0A0F;
  border: 1px solid #1E1E2E;
  margin-bottom: 16px;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 14px;
  color: #F8F8FF;
}

.wf-download-btn {
  width: 100%;
  background: transparent;
  border: 1px solid #6366F1;
  color: #6366F1;
  padding: 12px;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 16px;
  transition: all 0.2s ease;
  letter-spacing: 0.5px;
}

.wf-download-btn:hover {
  background: #6366F1;
  color: #F8F8FF;
}

.wf-submit-btn {
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

.wf-submit-btn:hover:not(:disabled) {
  background: #4F46E5;
}

.wf-submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.depth-select {
  width: 100%;
  background: #0A0A0F;
  border: 1px solid #1E1E2E;
  color: #F8F8FF;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  padding: 12px;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236B7280' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}

.depth-select:focus {
  border-color: #6366F1;
}

.depth-select option {
  background: #13131A;
  color: #F8F8FF;
}
</style>
</head>
<body>
  <div class="hero">
    <!-- Animated badge above title -->
    <div class="badge">
      ⚡ Built for AI Agents & Developers
    </div>
    
    <!-- Main headline -->
    <h1>Scrape Any Website<br>
    <span class="gradient-text">
    With Plain English
    </span></h1>
    
    <!-- Subheadline -->
    <p class="hero-sub">
    No JSON schemas. No pipeline crashes. 
    No hidden costs. Just paste URLs and 
    tell us what you want.
    </p>
    
    <!-- 3 stat pills -->
    <div class="stats-row">
      <div class="stat">⚡ 5 URLs in parallel</div>
      <div class="stat">🔄 Auto-retry on failures</div>
      <div class="stat">🎯 Plain English prompts</div>
    </div>
  </div>

  <div class="how-it-works">
    <div class="step">
      <div class="step-num">01</div>
      <div class="step-text">
        <strong>Paste URLs</strong>
        <span>Up to 5 websites at once</span>
      </div>
    </div>
    <div class="step-arrow">→</div>
    <div class="step">
      <div class="step-num">02</div>
      <div class="step-text">
        <strong>Describe in English</strong>
        <span>Tell us what to extract</span>
      </div>
    </div>
    <div class="step-arrow">→</div>
    <div class="step">
      <div class="step-num">03</div>
      <div class="step-text">
        <strong>Get Results</strong>
        <span>Clean JSON or plain text</span>
      </div>
    </div>
  </div>

  <!-- Tab Navigation -->
  <div class="tab-nav">
    <button class="tab-btn active" data-tab="scraper" onclick="switchTab('scraper')">🔍 Scraper</button>
    <button class="tab-btn" data-tab="workflow" onclick="switchTab('workflow')">🤖 Workflow</button>
  </div>

  <div id="scraperTab" class="tab-content active">
  <form id="scrapeForm">
    <!-- Card 1: Target URLs -->
    <div class="card">
      <label>Target URLs</label>
      <p class="card-hint">
      One URL per line. 
      We scrape all of them in parallel.
      </p>
      <textarea id="urls" rows="5" placeholder="https://example.com&#10;https://example2.com"></textarea>
      <div class="url-hint">Free tier: 5 URLs per request. Need more? <a href="mailto:patilharsh310708@gmail.com">Contact us</a>.</div>
      <div id="limitError"></div>
    </div>

    <!-- Card 2: Extraction Instructions -->
    <div class="card">
      <label>What do you want to extract?</label>
      <p class="card-hint">
      Write in plain English. 
      Example: "Extract company name, 
      pricing plans, and contact email"
      </p>
      <textarea id="prompt" rows="4" placeholder="Extract the company name, email, and pricing from each page"></textarea>
      
      <!-- Examples -->
      <div class="examples">
        <span class="example-label">
          Try an example:
        </span>
        <button type="button" class="example-btn" onclick="setPrompt('Extract company name, pricing, and contact email')">
          💼 Company Info
        </button>
        <button type="button" class="example-btn" onclick="setPrompt('Extract the main product features and pricing tiers')">
          🛍️ Product Details
        </button>
        <button type="button" class="example-btn" onclick="setPrompt('Extract the job title, requirements, and salary range')">
          💼 Job Listings
        </button>
        <button type="button" class="example-btn" onclick="setPrompt('Extract the article title, author, date, and key summary')">
          📰 News Articles
        </button>
      </div>
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
  </div><!-- end scraperTab -->

  <div id="workflowTab" class="tab-content">
    <!-- Workflow Form: Goal -->
    <div class="card">
      <label>Your Goal</label>
      <p class="card-hint">
        Describe what you want in plain English. Nexus AI will autonomously discover URLs, scrape them, and extract structured data.
      </p>
      <textarea id="wfGoal" rows="4" placeholder="Find all AI tools launched this week on ProductHunt, extract their names, pricing, and founding team"></textarea>
    </div>

    <!-- Workflow Form: Depth & Format Options -->
    <div class="options-row" style="margin-bottom: 24px;">
      <div>
        <label>Crawl Depth</label>
        <select id="wfDepth" class="depth-select" style="min-width: 220px;">
          <option value="1">Depth 1 — Seed pages only</option>
          <option value="2" selected>Depth 2 — Follow discovered links</option>
        </select>
      </div>

      <div>
        <label>Output Format</label>
        <div class="pill-group">
          <input type="radio" id="wf-format-json" name="wfformat" value="json" checked>
          <label for="wf-format-json">JSON</label>
          
          <input type="radio" id="wf-format-text" name="wfformat" value="text">
          <label for="wf-format-text">Plain Text</label>
        </div>
      </div>
    </div>

    <!-- Run Workflow Button -->
    <div class="btn-wrapper">
      <button type="button" id="wfSubmitBtn" class="wf-submit-btn" onclick="runWorkflow()">⚡ Run Workflow</button>
    </div>

    <!-- Workflow Progress -->
    <div id="wfProgressCard" class="card" style="display:none; margin-top: 24px;">
      <label>Workflow Progress</label>
      <div id="wfSteps" class="workflow-steps">
        <div class="wf-step" id="wfStep1">
          <span class="wf-step-icon">🔍</span>
          <div class="wf-step-info">
            <strong>Step 1: Discovering seed URLs</strong>
            <span class="wf-step-desc">Converting your goal into starting URLs</span>
          </div>
          <span class="wf-step-status" id="wfStep1Status"></span>
        </div>
        <div class="wf-step" id="wfStep2">
          <span class="wf-step-icon">🌐</span>
          <div class="wf-step-info">
            <strong>Step 2: Scraping seed pages</strong>
            <span class="wf-step-desc">Extracting content from discovered URLs</span>
          </div>
          <span class="wf-step-status" id="wfStep2Status"></span>
        </div>
        <div class="wf-step" id="wfStep3">
          <span class="wf-step-icon">🔗</span>
          <div class="wf-step-info">
            <strong>Step 3: Deep link scraping</strong>
            <span class="wf-step-desc">Following and scraping linked pages</span>
          </div>
          <span class="wf-step-status" id="wfStep3Status"></span>
        </div>
        <div class="wf-step" id="wfStep4">
          <span class="wf-step-icon">🧹</span>
          <div class="wf-step-info">
            <strong>Step 4: Merge & Deduplicate</strong>
            <span class="wf-step-desc">Combining and cleaning all results</span>
          </div>
          <span class="wf-step-status" id="wfStep4Status"></span>
        </div>
      </div>

      <div id="wfStats" class="wf-stats" style="display:none;">
        <span id="wfUrlsDiscovered">URLs discovered: 0</span>
        <span id="wfUrlsScraped">URLs scraped: 0</span>
      </div>
    </div>

    <!-- Workflow Results -->
    <div id="wfResultCard" class="output-card" style="display:none;">
      <label>Workflow Results</label>
      <div id="wfResultSummary" class="wf-result-summary"></div>
      <pre id="wfResultOutput"></pre>
      <button type="button" id="wfDownloadBtn" class="wf-download-btn" onclick="downloadWorkflowJson()">
        ⬇ Download as JSON
      </button>
    </div>

    <!-- Workflow Error -->
    <div id="wfErrorCard" class="output-card" style="display:none; border-color: #EF4444;">
      <label style="color: #EF4444;">Workflow Failed</label>
      <pre id="wfErrorOutput" style="color: #EF4444;"></pre>
    </div>
  </div><!-- end workflowTab -->

  <footer>
    <div class="footer-content">
      <div class="footer-left">
        <strong style="font-family:'Space Grotesk', sans-serif; color:#F8F8FF">
          Nexus AI
        </strong>
        <span>The execution layer for autonomous AI agents</span>
      </div>
      <div class="footer-right">
        <span>Free tier: 5 URLs max</span>
        <span>·</span>
        <a href="mailto:patilharsh310708@gmail.com">
          Unlock more →
        </a>
        <span>·</span>
        <a href="https://github.com/Harshpatil77/Nexus-AI" target="_blank">
          ⭐ GitHub
        </a>
      </div>
    </div>
  </footer>

<script>
function setPrompt(text) {
  document.getElementById('prompt').value = text;
}

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

// ═══════════════════════════════════
// Tab Switching
// ═══════════════════════════════════
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
  document.querySelector('[data-tab="' + tabName + '"]').classList.add('active');
  document.getElementById(tabName + 'Tab').classList.add('active');
}

// ═══════════════════════════════════
// Workflow Logic
// ═══════════════════════════════════
let workflowPollingInterval = null;
let currentWorkflowData = null;

async function runWorkflow() {
  var goal = document.getElementById('wfGoal').value.trim();
  var depth = parseInt(document.getElementById('wfDepth').value);
  var btn = document.getElementById('wfSubmitBtn');
  var progressCard = document.getElementById('wfProgressCard');
  var resultCard = document.getElementById('wfResultCard');
  var errorCard = document.getElementById('wfErrorCard');

  if (!goal) {
    alert('Please enter a goal for the workflow.');
    return;
  }

  btn.disabled = true;
  btn.classList.add('pulse-active');
  progressCard.style.display = 'block';
  resultCard.style.display = 'none';
  errorCard.style.display = 'none';
  currentWorkflowData = null;

  // Reset all steps
  for (var i = 1; i <= 4; i++) {
    document.getElementById('wfStep' + i).className = 'wf-step';
    document.getElementById('wfStep' + i + 'Status').textContent = '';
  }
  document.getElementById('wfStats').style.display = 'none';
  document.getElementById('wfUrlsDiscovered').textContent = 'URLs discovered: 0';
  document.getElementById('wfUrlsScraped').textContent = 'URLs scraped: 0';

  var format = document.querySelector('input[name="wfformat"]:checked').value;

  try {
    var res = await fetch('/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: goal, depth: depth, format: format })
    });

    if (!res.ok) {
      var err = await res.json();
      throw new Error(err.error || 'Failed to start workflow');
    }

    var data = await res.json();
    // Mark step 1 as active immediately
    document.getElementById('wfStep1').className = 'wf-step active';
    startWorkflowPolling(data.workflow_id);

  } catch(err) {
    errorCard.style.display = 'block';
    document.getElementById('wfErrorOutput').textContent = err.message;
    btn.disabled = false;
    btn.classList.remove('pulse-active');
  }
}

function startWorkflowPolling(workflowId) {
  if (workflowPollingInterval) {
    clearInterval(workflowPollingInterval);
  }
  workflowPollingInterval = setInterval(async function() {
    try {
      var res = await fetch('/workflow/' + workflowId);
      if (!res.ok) return;
      var data = await res.json();
      currentWorkflowData = data;

      updateWorkflowSteps(data);

      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(workflowPollingInterval);
        workflowPollingInterval = null;
        document.getElementById('wfSubmitBtn').disabled = false;
        document.getElementById('wfSubmitBtn').classList.remove('pulse-active');

        if (data.status === 'completed') {
          showWorkflowResults(data);
        } else {
          var errorCard = document.getElementById('wfErrorCard');
          errorCard.style.display = 'block';
          var failReasons = (data.failed || []).map(function(f) {
            return (f.step ? 'Step ' + f.step + ': ' : '') + f.reason;
          }).join('\\n');
          document.getElementById('wfErrorOutput').textContent = failReasons || 'Workflow failed. Please try a more specific goal.';
        }
      }
    } catch(e) {
      console.error('Workflow polling error:', e);
    }
  }, 3000);
}

function updateWorkflowSteps(data) {
  for (var i = 1; i <= 4; i++) {
    var step = document.getElementById('wfStep' + i);
    var statusEl = document.getElementById('wfStep' + i + 'Status');
    if (data.steps_completed && data.steps_completed.indexOf(i) !== -1) {
      step.className = 'wf-step completed';
      statusEl.textContent = '✓ Done';
    } else if (data.current_step === i && data.status === 'processing') {
      step.className = 'wf-step active';
      statusEl.textContent = '⟳ Running...';
      statusEl.style.color = '#6366F1';
    } else if (data.status === 'failed' && data.current_step === i) {
      step.className = 'wf-step failed';
      statusEl.textContent = '✗ Failed';
      statusEl.style.color = '#EF4444';
    } else {
      step.className = 'wf-step';
      statusEl.textContent = '';
    }
  }

  var stats = document.getElementById('wfStats');
  stats.style.display = 'flex';
  document.getElementById('wfUrlsDiscovered').textContent = 'URLs discovered: ' + (data.urls_discovered || 0);
  document.getElementById('wfUrlsScraped').textContent = 'URLs scraped: ' + (data.urls_scraped || 0);
}

function showWorkflowResults(data) {
  var resultCard = document.getElementById('wfResultCard');
  resultCard.style.display = 'block';

  var summary = document.getElementById('wfResultSummary');
  summary.innerHTML = '<span style="color:#22C55E;">✓ Completed</span> — ' +
    (data.urls_scraped || 0) + ' URLs scraped, ' +
    (data.results ? data.results.length : 0) + ' results extracted';

  var outputEl = document.getElementById('wfResultOutput');
  if (data.format === 'text') {
    outputEl.style.fontFamily = "'Inter', sans-serif";
    outputEl.style.lineHeight = "1.6";
    var compiledText = '';
    (data.results || []).forEach(function(r) {
      compiledText += '### URL: ' + r.url + '\n\n' + r.text + '\n\n---\n\n';
    });
    outputEl.innerHTML = markdownToHtml(compiledText.trim());
  } else {
    outputEl.style.fontFamily = "'JetBrains Mono', monospace";
    outputEl.style.lineHeight = "1.5";
    outputEl.innerHTML = syntaxHighlightJson(data);
  }
}

function downloadWorkflowJson() {
  if (!currentWorkflowData) return;
  var jsonStr = JSON.stringify(currentWorkflowData, null, 2);
  var blob = new Blob([jsonStr], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'workflow_' + currentWorkflowData.workflow_id + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
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

// GET /workflow/:workflow_id endpoint
app.get('/workflow/:workflow_id', async (req, res) => {
  const { workflow_id } = req.params;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(workflow_id)) {
    return res.status(400).json({ error: 'Invalid workflow_id format' });
  }

  const filePath = path.join(process.cwd(), `workflow_${workflow_id}.json`);

  // Retry once if file is mid-write (race condition on Windows)
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

  // silently clamp/default depth to 2
  let targetDepth = parseInt(depth, 10);
  if (isNaN(targetDepth) || targetDepth < 1 || targetDepth > 2) {
    targetDepth = 2;
  }

  // format defaults to json
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

  // Run the workflow autonomously in the background
  runWorkflowAsync(workflow, targetDepth, firecrawlKey, nemotronKey);

  return res.status(201).json({
    workflow_id: workflowId,
    status: 'processing',
    goal: goal
  });
});

// Asynchronous workflow executor
async function runWorkflowAsync(workflow, depth, firecrawlKey, nemotronKey) {
  try {
    // --- STEP 1: Discovery ---
    workflow.current_step = 1;
    await saveWorkflowState(workflow);

    const discoveryPrompt = `You are a web discovery agent. Convert the user's high-level research goal into a JSON list of starting seed URLs (maximum 3 URLs) that are best suited to gather the initial information or links.
Goal: "${workflow.goal}"

Return ONLY a JSON array of string URLs, like: ["https://example.com/page1", "https://example.com/page2"]. Do NOT include markdown blocks, reasoning, backticks, or any other wrapper text. Just the raw valid JSON array.`;

    let seedUrls = [];
    try {
      const completionText = await extractSchema("Goal discovery context", discoveryPrompt, nemotronKey, 'json');
      if (Array.isArray(completionText)) {
        seedUrls = completionText.filter(u => typeof u === 'string' && u.startsWith('http')).slice(0, 3);
      }
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
        // Extract relevant deep links from seed page
        const extractLinksPrompt = `Read this page markdown and extract all relevant hyperlinks matching or pointing to pages related to: "${workflow.goal}".
Return ONLY a JSON array of string URLs. Do NOT include markdown blocks, code blocks, or text. Just the raw valid JSON array.`;
        const deepLinks = await extractSchema(markdown, extractLinksPrompt, nemotronKey, 'json');
        return { url, success: true, deepLinks: Array.isArray(deepLinks) ? deepLinks : [] };
      } catch (err) {
        return { url, success: false, reason: err.message || String(err) };
      }
    });

    // Seed URLs run concurrently
    const seedScrapeResults = await runWithConcurrencyLimit(seedScrapeTasks, 5);
    
    let allDeepLinks = [];
    let successfulSeedCount = 0;

    for (const r of seedScrapeResults) {
      if (r.success) {
        successfulSeedCount++;
        workflow.urls_scraped++;
        // filter & normalize deep links
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

    // --- STEP 3: Deep Scraping Discovered Links ---
    workflow.current_step = 3;
    await saveWorkflowState(workflow);

    // Filter to make sure total URLs scraped across the entire workflow does not exceed 8.
    // We already scraped successfulSeedCount URLs.
    const remainingUrlQuota = Math.max(0, 8 - workflow.urls_scraped);
    const deepLinksToScrape = allDeepLinks.slice(0, remainingUrlQuota);

    workflow.urls_discovered = seedUrls.length + allDeepLinks.length;
    await saveWorkflowState(workflow);

    const deepScrapeTasks = deepLinksToScrape.map((url) => async () => {
      try {
        const markdown = await scrapeWithRetry(url, firecrawlKey);
        // Extract matching content schema from deep page matching user's original goal
        let extractionPrompt, formatType;
        if (workflow.format === 'text') {
          extractionPrompt = `Extract information matching this goal: "${workflow.goal}".\nReturn the answer as clean, readable plain text. No additional explanations.`;
          formatType = 'text';
        } else {
          extractionPrompt = `Extract information matching this goal: "${workflow.goal}".\nReturn ONLY a valid JSON object or JSON array containing the extracted structured data. No additional explanations.`;
          formatType = 'json';
        }
        const data = await extractSchema(markdown, extractionPrompt, nemotronKey, formatType);
        return { url, success: true, data };
      } catch (err) {
        return { url, success: false, reason: err.message || String(err) };
      }
    });

    const deepScrapeResults = await runWithConcurrencyLimit(deepScrapeTasks, 5);

    let rawResults = [];
    for (const r of deepScrapeResults) {
      if (r.success) {
        workflow.urls_scraped++;
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
      // For text format, we don't deduplicate json fields. We just compile the text content.
      workflow.results = rawResults;
    } else {
      // Deduplicate logic: serialize each object, use unique set, filter duplicates
      const uniqueMap = new Map();
      rawResults.forEach(item => {
        // Find a key to deduplicate. If name/title/url exists, use that, otherwise use JSON.stringify
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

  } catch (globalErr) {
    console.error("Workflow failed globally:", globalErr);
    workflow.status = 'failed';
    workflow.completed_at = Date.now();
    await saveWorkflowState(workflow);
  }
}

app.listen(PORT, () => {
  console.log(`Nexus AI API server running on port ${PORT}`);
});
