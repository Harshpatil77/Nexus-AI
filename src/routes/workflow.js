import express from 'express';
import crypto from 'crypto';
import { getWorkflowState, runWorkflowAsync, saveWorkflowState } from '../workflow.js';
import { trackEvent } from '../../analytics/analytics.js';

const workflowRouter = express.Router();
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

workflowRouter.get('/workflow/:workflow_id', async (req, res) => {
  if (!uuidRegex.test(req.params.workflow_id)) return res.status(400).json({ error: 'Invalid workflow_id format' });
  try {
    res.status(200).json(await getWorkflowState(req.params.workflow_id));
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: 'Workflow not found' });
    res.status(500).json({ error: 'Failed to read workflow state' });
  }
});

workflowRouter.post('/workflow', async (req, res) => {
  const { goal, depth, format } = req.body;
  if (!goal || typeof goal !== 'string' || goal.trim() === '') return res.status(400).json({ error: 'goal must be a non-empty string' });
  let targetDepth = parseInt(depth, 10);
  if (isNaN(targetDepth) || targetDepth < 1 || targetDepth > 2) targetDepth = 2;
  const targetFormat = format === 'text' ? 'text' : 'json';
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const nemotronKey = process.env.NVIDIA_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!firecrawlKey || !nemotronKey) return res.status(500).json({ error: 'Server configuration error: Missing API keys' });
  const workflowId = crypto.randomUUID();
  const workflow = { workflow_id: workflowId, status: 'processing', goal, format: targetFormat, current_step: 1, steps_completed: [], urls_discovered: 0, urls_scraped: 0, results: [], failed: [], created_at: Date.now(), completed_at: null };
  await saveWorkflowState(workflow);
  await trackEvent('workflow_started', req.userHash, req.sessionId, { workflow_id: workflowId, goal, format: targetFormat });
  runWorkflowAsync(workflow, targetDepth, firecrawlKey, nemotronKey, req.userHash, req.sessionId);
  res.status(201).json({ workflow_id: workflowId, status: 'processing', goal });
});

export default workflowRouter;
