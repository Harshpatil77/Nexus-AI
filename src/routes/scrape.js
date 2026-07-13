import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { extractSchema } from '../extractor.js';
import { runWithConcurrencyLimit, smartScrape } from '../scraper.js';
import { trackEvent } from '../../analytics/analytics.js';

const scrapeRouter = express.Router();

function validateScrapeRequest(req, res) {
  const { urls, prompt, format } = req.body;
  const outFormat = format || 'json';
  if (!Array.isArray(urls)) {
    res.status(400).json({ error: 'urls must be an array' });
    return null;
  }
  if (urls.length < 1) {
    res.status(400).json({ error: 'urls array must contain at least 1 item' });
    return null;
  }
  if (urls.length > 5) {
    res.status(400).json({ error: 'Free tier is limited to 5 URLs per request. Need more? Contact patilharsh310708@gmail.com to unlock higher limits.', limit: 5, submitted: urls.length });
    return null;
  }
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    res.status(400).json({ error: 'prompt must be a non-empty string' });
    return null;
  }
  if (!['json', 'text'].includes(outFormat)) {
    res.status(400).json({ error: 'format must be either "json" or "text"' });
    return null;
  }
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const nemotronKey = process.env.NVIDIA_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!firecrawlKey || !nemotronKey) {
    res.status(500).json({ error: 'Server configuration error: Missing API keys' });
    return null;
  }
  return { urls, prompt, outFormat, firecrawlKey, nemotronKey };
}

async function saveScrapeOutput(output) {
  try {
    await fs.writeFile(path.join(process.cwd(), `${output.state_id}.json`), JSON.stringify(output, null, 2), 'utf-8');
    console.log('4. File saved:', Date.now());
  } catch (error) {
    console.error(`Failed to save state file for ${output.state_id}:`, error);
  }
}

scrapeRouter.post('/scrape', async (req, res) => {
  const request = validateScrapeRequest(req, res);
  if (!request) return;
  const { urls, prompt, outFormat, firecrawlKey, nemotronKey } = request;
  const stateId = crypto.randomUUID();
  const tasks = urls.map(url => async () => {
    try {
      console.log('1. Starting Firecrawl:', Date.now());
      const { markdown, tierUsed } = await smartScrape(url, firecrawlKey);
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
  const results = taskResults.filter(item => item.success).map(item => ({ url: item.url, tier_used: item.tierUsed, data: item.data }));
  const failed = taskResults.filter(item => !item.success).map(item => ({ url: item.url, reason: item.reason }));
  const output = { state_id: stateId, format: outFormat, results, failed, total: urls.length, succeeded: results.length, failed_count: failed.length };
  await saveScrapeOutput(output);
  await trackEvent(output.failed_count === output.total ? 'scrape_failed' : 'scrape_completed', req.userHash, req.sessionId, {
    stateId, format: outFormat, url_count: urls.length, succeeded: output.succeeded, failed_count: output.failed_count,
    error: output.failed_count === output.total ? (output.failed[0]?.reason || 'All scrapes failed') : undefined
  });
  res.status(200).json(output);
});

scrapeRouter.post('/scrape-stream', async (req, res) => {
  const request = validateScrapeRequest(req, res);
  if (!request) return;
  const { urls, prompt, outFormat, firecrawlKey, nemotronKey } = request;
  const compareMode = req.body.compare === true;
  const stateId = crypto.randomUUID();
  await trackEvent('scrape_started', req.userHash, req.sessionId, { format: outFormat, compare: compareMode, url_count: urls.length, prompt });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const scrapeTasks = urls.map(url => async () => {
    try {
      console.log('1. Starting Firecrawl:', Date.now());
      const { markdown, tierUsed } = await smartScrape(url, firecrawlKey);
      console.log('2. Firecrawl done:', Date.now());
      return { url, markdown, tierUsed, success: true };
    } catch (error) {
      console.log('Scrape failed:', error.message);
      return { url, reason: error.message || String(error), success: false };
    }
  });
  const scrapeResults = await runWithConcurrencyLimit(scrapeTasks, 5);
  const results = [];
  const failed = [];
  const scrapedOk = [];
  const scrapedMarkdowns = [];
  let completedCount = 0;
  for (const result of scrapeResults) {
    if (result.success) {
      scrapedOk.push(result);
      scrapedMarkdowns.push({ url: result.url, markdown: result.markdown, tierUsed: result.tierUsed });
    } else failed.push({ url: result.url, reason: result.reason });
    completedCount++;
    res.write(`data: ${JSON.stringify({ type: 'progress', completed: completedCount, total: urls.length, phase: 'scraping', current_url: result.url, result: { url: result.url, tier_used: result.tierUsed, success: result.success } })}\n\n`);
  }
  if (compareMode && scrapedOk.length) {
    res.write(`data: ${JSON.stringify({ type: 'progress', completed: completedCount, total: urls.length, phase: 'analyzing', current_url: 'Combining all content for comparison...', result: { url: 'compare', success: true } })}\n\n`);
    const combinedMarkdown = scrapedMarkdowns.map((source, index) => `--- SOURCE ${index + 1}: ${source.url} ---\n${source.markdown}`).join('\n\n');
    try {
      const data = await extractSchema(combinedMarkdown, prompt, nemotronKey, outFormat);
      console.log('3. Compare extraction done:', Date.now());
      results.push({ url: 'combined-comparison', sources: scrapedMarkdowns.map(source => source.url), tier_used: scrapedMarkdowns.map(source => source.tierUsed), data });
    } catch (error) {
      console.log('Compare extraction failed:', error.message);
      failed.push({ url: 'combined-comparison', reason: error.message || String(error) });
    }
  } else {
    for (const result of scrapedOk) {
      try {
        const data = await extractSchema(result.markdown, prompt, nemotronKey, outFormat);
        console.log('3. Extraction done:', Date.now());
        results.push({ url: result.url, tier_used: result.tierUsed, data });
      } catch (error) {
        console.log('Extraction failed:', error.message);
        failed.push({ url: result.url, reason: error.message || String(error) });
      }
    }
  }
  const output = { state_id: stateId, format: outFormat, compare: compareMode, results, failed, total: urls.length, succeeded: results.length, failed_count: failed.length };
  await saveScrapeOutput(output);
  await trackEvent(output.failed_count === output.total ? 'scrape_failed' : 'scrape_completed', req.userHash, req.sessionId, {
    stateId, format: outFormat, compare: compareMode, url_count: urls.length, succeeded: output.succeeded, failed_count: output.failed_count,
    error: output.failed_count === output.total ? (output.failed[0]?.reason || 'All scrapes failed') : undefined,
    domains: results.map(result => {
      try {
        return result.url && result.url.startsWith('http') ? new URL(result.url).hostname : 'unknown';
      } catch {
        return 'unknown';
      }
    })
  });
  res.write(`data: ${JSON.stringify({ type: 'done', state_id: stateId, succeeded: results.length, failed_count: failed.length })}\n\n`);
  res.end();
});

scrapeRouter.get('/scrape/:state_id', async (req, res) => {
  const { state_id } = req.params;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(state_id)) return res.status(400).json({ error: 'Invalid state_id format' });
  try {
    const data = await fs.readFile(path.join(process.cwd(), `${state_id}.json`), 'utf-8');
    res.status(200).json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: 'Scrape results not found for this state_id' });
    res.status(500).json({ error: 'Failed to read results' });
  }
});

export default scrapeRouter;
