import express from 'express';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

// Helper for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log('--- Starting Integration Tests for Nexus AI ---');

  let firecrawlCalls = 0;
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

    if (url === 'https://fail.com') {
      console.log(`[Mock Firecrawl] Simulating scrape failure for ${url} (Attempt ${urlsScraped[url]})`);
      return res.status(500).json({ success: false, error: 'Mock scraping error' });
    }

    console.log(`[Mock Firecrawl] Simulating scrape success for ${url}`);
    return res.json({
      success: true,
      data: {
        markdown: `Mock markdown content for ${url}`
      }
    });
  });

  mockApp.post('/nvidia', (req, res) => {
    anthropicCalls++;
    const { messages } = req.body;
    console.log('[Mock NVIDIA] Simulating Nemotron schema extraction');
    
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
      console.log('✅ Step 3 Passed: Both URLs processed and extracted successfully');
    } else {
      throw new Error('Step 3 Failed: Result count or status mismatched');
    }

    // -------------------------------------------------------------
    // STEP 4: Verify Error Handling & Retry Logic
    // -------------------------------------------------------------
    console.log('\n--- Verification Step 4: Error Handling & Retry Logic ---');
    
    // Reset call tracking
    urlsScraped['https://fail.com'] = 0;
    const startFirecrawlCalls = firecrawlCalls;

    const failScrapeRes = await fetch('http://localhost:3000/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: ['https://fail.com', 'https://success-after-fail.com'],
        prompt: 'Extract title'
      })
    });

    const failScrapeData = await failScrapeRes.json();
    console.log('Partial failure scrape response:', JSON.stringify(failScrapeData, null, 2));
    createdStateFiles.push(failScrapeData.state_id);

    // Verify retry count for https://fail.com
    const attempts = urlsScraped['https://fail.com'] || 0;
    console.log(`Firecrawl scrape attempts for https://fail.com: ${attempts}`);

    if (attempts !== 3) {
      throw new Error(`Expected exactly 3 scrape attempts for https://fail.com, but got ${attempts}`);
    }

    if (
      failScrapeData.total === 2 &&
      failScrapeData.succeeded === 1 &&
      failScrapeData.failed_count === 1 &&
      failScrapeData.failed[0].url === 'https://fail.com' &&
      failScrapeData.results[0].url === 'https://success-after-fail.com'
    ) {
      console.log('✅ Step 4 Passed: 3 retries performed for failing URL, and failures caught individually without stopping success URL');
    } else {
      throw new Error('Step 4 Failed: Expected failure counts/properties did not match');
    }

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
      console.log('\n🎉 ALL 5 INTEGRATION TESTS PASSED SUCCESSFULLY! Ready for deployment. 🎉');
      process.exit(0);
    } else {
      console.log('\n❌ Integration tests failed. Please review errors. ❌');
      process.exit(1);
    }
  }
}

runTests();
