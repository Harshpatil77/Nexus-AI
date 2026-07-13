import { promises as fs } from 'fs';
import path from 'path';
import { extractSchema } from './extractor.js';
import { runWithConcurrencyLimit, smartScrape } from './scraper.js';
import { trackEvent } from '../analytics/analytics.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function discoverSeedUrls(goal, firecrawlKey) {
  const searchUrl = process.env.FIRECRAWL_SEARCH_API_URL || 'https://api.firecrawl.dev/v1/search';
  const response = await fetch(searchUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: goal, limit: 3, scrapeOptions: { formats: ['markdown'] } })
  });
  if (!response.ok) throw new Error(`Firecrawl search failed: ${response.status}`);
  const json = await response.json();
  if (!json.success || !Array.isArray(json.data)) throw new Error('Firecrawl search returned no results');
  return json.data
    .filter(item => typeof item?.url === 'string' && item.url.startsWith('http'))
    .slice(0, 3)
    .map(item => ({ url: item.url, markdown: item.markdown || '' }));
}

export async function saveWorkflowState(workflow) {
  try {
    const filePath = path.join(process.cwd(), `workflow_${workflow.workflow_id}.json`);
    await fs.writeFile(filePath, JSON.stringify(workflow, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to save workflow state for ${workflow.workflow_id}:`, error);
  }
}

export async function getWorkflowState(workflowId) {
  const filePath = path.join(process.cwd(), `workflow_${workflowId}.json`);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf-8'));
    } catch (error) {
      if (error.code === 'ENOENT') throw error;
      if (error instanceof SyntaxError && attempt === 0) {
        await delay(100);
        continue;
      }
      throw error;
    }
  }
}

function filterDeepLinks(links, seedUrls) {
  return links.filter(link => {
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
}

async function extractSeedData(workflow, seedResult, markdown, nemotronKey) {
  if (!markdown || markdown.length <= 50) return;
  try {
    const formatType = workflow.format === 'text' ? 'text' : 'json';
    const extractionPrompt = workflow.format === 'text'
      ? `Extract information matching this goal: "${workflow.goal}". Return clean readable plain text. Be specific and detailed.`
      : `Extract information matching this goal: "${workflow.goal}". Return ONLY a valid JSON object or array. No explanation.`;
    const seedData = await extractSchema(markdown, extractionPrompt, nemotronKey, formatType);
    if (!seedData) return;
    if (workflow.format === 'text') workflow.results.push({ url: seedResult.url, text: seedData, source: 'seed' });
    else if (Array.isArray(seedData)) seedData.forEach(item => workflow.results.push(item));
    else if (typeof seedData === 'object') workflow.results.push(seedData);
    await saveWorkflowState(workflow);
  } catch (error) {
    console.log('Seed extraction failed:', error.message);
  }
}

export async function runWorkflowAsync(workflow, depth, firecrawlKey, nemotronKey, userHash, sessionId) {
  try {
    workflow.current_step = 1;
    await saveWorkflowState(workflow);
    let seedResults;
    try {
      seedResults = await discoverSeedUrls(workflow.goal, firecrawlKey);
    } catch (error) {
      workflow.status = 'failed';
      workflow.failed.push({ step: 1, reason: error.message || String(error) });
      workflow.completed_at = Date.now();
      await saveWorkflowState(workflow);
      return;
    }
    if (!seedResults.length) {
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

    workflow.current_step = 2;
    await saveWorkflowState(workflow);
    const seedScrapeResults = [];
    let allDeepLinks = [];
    for (const seedResult of seedResults) {
      try {
        const markdown = seedResult.markdown;
        const seedScrapeResult = { url: seedResult.url, markdown, tierUsed: null, success: true, deepLinks: [] };
        if (markdown && markdown.length > 50 && depth === 2) {
          try {
            const links = await extractSchema(markdown, `Extract all relevant URLs from this page that relate to: "${workflow.goal}". Return ONLY a JSON array of URL strings. No markdown. No explanation. Just the raw JSON array.`, nemotronKey, 'json');
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
        await extractSeedData(workflow, seedResult, markdown, nemotronKey);
        seedScrapeResults.push(seedScrapeResult);
        workflow.urls_scraped++;
      } catch (error) {
        workflow.failed.push({ url: seedResult.url, step: 2, reason: error.message || String(error) });
      }
    }
    workflow.steps_completed.push(2);
    await saveWorkflowState(workflow);

    allDeepLinks = filterDeepLinks(allDeepLinks, seedUrls);
    workflow.current_step = 3;
    await saveWorkflowState(workflow);
    const remainingUrlQuota = Math.max(0, 8 - workflow.urls_scraped);
    const deepLinksToScrape = depth === 2 ? allDeepLinks.slice(0, remainingUrlQuota) : [];
    workflow.urls_discovered = depth === 2 ? seedUrls.length + allDeepLinks.length : seedUrls.length;
    await saveWorkflowState(workflow);

    const pagesToExtract = depth === 1
      ? seedScrapeResults.filter(result => result.success).map(result => ({ url: result.url, markdown: result.markdown, tierUsed: result.tierUsed, alreadyScraped: true }))
      : deepLinksToScrape.map(url => ({ url, alreadyScraped: false }));
    const deepScrapeTasks = pagesToExtract.map(page => async () => {
      try {
        const scrape = page.alreadyScraped ? { markdown: page.markdown, tierUsed: page.tierUsed } : await smartScrape(page.url, firecrawlKey);
        const formatType = workflow.format === 'text' ? 'text' : 'json';
        const extractionPrompt = workflow.format === 'text'
          ? `Extract information matching this goal: "${workflow.goal}".\nReturn the answer as clean, readable plain text. No additional explanations.`
          : `Extract information matching this goal: "${workflow.goal}".\nReturn ONLY a valid JSON object or JSON array containing the extracted structured data. No additional explanations.`;
        const data = await extractSchema(scrape.markdown, extractionPrompt, nemotronKey, formatType);
        return { url: page.url, success: true, data, tierUsed: scrape.tierUsed, alreadyScraped: page.alreadyScraped };
      } catch (error) {
        return { url: page.url, success: false, reason: error.message || String(error) };
      }
    });
    const deepScrapeResults = await runWithConcurrencyLimit(deepScrapeTasks, 5);
    const rawResults = [];
    for (const result of deepScrapeResults) {
      if (!result.success) {
        workflow.failed.push({ url: result.url, step: 3, reason: result.reason });
        continue;
      }
      if (!result.alreadyScraped) workflow.urls_scraped++;
      if (workflow.format === 'text') rawResults.push({ url: result.url, text: result.data });
      else if (Array.isArray(result.data)) result.data.forEach(item => rawResults.push(item));
      else if (result.data && typeof result.data === 'object') rawResults.push(result.data);
    }
    workflow.steps_completed.push(3);
    await saveWorkflowState(workflow);

    workflow.current_step = 4;
    await saveWorkflowState(workflow);
    const allRawResults = [...workflow.results, ...rawResults];
    if (workflow.format === 'text') workflow.results = allRawResults;
    else {
      const uniqueMap = new Map();
      allRawResults.forEach(item => {
        const key = item.name || item.title || item.url || JSON.stringify(item);
        if (!uniqueMap.has(key)) uniqueMap.set(key, item);
      });
      workflow.results = Array.from(uniqueMap.values());
    }

    if (workflow.results.length > 1) {
      try {
        const combinedContent = workflow.format === 'text'
          ? workflow.results.map(result => result.text || JSON.stringify(result)).join('\n\n---\n\n')
          : JSON.stringify(workflow.results, null, 2);
        const synthesisPrompt = workflow.format === 'text'
          ? `You have collected research from multiple web pages about this goal: "${workflow.goal}". Here is all the collected data:\n${combinedContent}\n\nNow write ONE clean, unified, well-structured summary that directly answers the goal. Remove duplicates. Be specific and detailed. Use clear headings and numbered lists where helpful. If specific data like pricing or founding team is not found in the content, instead of saying "not available", write the source URL where this data can be found so the user can check manually.`
          : `You have collected JSON data from multiple web pages about: "${workflow.goal}". Data: ${combinedContent}\n\nReturn ONE clean JSON array combining all unique results. Remove duplicates. Keep only fields relevant to the goal. If specific data like pricing or founding team is not found in the content, replace any "not available" value with the source URL where the user can check manually.`;
        const synthesized = await extractSchema(combinedContent, synthesisPrompt, nemotronKey, workflow.format);
        if (synthesized) {
          workflow.results = workflow.format === 'text'
            ? [{ url: 'synthesized', text: synthesized, source: 'synthesis', sources_count: workflow.urls_scraped }]
            : Array.isArray(synthesized) ? synthesized : [synthesized];
        }
      } catch (error) {
        console.log('Synthesis failed, keeping individual results:', error.message);
      }
    }
    workflow.steps_completed.push(4);
    workflow.status = 'completed';
    workflow.completed_at = Date.now();
    await saveWorkflowState(workflow);
    await trackEvent('workflow_completed', userHash, sessionId, {
      workflow_id: workflow.workflow_id,
      duration: workflow.completed_at - workflow.created_at,
      urls_discovered: workflow.urls_discovered,
      urls_scraped: workflow.urls_scraped,
      results_count: workflow.results.length
    });
  } catch (error) {
    console.error('Workflow failed globally:', error);
    workflow.status = 'failed';
    workflow.completed_at = Date.now();
    await saveWorkflowState(workflow);
    await trackEvent('workflow_failed', userHash, sessionId, {
      workflow_id: workflow.workflow_id,
      duration: workflow.completed_at - workflow.created_at,
      error: error.message || String(error)
    });
  }
}
