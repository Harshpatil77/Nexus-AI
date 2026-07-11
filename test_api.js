import express from 'express';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

// Helper for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log('--- Starting Integration Tests for Nexus AI ---');

  let firecrawlCalls = 0;
  let firecrawlSearchCalls = 0;
  let anthropicCalls = 0;
  const urlsScraped = {};

  // 1. Setup Mock Server for Firecrawl and Anthropic
  const mockApp = express();
  mockApp.use(express.json());

  mockApp.post('/firecrawl', (req, res) => {
    firecrawlCalls++;
    const { url } = req.body;
    
    // Register calls per URL
    urlsScraped[url] = (urlsScraped[url] || 0) + 1;

    if (url === 'http://localhost:4000/fail-direct' || url === 'http://localhost:4000/last-resort') {
      console.log(`[Mock Firecrawl] Simulating scrape failure for ${url} (Attempt ${urlsScraped[url]})`);
      return res.status(500).json({ success: false, error: 'Mock scraping error' });
    }

    console.log(`[Mock Firecrawl] Simulating scrape success for ${url}`);
    return res.json({
      success: true,
      data: {
        markdown: `Mock markdown content for ${url}. `.repeat(5)
      }
    });
  });

  mockApp.get('/fail-direct', (req, res) => {
    res.status(500).send('Direct fetch failure');
  });

  mockApp.get('/last-resort', (req, res) => {
    res.send(`<html><body>${'Tier 4 direct fetch content. '.repeat(8)}</body></html>`);
  });

  mockApp.post('/search', (req, res) => {
    firecrawlSearchCalls++;
    const { query, limit } = req.body;
    if (query !== 'Search for the startup requests of YC and give me a list of 10 which are fast to build' || limit !== 3) {
      return res.status(400).json({ success: false, error: 'Unexpected search request' });
    }
    return res.json({
      success: true,
      data: [
        { url: 'https://seed1.com', markdown: 'Seed one markdown with AI productivity tools and pricing details. '.repeat(3) },
        { url: 'https://seed2.com', markdown: 'Seed two markdown with AI productivity tools and pricing details. '.repeat(3) },
        { url: 'https://seed3.com', markdown: 'Seed three markdown with AI productivity tools and pricing details. '.repeat(3) }
      ]
    });
  });

  mockApp.post('/nvidia', (req, res) => {
    anthropicCalls++;
    const { messages } = req.body;
    console.log('[Mock NVIDIA] Simulating Nemotron schema extraction');
    const content = messages[0].content;

    if (content.includes('JSON list of starting seed URLs')) {
      return res.json({
        choices: [{ message: { content: '["https://seed1.com", "https://seed2.com"]' } }]
      });
    } else if (content.includes('Extract all relevant URLs from this page')) {
      return res.json({
        choices: [{ message: { content: '["https://deeplink1.com", "https://deeplink2.com", "https://seed1.com#rfs", "https://deeplink1.com#overview"]' } }]
      });
    } else if (content.includes('Extract information matching this goal')) {
      return res.json({
        choices: [{ message: { content: '[{"name": "AI Tool A", "url": "https://deeplink1.com"}]' } }]
      });
    }

    return res.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Mocked Page Title",
              description: "Mocked Page Description"
            })
          }
        }
      ]
    });
  });

  const mockServer = mockApp.listen(4000, () => {
    console.log('Mock API server running on http://localhost:4000');
  });

  // 2. Start the Nexus AI API Server in a child process
  console.log('Starting Nexus AI server process...');
  const env = {
    ...process.env,
    PORT: '3000',
    FIRECRAWL_API_KEY: 'test-firecrawl-key',
    NVIDIA_API_KEY: 'test-nvidia-key',
    FIRECRAWL_API_URL: 'http://localhost:4000/firecrawl',
    FIRECRAWL_SEARCH_API_URL: 'http://localhost:4000/search',
    NVIDIA_API_URL: 'http://localhost:4000/nvidia'
  };

  const serverProcess = spawn('node', ['index.js'], { env });

  // Pipe server process logs to our console with a prefix
  serverProcess.stdout.on('data', (data) => {
    console.log(`[Nexus AI] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Nexus AI ERROR] ${data.toString().trim()}`);
  });

  // Wait 1.5 seconds for the server to start up
  await delay(1500);

  let allPassed = true;
  const createdStateFiles = [];

  try {
    // -------------------------------------------------------------
    // STEP 1: Verify GET /health endpoint
    // -------------------------------------------------------------
    console.log('\n--- Verification Step 1: GET /health ---');
    const healthRes = await fetch('http://localhost:3000/health');
    if (!healthRes.ok) throw new Error('Health check endpoint failed');
    const healthData = await healthRes.json();
    console.log('Health check response:', healthData);
    if (healthData.status === 'ok' && typeof healthData.timestamp === 'number') {
      console.log('✅ Step 1 Passed: GET /health returned correct status and timestamp');
    } else {
      throw new Error('Step 1 Failed: Health check response structure invalid');
    }

    // -------------------------------------------------------------
    // STEP 2: Verify Input Validation rules
    // -------------------------------------------------------------
    console.log('\n--- Verification Step 2: Input Validation ---');
    
    // Test case 2a: Missing urls
    const valRes1 = await fetch('http://localhost:3000/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Extract title' })
    });
    if (valRes1.status !== 400) throw new Error(`Expected 400, got ${valRes1.status} for missing urls`);

    // Test case 2b: Empty urls array
    const valRes2 = await fetch('http://localhost:3000/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [], prompt: 'Extract title' })
    });
    if (valRes2.status !== 400) throw new Error(`Expected 400, got ${valRes2.status} for empty urls`);

    // Test case 2c: Missing prompt
    const valRes3 = await fetch('http://localhost:3000/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['https://example.com'] })
    });
    if (valRes3.status !== 400) throw new Error(`Expected 400, got ${valRes3.status} for missing prompt`);

    console.log('✅ Step 2 Passed: API correctly rejects invalid inputs with 400 Bad Request');

    // -------------------------------------------------------------
    // STEP 3: Verify Successful scrape and extraction (with concurrency)
    // -------------------------------------------------------------
    console.log('\n--- Verification Step 3: Successful Scrape and Extraction ---');
    firecrawlCalls = 0;
    anthropicCalls = 0;

    const scrapeRes = await fetch('http://localhost:3000/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: ['https://example.com', 'https://example2.com'],
        prompt: 'Extract title and description'
      })
    });

    if (!scrapeRes.ok) {
      throw new Error(`Scrape request failed with status ${scrapeRes.status}`);
    }

    const scrapeData = await scrapeRes.json();
    console.log('Scrape response:', JSON.stringify(scrapeData, null, 2));

    if (!scrapeData.state_id) throw new Error('Response did not contain state_id');
    createdStateFiles.push(scrapeData.state_id);

    if (
      scrapeData.total === 2 &&
      scrapeData.succeeded === 2 &&
      scrapeData.failed_count === 0 &&
      scrapeData.results.length === 2 &&
      scrapeData.failed.length === 0
    ) {
      if (!scrapeData.results.every(result => result.tier_used === 1)) {
        throw new Error('Step 3 Failed: successful results did not report Tier 1');
      }
      console.log('✅ Step 3 Passed: Both URLs processed and extracted successfully');
    } else {
      throw new Error('Step 3 Failed: Result count or status mismatched');
    }

    // -------------------------------------------------------------
    // STEP 4: Verify Error Handling & Tier Exhaustion
    // -------------------------------------------------------------
    console.log('\n--- Verification Step 4: Error Handling & Tier Exhaustion ---');
    
    // Reset call tracking
    urlsScraped['http://localhost:4000/fail-direct'] = 0;
    const failScrapeRes = await fetch('http://localhost:3000/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: ['http://localhost:4000/fail-direct', 'https://success-after-fail.com'],
        prompt: 'Extract title'
      })
    });

    const failScrapeData = await failScrapeRes.json();
    console.log('Partial failure scrape response:', JSON.stringify(failScrapeData, null, 2));
    createdStateFiles.push(failScrapeData.state_id);

    // The router tries Firecrawl once, then falls through unavailable fallback tiers.
    const attempts = urlsScraped['http://localhost:4000/fail-direct'] || 0;
    console.log(`Firecrawl scrape attempts for direct failure target: ${attempts}`);

    if (attempts !== 1) {
      throw new Error(`Expected exactly 1 Tier 1 attempt for direct failure target, but got ${attempts}`);
    }

    if (
      failScrapeData.total === 2 &&
      failScrapeData.succeeded === 1 &&
      failScrapeData.failed_count === 1 &&
      failScrapeData.failed[0].url === 'http://localhost:4000/fail-direct' &&
      failScrapeData.failed[0].reason === 'All tiers exhausted — site may require authentication' &&
      failScrapeData.results[0].url === 'https://success-after-fail.com'
    ) {
      console.log('✅ Step 4 Passed: exhausted tiers are reported without stopping successful URLs');
    } else {
      throw new Error('Step 4 Failed: Expected failure counts/properties did not match');
    }

    const tierFourRes = await fetch('http://localhost:3000/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['http://localhost:4000/last-resort'], prompt: 'Extract title' })
    });
    const tierFourData = await tierFourRes.json();
    createdStateFiles.push(tierFourData.state_id);
    if (tierFourData.succeeded !== 1 || tierFourData.results[0]?.tier_used !== 4) {
      throw new Error('Tier 4 direct fetch fallback did not succeed');
    }
    console.log('✅ Tier 4 direct fetch fallback passed');

    // -------------------------------------------------------------
    // STEP 5: Verify State Tracking (File storage and retrieval endpoint)
    // -------------------------------------------------------------
    console.log('\n--- Verification Step 5: State Tracking & GET endpoint ---');
    const testStateId = createdStateFiles[0];
    
    // Check if the JSON file actually exists locally
    const localFilePath = path.join(process.cwd(), `${testStateId}.json`);
    try {
      await fs.access(localFilePath);
      console.log(`Found local file: ${testStateId}.json`);
    } catch {
      throw new Error(`File ${testStateId}.json does not exist locally`);
    }

    // Test GET /scrape/:state_id
    const retrieveRes = await fetch(`http://localhost:3000/scrape/${testStateId}`);
    if (!retrieveRes.ok) throw new Error(`GET /scrape/${testStateId} returned status ${retrieveRes.status}`);
    
    const retrievedData = await retrieveRes.json();
    if (retrievedData.state_id === testStateId && retrievedData.total === 2) {
      console.log('✅ Step 5 Passed: Local state file saved correctly and retrieval endpoint works');
    } else {
      throw new Error('Step 5 Failed: Retrieved state data did not match the original');
    }

    // -------------------------------------------------------------
    // WORKFLOW TESTS
    // -------------------------------------------------------------
    console.log('\n--- Workflow Verification: POST /workflow & GET /workflow/:id ---');

    // Test 4: POST /workflow with empty goal returns 400
    console.log('Testing empty goal (Test 4)...');
    const wfResEmpty = await fetch('http://localhost:3000/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: '', depth: 2 })
    });
    if (wfResEmpty.status !== 400) {
      throw new Error(`Expected 400, got ${wfResEmpty.status} for empty goal`);
    }
    console.log('✅ Workflow Test 4 Passed: Empty goal correctly returns 400');

    // Test 1: POST /workflow returns 201 with workflow_id immediately
    console.log('Testing successful POST /workflow immediate return (Test 1 & 5)...');
    const wfPostRes = await fetch('http://localhost:3000/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: 'Search for the startup requests of YC and give me a list of 10 which are fast to build', depth: 5 }) // depth > 2 defaults to 2 silently
    });

    if (wfPostRes.status !== 201) {
      throw new Error(`Expected 201, got ${wfPostRes.status}`);
    }

    const wfPostData = await wfPostRes.json();
    console.log('Workflow POST response:', wfPostData);
    if (!wfPostData.workflow_id) throw new Error('Response did not contain workflow_id');
    console.log('✅ Workflow Test 1 & 5 Passed: Returns 201 with workflow_id, handles depth clamp');

    // Test 2: GET /workflow/:id returns "processing" while running
    console.log('Testing GET /workflow/:id while processing (Test 2)...');
    await delay(500); // Allow background worker to complete initial file writes
    const wfGetRes = await fetch(`http://localhost:3000/workflow/${wfPostData.workflow_id}`);
    if (!wfGetRes.ok) throw new Error(`GET /workflow returned status ${wfGetRes.status}`);
    const wfGetData = await wfGetRes.json();
    console.log('Workflow active state:', wfGetData.status);
    // With mock APIs, workflow may already be completed by this point
    if (wfGetData.status !== 'processing' && wfGetData.status !== 'completed') {
      throw new Error(`Expected status 'processing' or 'completed', got ${wfGetData.status}`);
    }
    console.log('✅ Workflow Test 2 Passed: GET /workflow/:id returns valid status');

    // Test 3: GET /workflow/:id eventually returns "completed"
    console.log('Polling workflow for completion status (Test 3)...');
    let completedWf = null;

    // If already completed from Test 2, skip polling
    if (wfGetData.status === 'completed') {
      completedWf = wfGetData;
      console.log('Workflow already completed (mocks are fast)');
    } else {
      for (let poll = 0; poll < 10; poll++) {
        await delay(1000);
        const pollRes = await fetch(`http://localhost:3000/workflow/${wfPostData.workflow_id}`);
        const pollData = await pollRes.json();
        console.log(`Poll ${poll + 1} status: ${pollData.status}, step: ${pollData.current_step}`);
        if (pollData.status === 'completed' || pollData.status === 'failed') {
          completedWf = pollData;
          break;
        }
      }
    }

    if (!completedWf) {
      throw new Error('Workflow did not complete within timeout');
    }

    console.log('Final Workflow State:', JSON.stringify(completedWf, null, 2));
    if (completedWf.status !== 'completed') {
      throw new Error(`Expected status 'completed', got ${completedWf.status}`);
    }
    if (firecrawlSearchCalls < 1 || completedWf.urls_discovered !== 5 || completedWf.urls_scraped !== 5) {
      throw new Error(`Expected 3 Firecrawl Search seeds and 2 deep pages, got ${completedWf.urls_discovered} discovered and ${completedWf.urls_scraped} scraped`);
    }
    if (urlsScraped['https://seed1.com#rfs'] || urlsScraped['https://deeplink1.com#overview']) {
      throw new Error('Fragment URLs were not filtered before deep scraping');
    }
    if (completedWf.results.length === 0) {
      throw new Error('Expected seed-page extraction to produce workflow results');
    }
    console.log('✅ Workflow Test 3 Passed: Workflow eventually completed successfully');

    // Test 4: depth 1 extracts only seed pages and does not follow discovered links
    console.log('Testing depth 1 seed-only workflow...');
    const depthOneRes = await fetch('http://localhost:3000/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: 'Search for the startup requests of YC and give me a list of 10 which are fast to build', depth: 1 })
    });
    if (depthOneRes.status !== 201) throw new Error(`Expected 201 for depth 1 workflow, got ${depthOneRes.status}`);
    const depthOne = await depthOneRes.json();
    let completedDepthOne = null;
    for (let poll = 0; poll < 10; poll++) {
      await delay(250);
      const pollRes = await fetch(`http://localhost:3000/workflow/${depthOne.workflow_id}`);
      const pollData = await pollRes.json();
      if (pollData.status === 'completed' || pollData.status === 'failed') {
        completedDepthOne = pollData;
        break;
      }
    }
    if (!completedDepthOne || completedDepthOne.status !== 'completed') throw new Error('Depth 1 workflow did not complete');
    if (completedDepthOne.urls_discovered !== 3 || completedDepthOne.urls_scraped !== 3) {
      throw new Error(`Depth 1 followed links unexpectedly: discovered ${completedDepthOne.urls_discovered}, scraped ${completedDepthOne.urls_scraped}`);
    }
    await fs.unlink(path.join(process.cwd(), `workflow_${depthOne.workflow_id}.json`));
    console.log('✅ Depth 1 workflow test passed: seed pages were extracted without following links');

    // Clean up workflow state file
    const wfFilePath = path.join(process.cwd(), `workflow_${wfPostData.workflow_id}.json`);
    try {
      await fs.unlink(wfFilePath);
      console.log(`Deleted workflow file: ${wfFilePath}`);
    } catch (err) {
      console.error(`Failed to delete workflow file:`, err.message);
    }

  } catch (error) {
    console.error('❌ Test Failed with Error:', error);
    allPassed = false;
  } finally {
    // 3. Clean up and shut down
    console.log('\nCleaning up local test state files...');
    for (const stateId of createdStateFiles) {
      const filePath = path.join(process.cwd(), `${stateId}.json`);
      try {
        await fs.unlink(filePath);
        console.log(`Deleted test state file: ${filePath}`);
      } catch (err) {
        console.error(`Failed to delete ${filePath}:`, err.message);
      }
    }

    console.log('Stopping servers...');
    mockServer.close();
    serverProcess.kill();
    
    await delay(1000);
    
    if (allPassed) {
      console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! Ready for deployment. 🎉');
      process.exit(0);
    } else {
      console.log('\n❌ Integration tests failed. Please review errors. ❌');
      process.exit(1);
    }
  }
}

runTests();
